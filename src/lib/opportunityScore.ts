import type { ScoreLevel } from "../components/common";
import type { RelativeStrengthSignal, TrendSignal } from "./indicators";

/**
 * The fixed timeframes the confluence score is always built from —
 * intentionally a separate type from the chart's `Timeframe`
 * (types/index.ts) even though the two currently list the same values, so
 * a future chart-only granularity wouldn't have to be included in the
 * score's math just because it's selectable on the chart.
 */
export type SignalTimeframe = "1h" | "4h" | "1d" | "1w" | "1M";

export type MacdSignal = "bullish" | "bearish" | "neutral";
export type BbPosition = "above-upper" | "below-lower" | "inside";

export interface OpportunityScoreInput {
  rsi: number | null;
  macd: MacdSignal;
  bbPosition: BbPosition | null;
  /** Was the last candle's volume a real spike (>= 1.5x trailing average)?
   * A support/resistance touch backed by unusually high volume is a more
   * meaningful signal than the same touch on quiet volume. */
  volumeSpike?: boolean;
  /** 20/50-SMA trend context — used to temper RSI's mean-reversion call
   * instead of taking an oversold/overbought read at face value. */
  trend?: TrendSignal;
  /** Token's own move vs. BTC's over the same window — tells apart a real
   * standout from just following the market. */
  relativeStrength?: RelativeStrengthSignal;
}

export interface OpportunityScoreResult {
  score: number; // 0-100, 50 = neutral, 100 = strongest buy read, 0 = strongest sell read
  level: ScoreLevel;
  breakdown: string[];
}

function classifyScore(score: number): ScoreLevel {
  if (score >= 80) return "strongBuy";
  if (score >= 60) return "buy";
  if (score >= 40) return "neutral";
  if (score >= 20) return "sell";
  return "strongSell";
}

/**
 * Combines RSI + MACD + Bollinger position + trend + relative strength
 * into a single 0-100 read, starting from a neutral 50 baseline. Each
 * signal only ever nudges the score — no single indicator can swing it
 * from one extreme to the other on its own, which is the same
 * "confluence over any one number" idea behind the Destaques section.
 */
export function computeOpportunityScore(input: OpportunityScoreInput): OpportunityScoreResult {
  let score = 50;
  const breakdown: string[] = [];

  if (input.rsi !== null) {
    let rsiContribution = (50 - input.rsi) * 0.6;
    // Buying an oversold RSI against a downtrend (or selling an
    // overbought RSI against an uptrend) is the classic "falling knife"
    // trap — that push only counts in full when the trend agrees with it.
    const fightingTrend =
      (rsiContribution > 0 && input.trend === "down") ||
      (rsiContribution < 0 && input.trend === "up");
    if (fightingTrend) rsiContribution *= 0.4;
    score += rsiContribution;

    const rsiLabel = input.rsi <= 30 ? "sobrevendido" : input.rsi >= 70 ? "sobrecomprado" : null;
    if (rsiLabel) {
      breakdown.push(
        fightingTrend
          ? `RSI ${input.rsi.toFixed(0)} (${rsiLabel}, atenuado pela tendência)`
          : `RSI ${input.rsi.toFixed(0)} (${rsiLabel})`,
      );
    } else {
      breakdown.push(`RSI ${input.rsi.toFixed(0)}`);
    }
  }

  if (input.macd === "bullish") {
    score += 15;
    breakdown.push("MACD em alta");
  } else if (input.macd === "bearish") {
    score -= 15;
    breakdown.push("MACD em baixa");
  } else {
    breakdown.push("MACD neutro");
  }

  if (input.bbPosition === "below-lower") {
    // Volume confirmation is the noisiest of these signals (a single
    // 1.5x-of-average threshold is easy to trigger on a low-liquidity
    // altcoin), so it only adds a small edge rather than a big swing.
    const points = input.volumeSpike ? 18 : 15;
    score += points;
    breakdown.push(
      input.volumeSpike
        ? "Preço abaixo da banda inferior (confirmado por volume)"
        : "Preço abaixo da banda inferior",
    );
  } else if (input.bbPosition === "above-upper") {
    const points = input.volumeSpike ? 18 : 15;
    score -= points;
    breakdown.push(
      input.volumeSpike
        ? "Preço acima da banda superior (confirmado por volume)"
        : "Preço acima da banda superior",
    );
  } else if (input.bbPosition === "inside") {
    breakdown.push("Dentro das bandas de Bollinger");
  }

  if (input.trend === "up") {
    score += 10;
    breakdown.push("Tendência de alta (SMA 20/50)");
  } else if (input.trend === "down") {
    score -= 10;
    breakdown.push("Tendência de baixa (SMA 20/50)");
  } else {
    breakdown.push("Sem tendência definida");
  }

  if (input.relativeStrength === "outperforming") {
    score += 8;
    breakdown.push("Performando acima do BTC");
  } else if (input.relativeStrength === "underperforming") {
    score -= 8;
    breakdown.push("Performando abaixo do BTC");
  } else {
    breakdown.push("Em linha com o BTC");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, level: classifyScore(score), breakdown };
}

/** Most frequent value in the list; ties go to whichever appears first (1h, being the most responsive timeframe, sorts first in every caller here). */
function majority<T extends string>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export interface TimeframeSignal {
  rsi: number;
  macd: MacdSignal;
  bbPosition: BbPosition;
  /** See OpportunityScoreInput.volumeSpike — same check, for this timeframe. */
  volumeSpike: boolean;
  /** See OpportunityScoreInput.trend — same check, for this timeframe. */
  trend: TrendSignal;
  /** See OpportunityScoreInput.relativeStrength — same check, for this timeframe. */
  relativeStrength: RelativeStrengthSignal;
}

/**
 * Combines RSI/MACD/Bollinger/trend/relative-strength across all 5
 * timeframes (1h/4h/1d/1w/1M) into one score, instead of reading a single
 * timeframe's snapshot: RSI is averaged, the rest go by majority vote
 * among the 5 (volume spike the same way — confirmed if a majority of
 * timeframes show one). This is what makes the score the same number
 * everywhere for a token — the watchlist row and the detail panel —
 * regardless of which timeframe the chart happens to have open, and a
 * steadier read than any one timeframe alone, weighing short-term (1h/4h)
 * against medium/long-term (1d/1w/1M) trend instead of just the first 3.
 */
export function computeConfluenceScore(
  byTimeframe: Record<SignalTimeframe, TimeframeSignal>,
): OpportunityScoreResult {
  const timeframes: SignalTimeframe[] = ["1h", "4h", "1d", "1w", "1M"];
  const avgRsi =
    timeframes.reduce((sum, tf) => sum + byTimeframe[tf].rsi, 0) / timeframes.length;
  const macd = majority(timeframes.map((tf) => byTimeframe[tf].macd));
  const bbPosition = majority(timeframes.map((tf) => byTimeframe[tf].bbPosition));
  const trend = majority(timeframes.map((tf) => byTimeframe[tf].trend));
  const relativeStrength = majority(timeframes.map((tf) => byTimeframe[tf].relativeStrength));
  const volumeSpikeCount = timeframes.filter((tf) => byTimeframe[tf].volumeSpike).length;

  return computeOpportunityScore({
    rsi: avgRsi,
    macd,
    bbPosition,
    volumeSpike: volumeSpikeCount > timeframes.length / 2,
    trend,
    relativeStrength,
  });
}
