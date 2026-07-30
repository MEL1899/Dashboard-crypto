import { describe, expect, it } from "vitest";
import {
  computeConfluenceScore,
  computeOpportunityScore,
  type SignalTimeframe,
  type TimeframeSignal,
} from "./opportunityScore";

describe("computeOpportunityScore", () => {
  it("stays neutral when every signal is neutral", () => {
    const result = computeOpportunityScore({ rsi: 50, macd: "neutral", bbPosition: "inside" });
    expect(result.score).toBe(50);
    expect(result.level).toBe("neutral");
  });

  it("pushes toward strongBuy when every signal agrees bullish", () => {
    const result = computeOpportunityScore({
      rsi: 15,
      macd: "bullish",
      bbPosition: "below-lower",
    });
    expect(result.score).toBeGreaterThan(80);
    expect(result.level).toBe("strongBuy");
  });

  it("pushes toward strongSell when every signal agrees bearish", () => {
    const result = computeOpportunityScore({
      rsi: 85,
      macd: "bearish",
      bbPosition: "above-upper",
    });
    expect(result.score).toBeLessThan(20);
    expect(result.level).toBe("strongSell");
  });

  it("clamps to the 0-100 range", () => {
    const result = computeOpportunityScore({ rsi: 0, macd: "bullish", bbPosition: "below-lower" });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("ignores a null RSI instead of throwing", () => {
    const result = computeOpportunityScore({ rsi: null, macd: "neutral", bbPosition: null });
    expect(result.score).toBe(50);
  });
});

function bySignal(
  h1: TimeframeSignal,
  h4: TimeframeSignal,
  d1: TimeframeSignal,
  w1: TimeframeSignal,
  m1: TimeframeSignal,
): Record<SignalTimeframe, TimeframeSignal> {
  return { "1h": h1, "4h": h4, "1d": d1, "1w": w1, "1M": m1 };
}

describe("computeConfluenceScore", () => {
  it("averages RSI across the 5 timeframes instead of reading just one", () => {
    const neutral: TimeframeSignal = {
      rsi: 50,
      macd: "neutral",
      bbPosition: "inside",
      volumeSpike: false,
      trend: "neutral",
      relativeStrength: "inline",
    };
    const result = computeConfluenceScore(
      bySignal(
        { ...neutral, rsi: 30 },
        { ...neutral, rsi: 50 },
        { ...neutral, rsi: 70 },
        { ...neutral, rsi: 40 },
        { ...neutral, rsi: 60 },
      ),
    );
    // (30 + 50 + 70 + 40 + 60) / 5 = 50 -> same as an all-neutral read.
    expect(result.score).toBe(50);
  });

  it("takes the MACD/Bollinger signal that wins the majority of timeframes", () => {
    const result = computeConfluenceScore(
      bySignal(
        { rsi: 50, macd: "bullish", bbPosition: "inside", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "bullish", bbPosition: "inside", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "bullish", bbPosition: "inside", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "bearish", bbPosition: "inside", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "bearish", bbPosition: "inside", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
      ),
    );
    // 3 of 5 timeframes say bullish MACD -> score should move up, not stay neutral.
    expect(result.score).toBeGreaterThan(50);
  });

  it("a single timeframe can't swing the result on its own — needs the majority of the 5", () => {
    const result = computeConfluenceScore(
      bySignal(
        // 1h alone reads strongly bullish
        { rsi: 20, macd: "bullish", bbPosition: "below-lower", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        // 4h, 1d, 1w and 1M all read bearish
        { rsi: 60, macd: "bearish", bbPosition: "above-upper", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 65, macd: "bearish", bbPosition: "above-upper", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 62, macd: "bearish", bbPosition: "above-upper", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 68, macd: "bearish", bbPosition: "above-upper", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
      ),
    );
    // The 4-timeframe majority (bearish MACD, above-upper BB) should win out
    // over 1h looking bullish on its own.
    expect(result.score).toBeLessThan(50);
  });

  it("amplifies a Bollinger-band touch when a majority of timeframes confirm it with volume", () => {
    const withoutVolume = computeConfluenceScore(
      bySignal(
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
      ),
    );
    const withVolume = computeConfluenceScore(
      bySignal(
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: true, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: true, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: true, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false, trend: "neutral", relativeStrength: "inline" },
      ),
    );
    expect(withVolume.score).toBeGreaterThan(withoutVolume.score);
  });

  it("dampens an oversold RSI reading that fights a downtrend, instead of taking it at face value", () => {
    const base = { macd: "neutral", bbPosition: "inside", volumeSpike: false, relativeStrength: "inline" } as const;
    const inDowntrend = computeConfluenceScore(
      bySignal(
        { ...base, rsi: 20, trend: "down" },
        { ...base, rsi: 20, trend: "down" },
        { ...base, rsi: 20, trend: "down" },
        { ...base, rsi: 20, trend: "down" },
        { ...base, rsi: 20, trend: "down" },
      ),
    );
    const noTrend = computeConfluenceScore(
      bySignal(
        { ...base, rsi: 20, trend: "neutral" },
        { ...base, rsi: 20, trend: "neutral" },
        { ...base, rsi: 20, trend: "neutral" },
        { ...base, rsi: 20, trend: "neutral" },
        { ...base, rsi: 20, trend: "neutral" },
      ),
    );
    // Same oversold RSI, but fighting a confirmed downtrend should push the
    // score up by a lot less than it would with no trend context at all — a
    // falling knife shouldn't score the same as a dip in a flat market. The
    // downtrend's own -10 then pulls the total below neutral altogether.
    expect(inDowntrend.score).toBeLessThan(noTrend.score);
    expect(inDowntrend.score).toBeLessThan(50);
    expect(noTrend.score).toBeGreaterThan(50);
  });

  it("rewards outperforming BTC and penalizes underperforming it", () => {
    const base = { rsi: 50, macd: "neutral", bbPosition: "inside", volumeSpike: false, trend: "neutral" } as const;
    const outperforming = computeConfluenceScore(
      bySignal(
        { ...base, relativeStrength: "outperforming" },
        { ...base, relativeStrength: "outperforming" },
        { ...base, relativeStrength: "outperforming" },
        { ...base, relativeStrength: "inline" },
        { ...base, relativeStrength: "inline" },
      ),
    );
    const underperforming = computeConfluenceScore(
      bySignal(
        { ...base, relativeStrength: "underperforming" },
        { ...base, relativeStrength: "underperforming" },
        { ...base, relativeStrength: "underperforming" },
        { ...base, relativeStrength: "inline" },
        { ...base, relativeStrength: "inline" },
      ),
    );
    expect(outperforming.score).toBeGreaterThan(50);
    expect(underperforming.score).toBeLessThan(50);
  });
});
