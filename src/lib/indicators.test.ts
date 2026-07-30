import { describe, expect, it } from "vitest";
import {
  bbSignal,
  calcBollingerBands,
  calcMACD,
  calcRSI,
  calcSMA,
  calcVolumeSeries,
  isVolumeSpike,
  macdSignal,
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

describe("calcMACD", () => {
  it("returns an empty series when there is not enough data", () => {
    expect(calcMACD(makeCandles([1, 2, 3]))).toEqual([]);
  });

  it("produces a positive histogram on a sustained uptrend", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 2);
    const macd = calcMACD(makeCandles(closes));
    expect(macd.length).toBeGreaterThan(0);
    const last = macd[macd.length - 1];
    expect(last.macd).toBeGreaterThan(0);
    expect(last.histogram).toBeGreaterThan(0);
  });

  it("produces a negative histogram on a sustained downtrend", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 200 - i * 2);
    const macd = calcMACD(makeCandles(closes));
    const last = macd[macd.length - 1];
    expect(last.macd).toBeLessThan(0);
    expect(last.histogram).toBeLessThan(0);
  });
});

describe("macdSignal", () => {
  it("reads bullish/bearish from the histogram sign, neutral when empty", () => {
    expect(macdSignal([])).toBe("neutral");
    expect(macdSignal([{ time: 0, macd: 1, signal: 0.5, histogram: 0.5 }])).toBe("bullish");
    expect(macdSignal([{ time: 0, macd: 0.5, signal: 1, histogram: -0.5 }])).toBe("bearish");
    expect(macdSignal([{ time: 0, macd: 1, signal: 1, histogram: 0 }])).toBe("neutral");
  });
});

describe("isVolumeSpike", () => {
  it("returns false when there is not enough data", () => {
    expect(isVolumeSpike(makeCandles([1, 2, 3]), 20)).toBe(false);
  });

  it("returns false when the last candle's volume is near the trailing average", () => {
    const candles = makeCandles(Array(21).fill(50)); // volumes climb gently, 100..120
    expect(isVolumeSpike(candles, 20)).toBe(false);
  });

  it("returns true when the last candle's volume spikes well above the trailing average", () => {
    const candles = makeCandles(Array(21).fill(50));
    candles[candles.length - 1] = { ...candles[candles.length - 1], volume: 10000 };
    expect(isVolumeSpike(candles, 20)).toBe(true);
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
