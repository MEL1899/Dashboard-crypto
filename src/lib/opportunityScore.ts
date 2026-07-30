import type { ScoreLevel } from "../components/common";

/**
 * The 3 fixed timeframes the confluence score is always built from —
 * intentionally separate from the chart's `Timeframe` (types/index.ts),
 * which can offer more granularities (1w, 1M, ...) for display without the
 * score's math needing to change to match.
 */
export type SignalTimeframe = "1h" | "4h" | "1d";

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
 * Combines RSI + MACD + Bollinger position into a single 0-100 read,
 * starting from a neutral 50 baseline. Each signal only ever nudges the
 * score — no single indicator can swing it from one extreme to the other
 * on its own, which is the same "confluence over any one number" idea
 * behind the Destaques section.
 */
export function computeOpportunityScore(input: OpportunityScoreInput): OpportunityScoreResult {
  let score = 50;
  const breakdown: string[] = [];

  if (input.rsi !== null) {
    score += (50 - input.rsi) * 0.6;
    if (input.rsi <= 30) breakdown.push(`RSI ${input.rsi.toFixed(0)} (sobrevendido)`);
    else if (input.rsi >= 70) breakdown.push(`RSI ${input.rsi.toFixed(0)} (sobrecomprado)`);
    else breakdown.push(`RSI ${input.rsi.toFixed(0)}`);
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
    const points = input.volumeSpike ? 20 : 15;
    score += points;
    breakdown.push(
      input.volumeSpike
        ? "Preço abaixo da banda inferior (confirmado por volume)"
        : "Preço abaixo da banda inferior",
    );
  } else if (input.bbPosition === "above-upper") {
    const points = input.volumeSpike ? 20 : 15;
    score -= points;
    breakdown.push(
      input.volumeSpike
        ? "Preço acima da banda superior (confirmado por volume)"
        : "Preço acima da banda superior",
    );
  } else if (input.bbPosition === "inside") {
    breakdown.push("Dentro das bandas de Bollinger");
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
}

/**
 * Combines RSI/MACD/Bollinger across all 3 timeframes (1h/4h/1d) into one
 * score, instead of reading a single timeframe's snapshot: RSI is averaged,
 * MACD and Bollinger position go by majority vote among the 3 (volume spike
 * the same way — confirmed if at least 2 of 3 timeframes show one). This is
 * what makes the score the same number everywhere for a token — the
 * watchlist row and the detail panel — regardless of which timeframe the
 * chart happens to have open, and a steadier read than any one timeframe
 * alone.
 */
export function computeConfluenceScore(
  byTimeframe: Record<SignalTimeframe, TimeframeSignal>,
): OpportunityScoreResult {
  const timeframes: SignalTimeframe[] = ["1h", "4h", "1d"];
  const avgRsi =
    timeframes.reduce((sum, tf) => sum + byTimeframe[tf].rsi, 0) / timeframes.length;
  const macd = majority(timeframes.map((tf) => byTimeframe[tf].macd));
  const bbPosition = majority(timeframes.map((tf) => byTimeframe[tf].bbPosition));
  const volumeSpikeCount = timeframes.filter((tf) => byTimeframe[tf].volumeSpike).length;

  return computeOpportunityScore({
    rsi: avgRsi,
    macd,
    bbPosition,
    volumeSpike: volumeSpikeCount >= 2,
  });
}
