import { describe, expect, it } from "vitest";
import {
  bbSignal,
  calcBollingerBands,
  calcRSI,
  calcSMA,
  calcVolumeSeries,
  rsiSignal,
} from "./indicators";
import type { Candle } from "../types";

function makeCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: i,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100 + i,
  }));
}

describe("calcSMA", () => {
  it("computes a simple moving average with the right window and offset", () => {
    const candles = makeCandles([1, 2, 3, 4, 5]);
    const sma = calcSMA(candles, 2);
    expect(sma).toEqual([
      { time: 1, value: 1.5 },
      { time: 2, value: 2.5 },
      { time: 3, value: 3.5 },
      { time: 4, value: 4.5 },
    ]);
  });
});

describe("calcRSI", () => {
  it("returns 100 when every period is a gain", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = calcRSI(makeCandles(closes), 14);
    expect(rsi.length).toBeGreaterThan(0);
    for (const point of rsi) expect(point.value).toBeCloseTo(100);
  });

  it("returns 0 when every period is a loss", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    const rsi = calcRSI(makeCandles(closes), 14);
    expect(rsi.length).toBeGreaterThan(0);
    for (const point of rsi) expect(point.value).toBeCloseTo(0);
  });

  it("returns an empty series when there is not enough data", () => {
    const rsi = calcRSI(makeCandles([1, 2, 3]), 14);
    expect(rsi).toEqual([]);
  });
});

describe("calcBollingerBands", () => {
  it("collapses upper/middle/lower to the same value on a flat price series", () => {
    const candles = makeCandles(Array(25).fill(50));
    const bands = calcBollingerBands(candles, 20, 2);
    for (const band of bands) {
      expect(band.upper).toBeCloseTo(50);
      expect(band.middle).toBeCloseTo(50);
      expect(band.lower).toBeCloseTo(50);
    }
  });

  it("widens the bands as volatility increases", () => {
    const flat = makeCandles(Array(25).fill(50));
    const volatile = makeCandles(
      Array.from({ length: 25 }, (_, i) => 50 + (i % 2 === 0 ? 10 : -10)),
    );
    const flatBands = calcBollingerBands(flat, 20, 2);
    const volatileBands = calcBollingerBands(volatile, 20, 2);
    const flatWidth = flatBands[0].upper - flatBands[0].lower;
    const volatileWidth = volatileBands[0].upper - volatileBands[0].lower;
    expect(volatileWidth).toBeGreaterThan(flatWidth);
  });
});

describe("calcVolumeSeries", () => {
  it("maps each candle to its own time/volume pair, preserving order", () => {
    const candles = makeCandles([1, 2, 3]);
    expect(calcVolumeSeries(candles)).toEqual([
      { time: 0, value: 100 },
      { time: 1, value: 101 },
      { time: 2, value: 102 },
    ]);
  });
});

describe("rsiSignal", () => {
  it("classifies boundaries correctly", () => {
    expect(rsiSignal(30)).toBe("oversold");
    expect(rsiSignal(29.9)).toBe("oversold");
    expect(rsiSignal(70)).toBe("overbought");
    expect(rsiSignal(70.1)).toBe("overbought");
    expect(rsiSignal(50)).toBe("neutral");
  });
});

describe("bbSignal", () => {
  const band = { time: 0, upper: 110, middle: 100, lower: 90 };

  it("classifies price position relative to the bands", () => {
    expect(bbSignal(115, band)).toBe("above-upper");
    expect(bbSignal(110, band)).toBe("above-upper");
    expect(bbSignal(85, band)).toBe("below-lower");
    expect(bbSignal(90, band)).toBe("below-lower");
    expect(bbSignal(100, band)).toBe("inside");
  });
});
