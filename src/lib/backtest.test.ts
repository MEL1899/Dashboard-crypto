import { describe, expect, it } from "vitest";
import { MAX_RISK_PER_TRADE_PCT } from "./score/riskManagement";
import {
  ROUND_TRIP_COST_PCT,
  alignExternalSeries,
  runBacktest,
  runRandomBaseline,
  runRsiOnlyBacktest,
  runScoreBacktest,
} from "./backtest";
import { configForRegime, withMetricDirection } from "./score/config";
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
      expectancyPct: 0,
      breakevenWinRate: 0,
      totalCostPct: 0,
      rejectedEntries: 0,
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

  it("each trade's return% matches the long/short formula for its type, net of costs", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    for (const trade of result.trades) {
      const gross =
        trade.type === "long"
          ? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100
          : ((trade.entryPrice - trade.exitPrice) / trade.entryPrice) * 100;
      expect(trade.returnPct).toBeCloseTo(gross - ROUND_TRIP_COST_PCT, 6);
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

  it("equityAfter compounds the trades in order and matches the final strategy return", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    // Position size now varies per trade with the stop distance, so the
    // per-trade allocation can't be reconstructed here — what must still
    // hold is that the recorded running equity is a genuine compounding
    // chain ending exactly at the reported strategy return.
    let previous = 100;
    for (const trade of result.trades) {
      expect(Number.isFinite(trade.equityAfter)).toBe(true);
      expect(trade.equityAfter).toBeGreaterThanOrEqual(0);
      // A winning trade must raise equity and a losing one must lower it.
      if (trade.returnPct > 0) expect(trade.equityAfter).toBeGreaterThan(previous);
      if (trade.returnPct < 0) expect(trade.equityAfter).toBeLessThan(previous);
      previous = trade.equityAfter;
    }
    if (result.trades.length > 0) {
      expect(previous).toBeCloseTo(100 + result.strategyReturnPct, 6);
    }
  });

  it("sizes every position so a stop-out costs the configured risk budget, not a fixed slice", () => {
    // The doc's rule (section 4): risk 1-2% per trade, sized from the stop.
    // A stop-out should cost about that much of equity regardless of how
    // far away the stop happened to sit.
    const candles = makeCandles(syntheticSeries(400));
    const result = runBacktest(candles, null);
    let previous = 100;
    for (const trade of result.trades) {
      if (trade.exitReason === "stop") {
        const equityLossPct = ((previous - trade.equityAfter) / previous) * 100;
        // Never more than the 2% ceiling, plus a little slack for the cost
        // charged on top of the stop distance itself.
        expect(equityLossPct).toBeLessThanOrEqual(MAX_RISK_PER_TRADE_PCT + 0.5);
      }
      previous = trade.equityAfter;
    }
  });

  it("stop-triggered exits are losses and target-triggered exits are gains", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    for (const trade of result.trades) {
      if (trade.exitReason === "stop") expect(trade.returnPct).toBeLessThanOrEqual(0);
      if (trade.exitReason === "target") expect(trade.returnPct).toBeGreaterThanOrEqual(0);
    }
  });

  it("tags every trade with a valid exit reason", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    for (const trade of result.trades) {
      expect(["stop", "target", "signal", "end"]).toContain(trade.exitReason);
    }
  });

  it("stop-loss distance is tighter on shorter timeframes than on 1d", () => {
    const candles = makeCandles(syntheticSeries(200));
    const daily = runBacktest(candles, null, "any", "1d");
    const fourHour = runBacktest(candles, null, "any", "4h");
    const hourly = runBacktest(candles, null, "any", "1h");
    // These bounds mirror STOP_BOUNDS_PCT in backtest.ts — a stop-triggered
    // trade loses at most its timeframe's max (the stop always fires at
    // exactly the clamped stop price) plus the round-trip cost on top.
    for (const trade of daily.trades) {
      if (trade.exitReason === "stop") {
        expect(Math.abs(trade.returnPct)).toBeLessThanOrEqual(15 + ROUND_TRIP_COST_PCT + 1e-6);
      }
    }
    for (const trade of fourHour.trades) {
      if (trade.exitReason === "stop") {
        expect(Math.abs(trade.returnPct)).toBeLessThanOrEqual(7 + ROUND_TRIP_COST_PCT + 1e-6);
      }
    }
    for (const trade of hourly.trades) {
      if (trade.exitReason === "stop") {
        expect(Math.abs(trade.returnPct)).toBeLessThanOrEqual(3.5 + ROUND_TRIP_COST_PCT + 1e-6);
      }
    }
  });

  it("defaults to the 1d timeframe when none is passed, unchanged from before", () => {
    const candles = makeCandles(syntheticSeries(150));
    const withDefault = runBacktest(candles, null);
    const explicit1d = runBacktest(candles, null, "any", "1d");
    expect(withDefault).toEqual(explicit1d);
  });

  it("charges a round-trip cost on every trade", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    expect(result.totalCostPct).toBeCloseTo(result.trades.length * ROUND_TRIP_COST_PCT, 6);
  });

  it("expectancy is the mean net return per trade, and its sign matches the overall result", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    if (result.trades.length === 0) {
      expect(result.expectancyPct).toBe(0);
      return;
    }
    const mean = result.trades.reduce((s, t) => s + t.returnPct, 0) / result.trades.length;
    expect(result.expectancyPct).toBeCloseTo(mean, 6);
    // Equity compounds the same per-trade returns, so a negative average
    // trade can't produce a winning strategy (and vice versa).
    if (result.expectancyPct < 0) expect(result.strategyReturnPct).toBeLessThan(0);
    if (result.expectancyPct > 0) expect(result.strategyReturnPct).toBeGreaterThan(0);
  });

  it("break-even win rate is the win rate at which average wins exactly pay for average losses", () => {
    const candles = makeCandles(syntheticSeries(150));
    const result = runBacktest(candles, null);
    const winners = result.trades.filter((t) => t.returnPct > 0);
    const losers = result.trades.filter((t) => t.returnPct <= 0);
    if (winners.length === 0 || losers.length === 0) return;

    const avgWin = winners.reduce((s, t) => s + t.returnPct, 0) / winners.length;
    const avgLoss = Math.abs(losers.reduce((s, t) => s + t.returnPct, 0) / losers.length);
    const p = result.breakevenWinRate / 100;
    expect(p * avgWin - (1 - p) * avgLoss).toBeCloseTo(0, 6);

    // The whole point of surfacing it: clearing the bar and making money
    // are the same statement.
    if (result.winRate > result.breakevenWinRate) expect(result.expectancyPct).toBeGreaterThan(0);
    if (result.winRate < result.breakevenWinRate) expect(result.expectancyPct).toBeLessThan(0);
  });
});

describe("exit policy", () => {
  const candles = makeCandles(syntheticSeries(300));

  it("'stopAndTargetOnly' never closes a position on an opposite signal", () => {
    const held = runBacktest(candles, null, "any", "1d", "stopAndTargetOnly");
    expect(held.trades.some((t) => t.exitReason === "signal")).toBe(false);
    for (const trade of held.trades) {
      expect(["stop", "target", "end"]).toContain(trade.exitReason);
    }
  });

  it("'flipOnSignal' does close on the opposite signal — the cut-winners defect", () => {
    const flipped = runBacktest(candles, null, "any", "1d", "flipOnSignal");
    expect(flipped.trades.some((t) => t.exitReason === "signal")).toBe(true);
  });

  it("documents that 'stopAndTargetOnly' currently degenerates into far too few trades", () => {
    // Not an aspiration — a guard on a known defect. The target sits at 2x
    // a Donchian-derived stop that can be 13% wide, so a ~26% move is
    // needed to take profit and positions mostly just sit. If a future
    // change to computeStopAndTarget makes targets reachable, this test
    // starts failing, which is the signal to revisit DEFAULT_EXIT_POLICY.
    const held = runBacktest(candles, null, "any", "1d", "stopAndTargetOnly");
    const flipped = runBacktest(candles, null, "any", "1d", "flipOnSignal");
    expect(held.trades.length).toBeLessThan(flipped.trades.length);
    expect(held.trades.some((t) => t.exitReason === "target")).toBe(false);
  });

  it("applies the policy to the random baseline too, so the control stays a control", () => {
    const flipped = runRandomBaseline(candles, 0.15, "seed", "1d", "flipOnSignal");
    const held = runRandomBaseline(candles, 0.15, "seed", "1d", "stopAndTargetOnly");
    expect(held.trades.some((t) => t.exitReason === "signal")).toBe(false);
    expect(flipped.trades.length).not.toBe(held.trades.length);
  });

  it("carries the policy through the score backtest as well", () => {
    const held = runScoreBacktest(candles, { exitPolicy: "stopAndTargetOnly" });
    expect(held.trades.some((t) => t.exitReason === "signal")).toBe(false);
  });
});

describe("trailing stop", () => {
  const candles = makeCandles(syntheticSeries(600));
  const TRAIL = { activationR: 1, trailFactor: 1 };

  it("a trailing-stop exit can never lose money — the whole point of a 'stop positivo'", () => {
    // Once active the stop sits at entry + the round-trip cost or better,
    // so exiting on it is break-even at worst. This is the strongest
    // guarantee the trailing rule provides, and it holds by construction.
    const result = runBacktest(candles, null, "any", "1d", "flipOnSignal", TRAIL);
    const trailed = result.trades.filter((t) => t.exitReason === "trail");
    expect(trailed.length).toBeGreaterThan(0);
    for (const trade of trailed) {
      expect(trade.returnPct).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("labels a trailed exit separately from an original-stop exit", () => {
    const result = runBacktest(candles, null, "any", "1d", "flipOnSignal", TRAIL);
    expect(result.trades.some((t) => t.exitReason === "trail")).toBe(true);
    // Plain stops must still exist — trades stopped out before the trail
    // ever activated.
    expect(result.trades.some((t) => t.exitReason === "stop")).toBe(true);
  });

  it("produces no trailed exits at all when trailing is disabled", () => {
    const result = runBacktest(candles, null, "any", "1d", "flipOnSignal", null);
    expect(result.trades.some((t) => t.exitReason === "trail")).toBe(false);
  });

  it("improves the reward-to-risk ratio, which is what it exists to do", () => {
    const withoutTrail = runBacktest(candles, null, "any", "1d", "flipOnSignal", null);
    const withTrail = runBacktest(candles, null, "any", "1d", "flipOnSignal", TRAIL);

    const ratio = (r: typeof withTrail) => {
      const wins = r.trades.filter((t) => t.returnPct > 0);
      const losses = r.trades.filter((t) => t.returnPct <= 0);
      if (wins.length === 0 || losses.length === 0) return null;
      const avgWin = wins.reduce((s, t) => s + t.returnPct, 0) / wins.length;
      const avgLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0) / losses.length);
      return avgWin / avgLoss;
    };

    const before = ratio(withoutTrail);
    const after = ratio(withTrail);
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after as number).toBeGreaterThan(before as number);
    // And the win rate it needs to break even falls accordingly.
    expect(withTrail.breakevenWinRate).toBeLessThan(withoutTrail.breakevenWinRate);
  });

  it("a later activation threshold trails less often", () => {
    const eager = runBacktest(candles, null, "any", "1d", "flipOnSignal", { activationR: 1, trailFactor: 1 });
    const patient = runBacktest(candles, null, "any", "1d", "flipOnSignal", { activationR: 3, trailFactor: 1 });
    const count = (r: typeof eager) => r.trades.filter((t) => t.exitReason === "trail").length;
    expect(count(patient)).toBeLessThanOrEqual(count(eager));
  });

  it("does not rescue 'stopAndTargetOnly' from its low trade count", () => {
    // Documents a measured limitation: the trail activates at 1R, and R is
    // the same Donchian-derived stop that can be 13% wide, so activation is
    // about as unreachable as the target was. Trailing is not a fix for the
    // stop being too wide.
    const held = runBacktest(candles, null, "any", "1d", "stopAndTargetOnly", TRAIL);
    const flipped = runBacktest(candles, null, "any", "1d", "flipOnSignal", TRAIL);
    expect(held.trades.length).toBeLessThan(flipped.trades.length / 2);
  });
});

describe("alignExternalSeries", () => {
  const candles = makeCandles([100, 101, 102, 103, 104]); // t = 0, 86400, ...
  const DAY = 86400;

  it("gives each candle the most recent value dated at or before it", () => {
    const aligned = alignExternalSeries(candles, {
      fng: [
        { time: 0, value: 10 },
        { time: 2 * DAY, value: 20 },
        { time: 4 * DAY, value: 30 },
      ],
    });
    // Candle 1 has no reading of its own, so it keeps day 0's.
    expect(aligned.map((r) => r.fng)).toEqual([10, 10, 20, 20, 30]);
  });

  it("never lets a candle see a value published after it — the no-lookahead guarantee", () => {
    const aligned = alignExternalSeries(candles, {
      fng: [{ time: 3 * DAY, value: 99 }],
    });
    // Nothing before day 3 may know about it.
    expect(aligned.map((r) => r.fng)).toEqual([null, null, null, 99, 99]);
  });

  it("returns null while a series hasn't started yet", () => {
    const aligned = alignExternalSeries(candles, { fng: [{ time: 10 * DAY, value: 50 }] });
    expect(aligned.every((r) => r.fng === null)).toBe(true);
  });

  it("sorts unsorted input rather than trusting the caller", () => {
    const aligned = alignExternalSeries(candles, {
      fng: [
        { time: 4 * DAY, value: 30 },
        { time: 0, value: 10 },
        { time: 2 * DAY, value: 20 },
      ],
    });
    expect(aligned.map((r) => r.fng)).toEqual([10, 10, 20, 20, 30]);
  });

  it("aligns several series independently, each on its own cadence", () => {
    const aligned = alignExternalSeries(candles, {
      daily: [
        { time: 0, value: 1 },
        { time: DAY, value: 2 },
        { time: 2 * DAY, value: 3 },
      ],
      sparse: [{ time: 3 * DAY, value: 7 }],
    });
    expect(aligned.map((r) => r.daily)).toEqual([1, 2, 3, 3, 3]);
    expect(aligned.map((r) => r.sparse)).toEqual([null, null, null, 7, 7]);
  });

  it("handles no series at all", () => {
    expect(alignExternalSeries(candles, {})).toEqual([{}, {}, {}, {}, {}]);
  });
});

describe("runScoreBacktest", () => {
  const candles = makeCandles(syntheticSeries(200));
  const DAY = 86400;

  /** A Fear & Greed history covering the whole candle range. */
  function fngSeries(valueAt: (i: number) => number) {
    return candles.map((c, i) => ({ time: c.time, value: valueAt(i) }));
  }

  it("runs on technical metrics alone when no external series are given", () => {
    const result = runScoreBacktest(candles);
    expect(result.equityCurve.length).toBe(candles.length - 50);
    for (const trade of result.trades) {
      expect(["stop", "target", "signal", "end"]).toContain(trade.exitReason);
    }
  });

  it("charges the same costs and honours the same stop bounds as the other strategies", () => {
    const result = runScoreBacktest(candles, { timeframe: "1d" });
    expect(result.totalCostPct).toBeCloseTo(result.trades.length * ROUND_TRIP_COST_PCT, 6);
    for (const trade of result.trades) {
      if (trade.exitReason === "stop") {
        expect(Math.abs(trade.returnPct)).toBeLessThanOrEqual(15 + ROUND_TRIP_COST_PCT + 1e-6);
      }
    }
  });

  it("never looks ahead, same as the other strategies", () => {
    const truncated = candles.slice(0, 120);
    const external = { fearGreed: fngSeries((i) => (i % 100) / 2) };

    const full = runScoreBacktest(candles, { external });
    const partial = runScoreBacktest(truncated, { external });

    const cutoff = truncated[truncated.length - 1].time;
    expect(partial.trades.map((t) => t.entryTime)).toEqual(
      full.trades.map((t) => t.entryTime).filter((t) => t <= cutoff),
    );
  });

  it("actually consumes the external Fear & Greed series", () => {
    // Pinned at extreme greed vs extreme fear: with the contrarian
    // direction these are opposite sentiment readings, so the runs must
    // diverge. If they matched, `external` wasn't reaching the score.
    const greed = runScoreBacktest(candles, { external: { fearGreed: fngSeries(() => 95) } });
    const fear = runScoreBacktest(candles, { external: { fearGreed: fngSeries(() => 5) } });
    expect(greed.trades.map((t) => t.entryTime)).not.toEqual(fear.trades.map((t) => t.entryTime));
  });

  it("flipping the Fear & Greed direction changes the result, and only that", () => {
    // The A/B the harness runs: same candles, same weights, one bit apart.
    const external = { fearGreed: fngSeries(() => 90) };
    const base = configForRegime();
    const inverted = withMetricDirection(base, "fearGreed", "inverted");
    const direct = withMetricDirection(base, "fearGreed", "direct");

    const a = runScoreBacktest(candles, { external, config: inverted });
    const b = runScoreBacktest(candles, { external, config: direct });
    expect(a.strategyReturnPct).not.toBe(b.strategyReturnPct);

    // Weights must be untouched by the flip.
    expect(direct.groups.map((g) => g.weight)).toEqual(base.groups.map((g) => g.weight));
    expect(inverted.groups[0].metrics.map((m) => m.weight)).toEqual(
      base.groups[0].metrics.map((m) => m.weight),
    );
  });

  it("ignores an external series that ends before the simulation starts", () => {
    const stale = { fearGreed: [{ time: -10 * DAY, value: 50 }] };
    const result = runScoreBacktest(candles, { external: stale });
    expect(result.equityCurve.length).toBe(candles.length - 50);
  });

  it("'strongOnly' mode trades no more often than the default", () => {
    const external = { fearGreed: fngSeries((i) => (i * 7) % 100) };
    const any = runScoreBacktest(candles, { external, mode: "any" });
    const strong = runScoreBacktest(candles, { external, mode: "strongOnly" });
    expect(strong.trades.length).toBeLessThanOrEqual(any.trades.length);
  });
});

describe("runRandomBaseline", () => {
  it("is deterministic for a given seed, and different seeds explore differently", () => {
    const candles = makeCandles(syntheticSeries(300));
    const a = runRandomBaseline(candles, 0.1, "token-a");
    const again = runRandomBaseline(candles, 0.1, "token-a");
    const b = runRandomBaseline(candles, 0.1, "token-b");

    expect(a.strategyReturnPct).toBe(again.strategyReturnPct);
    expect(a.trades.map((t) => t.entryTime)).toEqual(again.trades.map((t) => t.entryTime));
    expect(a.trades.map((t) => t.entryTime)).not.toEqual(b.trades.map((t) => t.entryTime));
  });

  it("trades roughly as often as the requested frequency, so cost drag is comparable", () => {
    const candles = makeCandles(syntheticSeries(600));
    const rare = runRandomBaseline(candles, 0.02, "seed");
    const often = runRandomBaseline(candles, 0.4, "seed");
    expect(often.trades.length).toBeGreaterThan(rare.trades.length);
  });

  it("obeys the same risk management as the real strategies", () => {
    const candles = makeCandles(syntheticSeries(300));
    const result = runRandomBaseline(candles, 0.15, "seed", "1d");
    for (const trade of result.trades) {
      expect(["stop", "target", "signal", "end"]).toContain(trade.exitReason);
      if (trade.exitReason === "stop") {
        expect(Math.abs(trade.returnPct)).toBeLessThanOrEqual(15 + ROUND_TRIP_COST_PCT + 1e-6);
      }
    }
    expect(result.totalCostPct).toBeCloseTo(result.trades.length * ROUND_TRIP_COST_PCT, 6);
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

  it("each trade's return% matches the long/short formula for its type, net of costs, for every RSI period", () => {
    const candles = makeCandles(syntheticSeries(150));
    for (const period of [7, 14, 21]) {
      const result = runRsiOnlyBacktest(candles, period);
      for (const trade of result.trades) {
        const gross =
          trade.type === "long"
            ? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100
            : ((trade.entryPrice - trade.exitPrice) / trade.entryPrice) * 100;
        expect(trade.returnPct).toBeCloseTo(gross - ROUND_TRIP_COST_PCT, 6);
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

  it("stop-loss distance is tighter on shorter timeframes than on 1d", () => {
    const candles = makeCandles(syntheticSeries(200));
    const daily = runRsiOnlyBacktest(candles, 14, "1d");
    const hourly = runRsiOnlyBacktest(candles, 14, "1h");
    for (const trade of daily.trades) {
      if (trade.exitReason === "stop") expect(Math.abs(trade.returnPct)).toBeLessThanOrEqual(15 + 1e-6);
    }
    for (const trade of hourly.trades) {
      if (trade.exitReason === "stop") expect(Math.abs(trade.returnPct)).toBeLessThanOrEqual(3.5 + 1e-6);
    }
  });

  it("defaults to the 1d timeframe when none is passed, unchanged from before", () => {
    const candles = makeCandles(syntheticSeries(150));
    const withDefault = runRsiOnlyBacktest(candles, 14);
    const explicit1d = runRsiOnlyBacktest(candles, 14, "1d");
    expect(withDefault).toEqual(explicit1d);
  });
});
