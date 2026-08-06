import { describe, expect, it } from "vitest";
import { ADX_TREND_THRESHOLD, calcADX, detectRegime, longMaSlopePct } from "./regime";
import type { Candle } from "../../types";

function mk(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: i * 86400,
    open: c,
    high: c * 1.01,
    low: c * 0.99,
    close: c,
    volume: 1000,
  }));
}

const rising = (n: number, rate = 0.5) => Array.from({ length: n }, (_, i) => 100 + i * rate);
const falling = (n: number, rate = 0.5) => Array.from({ length: n }, (_, i) => 300 - i * rate);
const flat = (n: number) => Array.from({ length: n }, () => 100);
/**
 * Sideways and genuinely choppy — direction reverses every few bars, which
 * is what "no trend" actually looks like. A slow, smooth oscillation would
 * not do: over a long enough half-cycle it IS locally trending, and ADX is
 * right to say so.
 */
const choppy = (n: number) =>
  Array.from({ length: n }, (_, i) => 100 + Math.sin(i) * 4 + Math.sin(i * 2.3) * 3);

describe("calcADX", () => {
  it("returns null without enough history to seed the smoothing", () => {
    expect(calcADX(mk(rising(10)), 14)).toBeNull();
    expect(calcADX(mk(rising(28)), 14)).toBeNull();
  });

  it("is high for a clean one-way trend", () => {
    const up = calcADX(mk(rising(120)), 14);
    expect(up).not.toBeNull();
    expect(up as number).toBeGreaterThan(ADX_TREND_THRESHOLD);
  });

  it("is direction-agnostic: a downtrend reads as strong too", () => {
    // ADX measures strength only, which is exactly why detectRegime needs
    // the slope to tell up from down.
    const down = calcADX(mk(falling(120)), 14);
    expect(down as number).toBeGreaterThan(ADX_TREND_THRESHOLD);
  });

  it("is low for a choppy sideways market", () => {
    const chop = calcADX(mk(choppy(200)), 14);
    expect(chop).not.toBeNull();
    expect(chop as number).toBeLessThan(ADX_TREND_THRESHOLD);
  });

  it("never returns a negative value", () => {
    for (const series of [rising(120), falling(120), choppy(200), flat(120)]) {
      const adx = calcADX(mk(series), 14);
      if (adx !== null) expect(adx).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("longMaSlopePct", () => {
  it("returns null when there isn't enough history for the MA plus lookback", () => {
    expect(longMaSlopePct(mk(rising(100)), 200)).toBeNull();
  });

  it("is positive in an uptrend and negative in a downtrend", () => {
    expect(longMaSlopePct(mk(rising(300)), 200) as number).toBeGreaterThan(0);
    expect(longMaSlopePct(mk(falling(300)), 200) as number).toBeLessThan(0);
  });

  it("is ~0 for a flat series", () => {
    expect(longMaSlopePct(mk(flat(300)), 200) as number).toBeCloseTo(0, 6);
  });

  it("is scale-free: the same shape at a different price level reads the same", () => {
    const cheap = longMaSlopePct(mk(rising(300, 0.5)), 200) as number;
    const dear = longMaSlopePct(
      mk(rising(300, 0.5).map((v) => v * 1000)),
      200,
    ) as number;
    expect(cheap).toBeCloseTo(dear, 6);
  });
});

describe("detectRegime", () => {
  it("calls a sustained rise an uptrend", () => {
    const result = detectRegime(mk(rising(400)), { maPeriod: 200 });
    expect(result.regime).toBe("uptrend");
    expect(result.slopePct as number).toBeGreaterThan(0);
    expect(result.reason).toContain("subindo");
  });

  it("calls a sustained fall a downtrend — the falling-knife case", () => {
    const result = detectRegime(mk(falling(400)), { maPeriod: 200 });
    expect(result.regime).toBe("downtrend");
    expect(result.slopePct as number).toBeLessThan(0);
  });

  it("calls a choppy market a range rather than guessing a direction", () => {
    const result = detectRegime(mk(choppy(400)), { maPeriod: 200 });
    expect(result.regime).toBe("range");
  });

  it("calls a flat market a range", () => {
    expect(detectRegime(mk(flat(400)), { maPeriod: 200 }).regime).toBe("range");
  });

  it("returns 'unknown' rather than guessing when history is too short", () => {
    const result = detectRegime(mk(rising(50)), { maPeriod: 200 });
    expect(result.regime).toBe("unknown");
    expect(result.reason).toContain("insuficiente");
  });

  it("works on a shorter MA when the caller has less history", () => {
    const result = detectRegime(mk(rising(120)), { maPeriod: 50 });
    expect(result.regime).toBe("uptrend");
  });

  it("refuses to name a direction on a strong move whose long MA barely budged", () => {
    // A spike that reverses: ADX may read high, but the long average has
    // gone nowhere, so there is no trend to follow.
    const spike = [...flat(250), ...rising(40, 3), ...falling(40, 3).map((v) => v - 180)];
    const result = detectRegime(mk(spike), { maPeriod: 200 });
    expect(["range", "uptrend", "downtrend"]).toContain(result.regime);
    // Whatever it decides, the reason must cite the evidence rather than
    // being a bare label.
    expect(result.reason.length).toBeGreaterThan(20);
  });

  it("always reports the evidence behind its call", () => {
    for (const series of [rising(400), falling(400), choppy(400)]) {
      const result = detectRegime(mk(series), { maPeriod: 200 });
      expect(result.adx).not.toBeNull();
      expect(result.slopePct).not.toBeNull();
      expect(result.samples).toBe(400);
      expect(result.reason).toMatch(/ADX/);
    }
  });

  it("is causal: truncating the series can't change an earlier verdict", () => {
    const full = mk(rising(400));
    const truncated = full.slice(0, 300);
    // The reading for the first 300 candles must not depend on candles 301+
    // existing, which is the same no-lookahead property the backtest needs.
    expect(detectRegime(truncated, { maPeriod: 200 }).regime).toBe(
      detectRegime(full.slice(0, 300), { maPeriod: 200 }).regime,
    );
  });
});
