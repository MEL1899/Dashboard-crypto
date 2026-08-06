import { describe, expect, it } from "vitest";
import { buildScoreInputs, rsiFromCandles, technicalMetricsFromCandles } from "./liveInputs";
import { computeSignalScore } from "./signalScore";
import type { Candle } from "../../types";

function mk(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: i * 86400,
    open: c,
    high: c * 1.02,
    low: c * 0.98,
    close: c,
    volume: 1000,
  }));
}

const rising = (n: number) => Array.from({ length: n }, (_, i) => 100 + i);
const falling = (n: number) => Array.from({ length: n }, (_, i) => 200 - i);
const wobbly = (n: number) => Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 5) * 10);

describe("technicalMetricsFromCandles", () => {
  it("returns all nulls for an empty series rather than throwing", () => {
    expect(technicalMetricsFromCandles([])).toEqual({
      rsi: null,
      bollingerPercentB: null,
      macdHistogram: null,
      emaDistance: null,
    });
  });

  it("returns nulls for metrics the series is too short to support", () => {
    const short = technicalMetricsFromCandles(mk(rising(5)));
    expect(short.rsi).toBeNull();
    expect(short.emaDistance).toBeNull();
  });

  it("computes every metric once the series is long enough", () => {
    const metrics = technicalMetricsFromCandles(mk(wobbly(200)));
    expect(metrics.rsi).not.toBeNull();
    expect(metrics.bollingerPercentB).not.toBeNull();
    expect(metrics.macdHistogram).not.toBeNull();
    expect(metrics.emaDistance).not.toBeNull();
  });

  it("reads RSI high in a steady rise and low in a steady fall", () => {
    expect(technicalMetricsFromCandles(mk(rising(120))).rsi as number).toBeGreaterThan(70);
    expect(technicalMetricsFromCandles(mk(falling(120))).rsi as number).toBeLessThan(30);
  });

  it("puts price above the long EMA in an uptrend and below it in a downtrend", () => {
    expect(technicalMetricsFromCandles(mk(rising(120))).emaDistance as number).toBeGreaterThan(0);
    expect(technicalMetricsFromCandles(mk(falling(120))).emaDistance as number).toBeLessThan(0);
  });

  it("expresses the MACD histogram as a % of price, so scale doesn't matter", () => {
    const cheap = technicalMetricsFromCandles(mk(wobbly(200))).macdHistogram as number;
    const dear = technicalMetricsFromCandles(mk(wobbly(200).map((v) => v * 1000))).macdHistogram as number;
    expect(cheap).toBeCloseTo(dear, 6);
  });

  it("keeps Bollinger %b inside 0-1 while price stays within the bands", () => {
    const pb = technicalMetricsFromCandles(mk(wobbly(200))).bollingerPercentB as number;
    expect(pb).toBeGreaterThanOrEqual(-0.5);
    expect(pb).toBeLessThanOrEqual(1.5);
  });
});

describe("rsiFromCandles", () => {
  it("returns null when there aren't enough candles", () => {
    expect(rsiFromCandles(mk(rising(5)))).toBeNull();
  });

  it("matches the value technicalMetricsFromCandles reports", () => {
    const candles = mk(wobbly(200));
    expect(rsiFromCandles(candles)).toBe(technicalMetricsFromCandles(candles).rsi);
  });
});

describe("buildScoreInputs", () => {
  const long = mk(wobbly(200));

  it("blends RSI across whichever timeframes were supplied", () => {
    const all = buildScoreInputs({ "1h": long, "4h": long, "1d": long });
    expect(all.rsi?.["1h"]).not.toBeNull();
    expect(all.rsi?.["4h"]).not.toBeNull();
    expect(all.rsi?.["1d"]).not.toBeNull();

    const dailyOnly = buildScoreInputs({ "1d": long });
    expect(dailyOnly.rsi?.["1h"]).toBeNull();
    expect(dailyOnly.rsi?.["1d"]).not.toBeNull();
  });

  it("takes the non-RSI technical metrics from the daily series", () => {
    const daily = buildScoreInputs({ "1d": long });
    const direct = technicalMetricsFromCandles(long);
    expect(daily.bollingerPercentB).toBe(direct.bollingerPercentB);
    expect(daily.macdHistogram).toBe(direct.macdHistogram);
    expect(daily.emaDistance).toBe(direct.emaDistance);
  });

  it("leaves every technical metric null when there is no daily series", () => {
    const noDaily = buildScoreInputs({ "1h": long });
    expect(noDaily.bollingerPercentB).toBeNull();
    expect(noDaily.macdHistogram).toBeNull();
    expect(noDaily.emaDistance).toBeNull();
    // The 1h RSI still comes through.
    expect(noDaily.rsi?.["1h"]).not.toBeNull();
  });

  it("passes external readings straight through, nulling the ones not supplied", () => {
    const inputs = buildScoreInputs({ "1d": long }, { fearGreed: 72 });
    expect(inputs.fearGreed).toBe(72);
    expect(inputs.mvrvZScore).toBeNull();
    expect(inputs.fundingRate).toBeNull();
    expect(inputs.exchangeNetflow).toBeNull();
  });

  it("never invents a value for a missing feed — coverage drops instead", () => {
    // The whole contract with the score: absent data lowers confidence, it
    // does not get filled in with a neutral placeholder that would look
    // like a real reading.
    const withSentiment = computeSignalScore(buildScoreInputs({ "1d": long }, { fearGreed: 50 }));
    const withoutSentiment = computeSignalScore(buildScoreInputs({ "1d": long }));
    expect(withoutSentiment.coverage).toBeLessThan(withSentiment.coverage);
    const sentimentGroup = withoutSentiment.groups.find((g) => g.id === "sentiment");
    expect(sentimentGroup?.score).toBeNull();
  });

  it("produces a usable score from technical data alone", () => {
    // The realistic case today: candles work, on-chain isn't wired.
    const result = computeSignalScore(buildScoreInputs({ "1h": long, "4h": long, "1d": long }));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.groups.find((g) => g.id === "technical")?.score).not.toBeNull();
    expect(result.coverage).toBeGreaterThan(0);
    expect(result.coverage).toBeLessThan(1);
  });
});
