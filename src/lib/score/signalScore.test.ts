import { describe, expect, it } from "vitest";
import { configForRegime } from "./config";
import {
  classifyScore,
  combineRsi,
  computeSignalScore,
  normalizeMetric,
  type ScoreMetricInputs,
} from "./signalScore";

/**
 * Inputs that should land every group exactly on neutral, used as the base
 * for the "vary one thing" tests below. Directions differ per metric
 * (config.ts), so a neutral input is not always a zero — RSI 50 and
 * Bollinger %b 0.5 are mid-range, funding 0 is mid-range of ±0.05, and MVRV
 * neutral is the midpoint of the -2..8 clip, which is 3.
 */
const NEUTRAL_INPUTS: ScoreMetricInputs = {
  rsi: { "1h": 50, "4h": 50, "1d": 50 },
  bollingerPercentB: 0.5,
  macdHistogram: 0,
  emaDistance: 0,
  mvrvZScore: 3,
  fundingRate: 0,
  exchangeNetflow: 0,
  fearGreed: 50,
};

/** Every metric pinned to its most bullish end, respecting each one's
 * direction: oversold RSI, price at the lower band, positive momentum,
 * undervalued on-chain, negative funding, coins leaving exchanges. */
const BULLISH_INPUTS: ScoreMetricInputs = {
  rsi: { "1h": 0, "4h": 0, "1d": 0 },
  bollingerPercentB: 0,
  macdHistogram: 1.5,
  emaDistance: 10,
  mvrvZScore: -2,
  fundingRate: -0.05,
  exchangeNetflow: -3,
  fearGreed: 100,
};

const BEARISH_INPUTS: ScoreMetricInputs = {
  rsi: { "1h": 100, "4h": 100, "1d": 100 },
  bollingerPercentB: 1,
  macdHistogram: -1.5,
  emaDistance: -10,
  mvrvZScore: 8,
  fundingRate: 0.05,
  exchangeNetflow: 3,
  fearGreed: 0,
};

describe("normalizeMetric", () => {
  const direct = {
    id: "x",
    label: "x",
    weight: 1,
    direction: "direct" as const,
    clip: { min: 0, max: 10 },
    rationale: "",
  };
  const inverted = { ...direct, direction: "inverted" as const };

  it("maps the clip range linearly onto 0-100", () => {
    expect(normalizeMetric(0, direct)).toBe(0);
    expect(normalizeMetric(5, direct)).toBe(50);
    expect(normalizeMetric(10, direct)).toBe(100);
  });

  it("clamps values outside the configured range instead of extrapolating", () => {
    expect(normalizeMetric(-50, direct)).toBe(0);
    expect(normalizeMetric(999, direct)).toBe(100);
  });

  it("mirrors the scale for inverted metrics", () => {
    expect(normalizeMetric(0, inverted)).toBe(100);
    expect(normalizeMetric(5, inverted)).toBe(50);
    expect(normalizeMetric(10, inverted)).toBe(0);
  });

  it("returns neutral for a degenerate range rather than dividing by zero", () => {
    expect(normalizeMetric(5, { ...direct, clip: { min: 7, max: 7 } })).toBe(50);
  });
});

describe("combineRsi", () => {
  const config = configForRegime();

  it("weights the longer timeframe more heavily than the shorter ones", () => {
    // 1d carries 0.5 of the weight, so pulling only it to an extreme has to
    // move the combined value more than pulling only 1h by the same amount.
    const daily = combineRsi({ "1h": 50, "4h": 50, "1d": 100 }, config) as number;
    const hourly = combineRsi({ "1h": 100, "4h": 50, "1d": 50 }, config) as number;
    expect(daily).toBeGreaterThan(hourly);
  });

  it("renormalizes over whichever timeframes are present", () => {
    // With 4h and 1d missing, the 1h reading is all there is.
    expect(combineRsi({ "1h": 80, "4h": null, "1d": null }, config)).toBe(80);
    // Two equal readings stay at that value regardless of their weights.
    expect(combineRsi({ "1h": null, "4h": 30, "1d": 30 }, config)).toBe(30);
  });

  it("returns null when no timeframe has a value", () => {
    expect(combineRsi({ "1h": null, "4h": null, "1d": null }, config)).toBeNull();
  });
});

describe("classifyScore", () => {
  it("maps the 5 badge buckets on the documented boundaries", () => {
    expect(classifyScore(0)).toBe("strongSell");
    expect(classifyScore(19.9)).toBe("strongSell");
    expect(classifyScore(20)).toBe("sell");
    expect(classifyScore(39.9)).toBe("sell");
    expect(classifyScore(40)).toBe("neutral");
    expect(classifyScore(59.9)).toBe("neutral");
    expect(classifyScore(60)).toBe("buy");
    expect(classifyScore(79.9)).toBe("buy");
    expect(classifyScore(80)).toBe("strongBuy");
    expect(classifyScore(100)).toBe("strongBuy");
  });
});

describe("computeSignalScore", () => {
  it("scores ~50 when every group is neutral", () => {
    const result = computeSignalScore(NEUTRAL_INPUTS);
    expect(result.score).toBeCloseTo(50, 6);
    expect(result.level).toBe("neutral");
    for (const group of result.groups) {
      expect(group.score).toBeCloseTo(50, 6);
    }
  });

  it("scores near 100 when everything is strongly bullish", () => {
    const result = computeSignalScore(BULLISH_INPUTS);
    // Summing thirds in floating point lands a hair under 100, so compare
    // with tolerance rather than exactly.
    expect(result.score).toBeCloseTo(100, 6);
    expect(result.level).toBe("strongBuy");
  });

  it("scores near 0 when everything is strongly bearish", () => {
    const result = computeSignalScore(BEARISH_INPUTS);
    expect(result.score).toBeCloseTo(0, 6);
    expect(result.level).toBe("strongSell");
  });

  it("lands back near the middle when groups pull in opposite directions", () => {
    // Technical maximally bullish, on-chain and sentiment maximally
    // bearish: the number alone can't reveal the disagreement, which is
    // exactly why confluence is reported separately (see confluence.test).
    const result = computeSignalScore({
      ...BEARISH_INPUTS,
      rsi: BULLISH_INPUTS.rsi,
      bollingerPercentB: BULLISH_INPUTS.bollingerPercentB,
      macdHistogram: BULLISH_INPUTS.macdHistogram,
      emaDistance: BULLISH_INPUTS.emaDistance,
    });
    expect(result.score).toBeCloseTo(100 / 3, 6);
    const technical = result.groups.find((g) => g.id === "technical");
    const onchain = result.groups.find((g) => g.id === "onchain");
    expect(technical?.score).toBe(100);
    expect(onchain?.score).toBe(0);
  });

  it("weights the three groups equally", () => {
    // One group at 100 with the other two neutral must land exactly a
    // third of the way from 50 to 100.
    const result = computeSignalScore({
      ...NEUTRAL_INPUTS,
      rsi: { "1h": 0, "4h": 0, "1d": 0 },
      bollingerPercentB: 0,
      macdHistogram: 1.5,
      emaDistance: 10,
    });
    expect(result.score).toBeCloseTo(50 + 50 / 3, 6);
  });

  it("respects the technical sub-weights: RSI and Bollinger outweigh MACD", () => {
    const withRsiBullish = computeSignalScore({
      ...NEUTRAL_INPUTS,
      rsi: { "1h": 0, "4h": 0, "1d": 0 },
    });
    const withMacdBullish = computeSignalScore({ ...NEUTRAL_INPUTS, macdHistogram: 1.5 });
    expect(withRsiBullish.score).toBeGreaterThan(withMacdBullish.score);
  });

  it("renormalizes group weights when a whole group has no data", () => {
    // Technical alone, at maximum bullish, must carry the entire score
    // rather than being diluted by two absent groups.
    const result = computeSignalScore({
      rsi: BULLISH_INPUTS.rsi,
      bollingerPercentB: 0,
      macdHistogram: 1.5,
      emaDistance: 10,
    });
    expect(result.score).toBe(100);
    const technical = result.groups.find((g) => g.id === "technical");
    expect(technical?.effectiveWeight).toBeCloseTo(1, 6);
    const onchain = result.groups.find((g) => g.id === "onchain");
    expect(onchain?.score).toBeNull();
    expect(onchain?.effectiveWeight).toBe(0);
  });

  it("renormalizes metric weights within a partially-filled group", () => {
    // Only funding rate present, at its most bullish: the on-chain group
    // should read 100, not 100/3.
    const result = computeSignalScore({ fundingRate: -0.05 });
    const onchain = result.groups.find((g) => g.id === "onchain");
    expect(onchain?.score).toBe(100);
    expect(onchain?.missingMetrics).toEqual(["mvrvZScore", "exchangeNetflow"]);
    expect(onchain?.metrics[0].effectiveWeight).toBeCloseTo(1, 6);
  });

  it("reports coverage as the share of configured metrics actually supplied", () => {
    expect(computeSignalScore(NEUTRAL_INPUTS).coverage).toBe(1);
    // 8 metrics configured; supplying only fearGreed is 1 of 8.
    expect(computeSignalScore({ fearGreed: 50 }).coverage).toBeCloseTo(1 / 8, 6);
    expect(computeSignalScore({}).coverage).toBe(0);
  });

  it("returns a neutral score, not a bearish one, when nothing is available", () => {
    const result = computeSignalScore({});
    expect(result.score).toBe(50);
    expect(result.level).toBe("neutral");
    expect(result.groups.every((g) => g.score === null)).toBe(true);
  });

  it("ignores NaN and Infinity as if the metric were missing", () => {
    const result = computeSignalScore({ fearGreed: Number.NaN, fundingRate: Number.POSITIVE_INFINITY });
    expect(result.coverage).toBe(0);
    expect(result.score).toBe(50);
  });

  it("applies each metric's configured direction", () => {
    // Oversold RSI is bullish; overbought is bearish. If this flips, the
    // mean-reversion convention in config.ts was changed.
    const oversold = computeSignalScore({ rsi: { "1h": 20, "4h": 20, "1d": 20 } });
    const overbought = computeSignalScore({ rsi: { "1h": 80, "4h": 80, "1d": 80 } });
    expect(oversold.score).toBeGreaterThan(50);
    expect(overbought.score).toBeLessThan(50);

    // Positive funding = crowded long = bearish.
    expect(computeSignalScore({ fundingRate: 0.04 }).score).toBeLessThan(50);
    // Coins leaving exchanges = bullish.
    expect(computeSignalScore({ exchangeNetflow: -2 }).score).toBeGreaterThan(50);
    // Fear & Greed is read at face value in v1: greed is bullish.
    expect(computeSignalScore({ fearGreed: 90 }).score).toBeGreaterThan(50);
  });

  it("produces the same score for every regime in v1", () => {
    const regimes = ["uptrend", "downtrend", "range", "unknown"] as const;
    const scores = regimes.map((r) => computeSignalScore(NEUTRAL_INPUTS, r).score);
    expect(new Set(scores).size).toBe(1);
    // The regime still travels with the result so the UI can label it.
    expect(computeSignalScore(NEUTRAL_INPUTS, "uptrend").regime).toBe("uptrend");
  });

  it("keeps the score inside 0-100 for absurd inputs", () => {
    const result = computeSignalScore({
      rsi: { "1h": -500, "4h": -500, "1d": -500 },
      bollingerPercentB: -20,
      macdHistogram: 1e9,
      emaDistance: 1e9,
      mvrvZScore: -1e9,
      fundingRate: -1e9,
      exchangeNetflow: -1e9,
      fearGreed: 1e9,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
