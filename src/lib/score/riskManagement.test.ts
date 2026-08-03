import { describe, expect, it } from "vitest";
import {
  MAX_RISK_PER_TRADE_PCT,
  MIN_RISK_PER_TRADE_PCT,
  RISK_DISCLAIMER,
  breakevenWinRate,
  calculatePositionSize,
  sugerirGestaoDeRisco,
} from "./riskManagement";

describe("breakevenWinRate", () => {
  it("matches the standard 1/(1+N) for a 1:N reward-to-risk", () => {
    expect(breakevenWinRate(1)).toBeCloseTo(50, 6);
    expect(breakevenWinRate(2)).toBeCloseTo(33.333333, 5);
    expect(breakevenWinRate(3)).toBeCloseTo(25, 6);
  });

  it("treats a non-positive ratio as unwinnable", () => {
    expect(breakevenWinRate(0)).toBe(100);
    expect(breakevenWinRate(-1)).toBe(100);
  });
});

describe("calculatePositionSize", () => {
  it("sizes the position from the stop distance, risking exactly the chosen %", () => {
    // $10,000 account, 1% risk = $100 at risk. Entry $100, stop $95 → $5
    // per unit → 20 units → $2,000 notional.
    const size = calculatePositionSize(10_000, 100, 95, 1);
    expect(size).not.toBeNull();
    expect(size?.riskAmount).toBeCloseTo(100, 6);
    expect(size?.units).toBeCloseTo(20, 6);
    expect(size?.positionValue).toBeCloseTo(2_000, 6);
    expect(size?.stopDistancePct).toBeCloseTo(5, 6);
  });

  it("takes a bigger position for a tighter stop, at identical risk", () => {
    const wide = calculatePositionSize(10_000, 100, 90, 1);
    const tight = calculatePositionSize(10_000, 100, 99, 1);
    expect(tight!.positionValue).toBeGreaterThan(wide!.positionValue);
    // The whole point: the amount at risk is unchanged either way.
    expect(tight!.riskAmount).toBeCloseTo(wide!.riskAmount, 6);
  });

  it("works the same for a short, where the stop sits above the entry", () => {
    const size = calculatePositionSize(10_000, 100, 105, 1);
    expect(size?.units).toBeCloseTo(20, 6);
    expect(size?.stopDistancePct).toBeCloseTo(5, 6);
  });

  it("refuses to size a position with no stop distance or nonsense inputs", () => {
    expect(calculatePositionSize(10_000, 100, 100, 1)).toBeNull();
    expect(calculatePositionSize(0, 100, 95, 1)).toBeNull();
    expect(calculatePositionSize(10_000, 0, 95, 1)).toBeNull();
    expect(calculatePositionSize(-5, 100, 95, 1)).toBeNull();
  });
});

describe("sugerirGestaoDeRisco", () => {
  it("defaults to the conservative end of the 1-2% band", () => {
    const guidance = sugerirGestaoDeRisco();
    expect(guidance.riskPerTradePct).toBe(MIN_RISK_PER_TRADE_PCT);
    expect(guidance.riskRangePct).toEqual({ min: MIN_RISK_PER_TRADE_PCT, max: MAX_RISK_PER_TRADE_PCT });
  });

  it("clamps any requested risk into the 1-2% band", () => {
    expect(sugerirGestaoDeRisco({ riskPerTradePct: 25 }).riskPerTradePct).toBe(MAX_RISK_PER_TRADE_PCT);
    expect(sugerirGestaoDeRisco({ riskPerTradePct: 0.1 }).riskPerTradePct).toBe(MIN_RISK_PER_TRADE_PCT);
    expect(sugerirGestaoDeRisco({ riskPerTradePct: 1.5 }).riskPerTradePct).toBe(1.5);
  });

  it("requires at least 1:2 and reports the win rate that implies", () => {
    const guidance = sugerirGestaoDeRisco();
    expect(guidance.minRewardRiskRatio).toBe(2);
    expect(guidance.breakevenWinRatePct).toBeCloseTo(33.333333, 5);
  });

  it("always returns the disclaimer, in full", () => {
    expect(sugerirGestaoDeRisco().disclaimer).toBe(RISK_DISCLAIMER);
    // It cites the regulator/central-bank figures rather than being vague —
    // those are the most robust numbers in the research.
    expect(RISK_DISCLAIMER).toContain("75%");
    expect(RISK_DISCLAIMER).toContain("BIS");
  });

  it("computes a position size only when given capital, entry and stop", () => {
    expect(sugerirGestaoDeRisco().positionSize).toBeNull();
    expect(sugerirGestaoDeRisco({ capital: 10_000 }).positionSize).toBeNull();
    expect(sugerirGestaoDeRisco({ capital: 10_000, entryPrice: 100 }).positionSize).toBeNull();

    const full = sugerirGestaoDeRisco({ capital: 10_000, entryPrice: 100, stopPrice: 95 });
    expect(full.positionSize?.positionValue).toBeCloseTo(2_000, 6);
  });

  it("does not accept the score as an input at all", () => {
    // Layer 3 must be un-influenceable by Layer 1: conviction decides
    // whether to take the trade, never how much of the account to bet. If
    // this ever needs updating, the layers have been coupled.
    const guidance = sugerirGestaoDeRisco({ capital: 10_000, entryPrice: 100, stopPrice: 95 });
    expect(Object.keys(guidance)).not.toContain("score");
    expect(guidance.riskPerTradePct).toBe(MIN_RISK_PER_TRADE_PCT);
  });
});
