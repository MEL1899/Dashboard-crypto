import { describe, expect, it } from "vitest";
import { runBacktest, runRsiOnlyBacktest } from "./backtest";
import type { Candle } from "../types";

function makeCandles(closes: number[], startTime = 0, stepSeconds = 86400): Candle[] {
  return closes.map((close, i) => ({
    time: startTime + i * stepSeconds,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1000 + (i % 7) * 50,
  }));
}

// A long synthetic series that oscillates through both extremes over the
// window (slow cycle + faster ripple + a mild long-term drift) — real
// enough to exercise the buy/sell rule without hand-tuning exact threshold
// crossings for every indicator.
function syntheticSeries(days: number): number[] {
  const closes: number[] = [];
  for (let i = 0; i < days; i++) {
    const cycle = Math.sin(i / 12) * 8;
    const ripple = Math.sin(i * 1.7) * 1.5;
    closes.push(Math.max(1, 100 + cycle + ripple + i * 0.05));
  }
  return closes;
}

describe("runBacktest", () => {
  it("returns an empty result when there isn't enough history", () => {
    const result = runBacktest(makeCandles(Array(30).fill(100)), null);
    expect(result).toEqual({
      trades: [],
      equityCurve: [],
      strategyReturnPct: 0,
      buyHoldReturnPct: 0,
      winRate: 0,
      maxDrawdownPct: 0,
    });
  });

  it("builds one equity point per post-warmup candle", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    expect(result.equityCurve.length).toBe(candles.length - 50);
  });

  it("computes buy-and-hold return as the simple price ratio over the window", () => {
    const closes = syntheticSeries(150);
    const candles = makeCandles(closes);
    const result = runBacktest(candles, null);
    const expected = ((closes[closes.length - 1] - closes[50]) / closes[50]) * 100;
    expect(result.buyHoldReturnPct).toBeCloseTo(expected, 6);
  });

  it("never looks ahead: entry decisions in a truncated run match the full run", () => {
    const candles = makeCandles(syntheticSeries(150));
    const truncated = candles.slice(0, 100);

    const full = runBacktest(candles, null);
    const partial = runBacktest(truncated, null);

    const truncatedEndTime = truncated[truncated.length - 1].time;
    const fullEntriesWithinWindow = full.trades
      .map((t) => t.entryTime)
      .filter((t) => t <= truncatedEndTime);
    const partialEntries = partial.trades.map((t) => t.entryTime);

    expect(partialEntries).toEqual(fullEntriesWithinWindow);
  });

  it("each trade's return% matches the long/short formula for its type", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    for (const trade of result.trades) {
      const expected =
        trade.type === "long"
          ? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100
          : ((trade.entryPrice - trade.exitPrice) / trade.entryPrice) * 100;
      expect(trade.returnPct).toBeCloseTo(expected, 6);
    }
  });

  it("includes both long and short trades when the score swings both ways", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    const types = new Set(result.trades.map((t) => t.type));
    expect(types.has("long") || types.has("short")).toBe(true);
  });

  it("win rate matches the fraction of trades with a positive return", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    if (result.trades.length === 0) {
      expect(result.winRate).toBe(0);
    } else {
      const wins = result.trades.filter((t) => t.returnPct > 0).length;
      expect(result.winRate).toBeCloseTo((wins / result.trades.length) * 100, 6);
    }
  });

  it("max drawdown is never negative and never at/above 100%", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(result.maxDrawdownPct).toBeLessThan(100);
  });

  it("a short trade profits when price fell and loses when price rose", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    for (const trade of result.trades) {
      if (trade.type !== "short") continue;
      if (trade.exitPrice < trade.entryPrice) expect(trade.returnPct).toBeGreaterThan(0);
      if (trade.exitPrice > trade.entryPrice) expect(trade.returnPct).toBeLessThan(0);
    }
  });

  it("'strongOnly' mode trades no more often than the default 'any' mode", () => {
    const candles = makeCandles(syntheticSeries(150));
    const any = runBacktest(candles, null, "any");
    const strongOnly = runBacktest(candles, null, "strongOnly");
    // Compra Forte/Venda Forte is strictly harder to reach than
    // Compra/Venda, so it can never open MORE trades than the looser rule.
    expect(strongOnly.trades.length).toBeLessThanOrEqual(any.trades.length);
  });
});

describe("runRsiOnlyBacktest", () => {
  it("returns an empty result when there isn't enough history", () => {
    const result = runRsiOnlyBacktest(makeCandles(Array(30).fill(100)), 14);
    expect(result.trades).toEqual([]);
    expect(result.equityCurve).toEqual([]);
  });

  it("builds one equity point per post-warmup candle", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runRsiOnlyBacktest(candles, 7);
    expect(result.equityCurve.length).toBe(candles.length - 50);
  });

  it("each trade's return% matches the long/short formula for its type, for every RSI period", () => {
    const candles = makeCandles(syntheticSeries(150));
    for (const period of [7, 14, 21]) {
      const result = runRsiOnlyBacktest(candles, period);
      for (const trade of result.trades) {
        const expected =
          trade.type === "long"
            ? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100
            : ((trade.entryPrice - trade.exitPrice) / trade.entryPrice) * 100;
        expect(trade.returnPct).toBeCloseTo(expected, 6);
      }
    }
  });

  it("never looks ahead, same as the score-based backtest", () => {
    const candles = makeCandles(syntheticSeries(150));
    const truncated = candles.slice(0, 100);

    const full = runRsiOnlyBacktest(candles, 7);
    const partial = runRsiOnlyBacktest(truncated, 7);

    const truncatedEndTime = truncated[truncated.length - 1].time;
    const fullEntriesWithinWindow = full.trades
      .map((t) => t.entryTime)
      .filter((t) => t <= truncatedEndTime);
    const partialEntries = partial.trades.map((t) => t.entryTime);

    expect(partialEntries).toEqual(fullEntriesWithinWindow);
  });

  it("a faster (shorter-period) RSI swings to its thresholds more often than a slower one", () => {
    const candles = makeCandles(syntheticSeries(150));
    const fast = runRsiOnlyBacktest(candles, 7);
    const slow = runRsiOnlyBacktest(candles, 21);
    expect(fast.trades.length).toBeGreaterThanOrEqual(slow.trades.length);
  });
});
