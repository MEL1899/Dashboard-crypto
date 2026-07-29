import type { ScoreLevel } from "../components/common";

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
