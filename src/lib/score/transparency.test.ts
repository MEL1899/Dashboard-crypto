import { describe, expect, it } from "vitest";
import { configForRegime } from "./config";
import { computeSignalScore } from "./signalScore";
import { explainScore } from "./transparency";

describe("explainScore", () => {
  it("describes every group and metric that actually exists in the config", () => {
    const explanation = explainScore();
    const config = configForRegime();

    expect(explanation.groups.map((g) => g.id)).toEqual(config.groups.map((g) => g.id));
    for (const [i, group] of explanation.groups.entries()) {
      expect(group.metrics.map((m) => m.id)).toEqual(config.groups[i].metrics.map((m) => m.id));
    }
  });

  it("reports the same weights the scoring function uses", () => {
    // The whole reason this is generated rather than written by hand: a
    // weight change in config.ts has to move both at once.
    const config = configForRegime();
    const explanation = explainScore();

    for (const [i, group] of explanation.groups.entries()) {
      expect(group.weightPct).toBeCloseTo(config.groups[i].weight * 100, 6);
      for (const [j, metric] of group.metrics.entries()) {
        const spec = config.groups[i].metrics[j];
        expect(metric.weightPct).toBeCloseTo(spec.weight * 100, 6);
        expect(metric.overallWeightPct).toBeCloseTo(spec.weight * config.groups[i].weight * 100, 6);
        expect(metric.direction).toBe(spec.direction);
        expect(metric.clip).toEqual(spec.clip);
      }
    }
  });

  it("has group weights summing to 100% and metric weights summing to 100% within each group", () => {
    const explanation = explainScore();
    const groupTotal = explanation.groups.reduce((sum, g) => sum + g.weightPct, 0);
    expect(groupTotal).toBeCloseTo(100, 6);

    for (const group of explanation.groups) {
      const metricTotal = group.metrics.reduce((sum, m) => sum + m.weightPct, 0);
      expect(metricTotal).toBeCloseTo(100, 6);
    }
  });

  it("has every metric's overall weights summing to 100% across the whole formula", () => {
    const explanation = explainScore();
    const total = explanation.groups.reduce(
      (sum, g) => sum + g.metrics.reduce((s, m) => s + m.overallWeightPct, 0),
      0,
    );
    expect(total).toBeCloseTo(100, 6);
  });

  it("states a direction and a rationale for every metric", () => {
    for (const group of explainScore().groups) {
      for (const metric of group.metrics) {
        expect(metric.rationale.length).toBeGreaterThan(20);
        expect(metric.directionLabel).toMatch(/altista|baixista/);
      }
    }
  });

  it("omits current values when explaining the methodology on its own", () => {
    const explanation = explainScore();
    expect(explanation.currentScore).toBeUndefined();
    expect(explanation.groups[0].metrics[0].currentValue).toBeUndefined();
  });

  it("fills in current raw and normalized values when given a run", () => {
    const result = computeSignalScore({ rsi: { "1h": 20, "4h": 20, "1d": 20 }, fearGreed: 80 });
    const explanation = explainScore(result);

    expect(explanation.currentScore).toBe(result.score);
    expect(explanation.coveragePct).toBeCloseTo(result.coverage * 100, 6);

    const rsi = explanation.groups
      .find((g) => g.id === "technical")
      ?.metrics.find((m) => m.id === "rsi");
    expect(rsi?.currentValue?.raw).toBe(20);
    // RSI is inverted, so an oversold 20 normalizes to a bullish 80.
    expect(rsi?.currentValue?.normalized).toBeCloseTo(80, 6);
  });

  it("marks metrics that had no data for that run", () => {
    const result = computeSignalScore({ fearGreed: 50 });
    const explanation = explainScore(result);

    const technical = explanation.groups.find((g) => g.id === "technical");
    expect(technical?.currentScore).toBeNull();
    expect(technical?.missingMetrics).toContain("rsi");
    expect(technical?.metrics.find((m) => m.id === "rsi")?.currentValue).toBeNull();
  });

  it("carries the regime the score was computed under", () => {
    const result = computeSignalScore({ fearGreed: 50 }, "uptrend");
    expect(explainScore(result).regime).toBe("uptrend");
  });
});
