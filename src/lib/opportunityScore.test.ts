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

function bySignal(h1: TimeframeSignal, h4: TimeframeSignal, d1: TimeframeSignal): Record<SignalTimeframe, TimeframeSignal> {
  return { "1h": h1, "4h": h4, "1d": d1 };
}

describe("computeConfluenceScore", () => {
  it("averages RSI across the 3 timeframes instead of reading just one", () => {
    const neutral: TimeframeSignal = {
      rsi: 50,
      macd: "neutral",
      bbPosition: "inside",
      volumeSpike: false,
    };
    const result = computeConfluenceScore(
      bySignal(
        { ...neutral, rsi: 30 },
        { ...neutral, rsi: 50 },
        { ...neutral, rsi: 70 },
      ),
    );
    // (30 + 50 + 70) / 3 = 50 -> same as an all-neutral read.
    expect(result.score).toBe(50);
  });

  it("takes the MACD/Bollinger signal that wins 2 of 3 timeframes", () => {
    const result = computeConfluenceScore(
      bySignal(
        { rsi: 50, macd: "bullish", bbPosition: "inside", volumeSpike: false },
        { rsi: 50, macd: "bullish", bbPosition: "inside", volumeSpike: false },
        { rsi: 50, macd: "bearish", bbPosition: "inside", volumeSpike: false },
      ),
    );
    // 2 of 3 timeframes say bullish MACD -> score should move up, not stay neutral.
    expect(result.score).toBeGreaterThan(50);
  });

  it("a single timeframe can't swing the result on its own — needs the majority of the 3", () => {
    const result = computeConfluenceScore(
      bySignal(
        // 1h alone reads strongly bullish
        { rsi: 20, macd: "bullish", bbPosition: "below-lower", volumeSpike: false },
        // 4h and 1d both read bearish
        { rsi: 60, macd: "bearish", bbPosition: "above-upper", volumeSpike: false },
        { rsi: 65, macd: "bearish", bbPosition: "above-upper", volumeSpike: false },
      ),
    );
    // The 4h/1d majority (bearish MACD, above-upper BB) should win out over
    // 1h looking bullish on its own.
    expect(result.score).toBeLessThan(50);
  });

  it("amplifies a Bollinger-band touch when at least 2 of 3 timeframes confirm it with volume", () => {
    const withoutVolume = computeConfluenceScore(
      bySignal(
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false },
      ),
    );
    const withVolume = computeConfluenceScore(
      bySignal(
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: true },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: true },
        { rsi: 50, macd: "neutral", bbPosition: "below-lower", volumeSpike: false },
      ),
    );
    expect(withVolume.score).toBeGreaterThan(withoutVolume.score);
  });
});
