import type { ScoreLevel } from "../components/common";
import type { BollingerBands, Candle, IndicatorPoint } from "../types";
import { bbSignal, calcMACD, macdSignal } from "./indicators";

export interface OpportunityScoreInput {
  rsi: number | null;
  macd: "bullish" | "bearish" | "neutral";
  bbPosition: "above-upper" | "below-lower" | "inside" | null;
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
    score += 15;
    breakdown.push("Preço abaixo da banda inferior");
  } else if (input.bbPosition === "above-upper") {
    score -= 15;
    breakdown.push("Preço acima da banda superior");
  } else if (input.bbPosition === "inside") {
    breakdown.push("Dentro das bandas de Bollinger");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, level: classifyScore(score), breakdown };
}

/**
 * Same computation as computeOpportunityScore, starting from raw candles/
 * indicator series instead of pre-extracted signals — shared by the detail
 * panel and the watchlist table's currently-open row so both show the
 * exact same number for the same token, instead of recomputing it slightly
 * differently in two places.
 */
export function computeOpportunityScoreFromMarket(
  candles: Candle[],
  rsi: IndicatorPoint[],
  bollinger: BollingerBands[],
): OpportunityScoreResult {
  const lastCandle = candles[candles.length - 1];
  const lastRsi = rsi[rsi.length - 1];
  const lastBb = bollinger[bollinger.length - 1];
  const macd = macdSignal(calcMACD(candles));
  const bbPosition = lastCandle && lastBb ? bbSignal(lastCandle.close, lastBb) : null;

  return computeOpportunityScore({
    rsi: lastRsi ? lastRsi.value : null,
    macd,
    bbPosition,
  });
}
