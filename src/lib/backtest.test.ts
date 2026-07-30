import { describe, expect, it } from "vitest";
import { runBacktest } from "./backtest";
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

  it("each trade's return% matches (exit - entry) / entry", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    for (const trade of result.trades) {
      const expected = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
      expect(trade.returnPct).toBeCloseTo(expected, 6);
    }
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
});
