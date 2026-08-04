import { describe, expect, it } from "vitest";
import { classifyStance, evaluateConfluence } from "./confluence";
import { computeSignalScore, type GroupContribution } from "./signalScore";

function group(id: string, score: number | null): GroupContribution {
  return { id, label: id, score, effectiveWeight: 0, metrics: [], missingMetrics: [] };
}

describe("classifyStance", () => {
  it("uses the same 60/40 bands as the buy/sell badge", () => {
    expect(classifyStance(61)).toBe("bullish");
    expect(classifyStance(60)).toBe("neutral");
    expect(classifyStance(50)).toBe("neutral");
    expect(classifyStance(40)).toBe("neutral");
    expect(classifyStance(39)).toBe("bearish");
  });
});

describe("evaluateConfluence", () => {
  it("reports high confluence when every available group agrees", () => {
    const result = evaluateConfluence([group("technical", 75), group("onchain", 80), group("sentiment", 90)]);
    expect(result.level).toBe("high");
    expect(result.label).toBe("Alta confluência");
  });

  it("reports high confluence when all groups agree on bearish too", () => {
    const result = evaluateConfluence([group("technical", 20), group("onchain", 10), group("sentiment", 35)]);
    expect(result.level).toBe("high");
  });

  it("reports a mixed signal when groups disagree", () => {
    const result = evaluateConfluence([group("technical", 85), group("onchain", 15), group("sentiment", 50)]);
    expect(result.level).toBe("mixed");
    expect(result.label).toBe("Sinal misto");
  });

  it("treats a neutral group as disagreement, not as a free pass", () => {
    // Two groups shouting buy and one saying nothing is exactly the case a
    // user should see flagged.
    const result = evaluateConfluence([group("technical", 85), group("onchain", 82), group("sentiment", 50)]);
    expect(result.level).toBe("mixed");
  });

  it("never reports high confluence when every group is neutral", () => {
    const result = evaluateConfluence([group("technical", 50), group("onchain", 50), group("sentiment", 50)]);
    expect(result.level).toBe("mixed");
  });

  it("needs at least two groups with data to say anything", () => {
    expect(evaluateConfluence([group("technical", 85)]).level).toBe("insufficient");
    expect(evaluateConfluence([]).level).toBe("insufficient");
    expect(
      evaluateConfluence([group("technical", 85), group("onchain", null), group("sentiment", null)]).level,
    ).toBe("insufficient");
  });

  it("ignores groups without data when judging agreement", () => {
    const result = evaluateConfluence([group("technical", 85), group("onchain", 82), group("sentiment", null)]);
    expect(result.level).toBe("high");
    expect(result.availableGroups).toBe(2);
  });

  it("flags a mixed signal even when the score itself sits near neutral", () => {
    // The headline requirement: divergent groups can average out to a
    // perfectly ordinary-looking number, and the label is the only thing
    // that reveals it.
    const result = computeSignalScore({
      rsi: { "1h": 0, "4h": 0, "1d": 0 },
      bollingerPercentB: 0,
      macdHistogram: 1.5,
      emaDistance: 10,
      mvrvZScore: 8,
      fundingRate: 0.05,
      exchangeNetflow: 3,
      // Contrarian reading, so extreme greed is the bearish sentiment end.
      fearGreed: 100,
    });
    const confluence = evaluateConfluence(result.groups);

    expect(result.score).toBeCloseTo(100 / 3, 6);
    expect(result.level).not.toBe("strongBuy");
    expect(confluence.level).toBe("mixed");
    expect(confluence.stances.find((s) => s.id === "technical")?.stance).toBe("bullish");
    expect(confluence.stances.find((s) => s.id === "onchain")?.stance).toBe("bearish");
  });

  it("does not alter the score in any way", () => {
    const result = computeSignalScore({ rsi: { "1h": 20, "4h": 20, "1d": 20 }, fearGreed: 10 });
    const before = result.score;
    evaluateConfluence(result.groups);
    expect(result.score).toBe(before);
  });
});
