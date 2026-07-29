import { describe, expect, it } from "vitest";
import { computeOpportunityScore } from "./opportunityScore";

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
