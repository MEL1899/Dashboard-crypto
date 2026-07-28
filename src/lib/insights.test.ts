import { describe, expect, it } from "vitest";
import { buildTradeInsights } from "./insights";

const NEUTRAL_INPUT = {
  symbol: "BTC",
  rsi: 50,
  bbPosition: "inside" as const,
  fundingRate: 0,
  longShortRatio: 1,
  fearGreedValue: 50,
  fearGreedLabel: "Neutro",
};

describe("buildTradeInsights", () => {
  it("produces no signals and a neutral bias when everything is mid-range", () => {
    const result = buildTradeInsights(NEUTRAL_INPUT);
    expect(result.signals).toEqual([]);
    expect(result.bias).toBe("neutral");
  });

  it("flags oversold RSI as a bullish signal", () => {
    const result = buildTradeInsights({ ...NEUTRAL_INPUT, rsi: 25 });
    expect(result.bias).toBe("bullish");
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].bias).toBe("bullish");
  });

  it("flags overbought RSI as a bearish signal", () => {
    const result = buildTradeInsights({ ...NEUTRAL_INPUT, rsi: 75 });
    expect(result.bias).toBe("bearish");
    expect(result.signals[0].bias).toBe("bearish");
  });

  it("combines multiple bearish signals into an overall bearish bias", () => {
    const result = buildTradeInsights({
      ...NEUTRAL_INPUT,
      rsi: 80,
      bbPosition: "above-upper",
      fundingRate: 0.001,
      longShortRatio: 2,
      fearGreedValue: 90,
      fearGreedLabel: "Ganância Extrema",
    });
    expect(result.bias).toBe("bearish");
    expect(result.signals.length).toBe(5);
    expect(result.signals.every((s) => s.bias === "bearish")).toBe(true);
  });

  it("nets out to neutral when bullish and bearish signal counts tie", () => {
    const result = buildTradeInsights({
      ...NEUTRAL_INPUT,
      rsi: 25, // bullish
      bbPosition: "above-upper", // bearish
    });
    expect(result.signals).toHaveLength(2);
    expect(result.bias).toBe("neutral");
  });

  it("ignores null fields instead of producing signals for them", () => {
    const result = buildTradeInsights({
      symbol: "BTC",
      rsi: null,
      bbPosition: null,
      fundingRate: null,
      longShortRatio: null,
      fearGreedValue: null,
      fearGreedLabel: null,
    });
    expect(result.signals).toEqual([]);
    expect(result.bias).toBe("neutral");
  });
});
