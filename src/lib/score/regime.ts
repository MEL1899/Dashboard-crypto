import type { Candle } from "../../types";
import type { MarketRegime } from "./config";

/**
 * Market regime detection: is price trending up, trending down, or going
 * nowhere?
 *
 * This is the layer that addresses the "falling knife" risk head-on. The
 * score is contrarian in all three groups — RSI and Bollinger read
 * mean-reversion, MVRV reads overvaluation, Fear & Greed reads
 * contrarian — and a purely contrarian system buys dips all the way down a
 * bear market. Knowing the regime is what lets a caller demand more
 * conviction before buying a dip in a downtrend, rather than trying to
 * compensate for it by nudging weights.
 *
 * Two independent readings are combined, as the research doc suggests
 * (section 5): ADX for whether a trend exists at all, and the slope of a
 * long moving average for which way it points. ADX alone says "trending"
 * without a direction; slope alone calls every drift a trend.
 *
 * Pure and causal: it only ever sees the candles handed to it, so feeding
 * it a window that ends at "today" keeps the no-lookahead guarantee.
 */

/** Below this, ADX is conventionally read as "no trend worth trading". */
export const ADX_TREND_THRESHOLD = 20;
/** Slope is measured over this many periods of the long MA, as a % of
 * price, so the reading doesn't depend on the asset's price scale. */
export const SLOPE_LOOKBACK = 20;
/** A long MA drifting less than this over the lookback is flat, not
 * trending — without it, rounding noise alone would name a direction. */
export const FLAT_SLOPE_PCT = 1;

export const DEFAULT_ADX_PERIOD = 14;
export const DEFAULT_MA_PERIOD = 200;
/**
 * Long-MA period used by the live app.
 *
 * 200 is the textbook figure but needs 220 candles, and the app fetches 180
 * daily ones — with the default the live reading would have been "unknown"
 * forever, which is how a detector ends up silently doing nothing. 100
 * needs 120 candles, fits comfortably, and is still long enough that a
 * couple of sharp days don't flip its slope.
 */
export const LIVE_MA_PERIOD = 100;

export interface RegimeResult {
  regime: MarketRegime;
  /** ADX value, or null when there isn't enough history. */
  adx: number | null;
  /** Long-MA change over SLOPE_LOOKBACK periods, in % of its own level. */
  slopePct: number | null;
  /** Periods of history the reading is based on. */
  samples: number;
  /** Plain-language explanation, for the UI. */
  reason: string;
}

/**
 * Wilder's ADX. Measures trend STRENGTH only and is always positive — it
 * says nothing about direction, which is why the slope check below exists.
 */
export function calcADX(candles: Candle[], period = DEFAULT_ADX_PERIOD): number | null {
  // Needs `period` bars to seed the smoothing and another `period` for the
  // DX average that ADX is built from.
  if (candles.length < period * 2 + 1) return null;

  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    // Only the larger of the two counts, and only when positive: a bar that
    // extends both ways is ambiguous, not doubly informative.
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);

    trs.push(
      Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)),
    );
  }

  // Wilder smoothing: seed with a plain sum, then decay by 1/period.
  const smooth = (values: number[]): number[] => {
    const out: number[] = [];
    let acc = values.slice(0, period).reduce((s, v) => s + v, 0);
    out.push(acc);
    for (let i = period; i < values.length; i++) {
      acc = acc - acc / period + values[i];
      out.push(acc);
    }
    return out;
  };

  const smoothedTr = smooth(trs);
  const smoothedPlus = smooth(plusDMs);
  const smoothedMinus = smooth(minusDMs);

  const dxs: number[] = [];
  for (let i = 0; i < smoothedTr.length; i++) {
    // No range, or no directional movement either way, means DX = 0 — an
    // actual reading of "no trend". Skipping these instead would collapse
    // a perfectly flat market to "not enough data", which is a different
    // claim entirely and the wrong one.
    if (smoothedTr[i] === 0) {
      dxs.push(0);
      continue;
    }
    const plusDI = (smoothedPlus[i] / smoothedTr[i]) * 100;
    const minusDI = (smoothedMinus[i] / smoothedTr[i]) * 100;
    const sum = plusDI + minusDI;
    dxs.push(sum === 0 ? 0 : (Math.abs(plusDI - minusDI) / sum) * 100);
  }

  if (dxs.length < period) return null;
  // ADX is the smoothed average of DX; the final value is what callers want.
  let adx = dxs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dxs.length; i++) {
    adx = (adx * (period - 1) + dxs[i]) / period;
  }
  return adx;
}

/** Change in the long moving average over the lookback, as a % of its own
 * current level — scale-free, so 2% means the same on BTC and on a
 * sub-cent altcoin. */
export function longMaSlopePct(
  candles: Candle[],
  maPeriod = DEFAULT_MA_PERIOD,
  lookback = SLOPE_LOOKBACK,
): number | null {
  if (candles.length < maPeriod + lookback) return null;

  const maAt = (endIndex: number): number => {
    let sum = 0;
    for (let i = endIndex - maPeriod + 1; i <= endIndex; i++) sum += candles[i].close;
    return sum / maPeriod;
  };

  const now = maAt(candles.length - 1);
  const before = maAt(candles.length - 1 - lookback);
  if (before === 0) return null;
  return ((now - before) / before) * 100;
}

/**
 * Combines the two readings into a regime.
 *
 * Deliberately conservative: anything it can't confidently call a trend
 * comes back "range", and missing history comes back "unknown" rather than
 * a guess. A wrong regime label is worse than no label, because the whole
 * point is to make the caller more careful.
 *
 * `maPeriod` defaults to 200, which needs 220 candles of history. Shorter
 * series should pass something smaller rather than accept "unknown".
 */
export function detectRegime(
  candles: Candle[],
  options: { adxPeriod?: number; maPeriod?: number } = {},
): RegimeResult {
  const { adxPeriod = DEFAULT_ADX_PERIOD, maPeriod = DEFAULT_MA_PERIOD } = options;

  const adx = calcADX(candles, adxPeriod);
  const slopePct = longMaSlopePct(candles, maPeriod);
  const samples = candles.length;

  if (adx === null || slopePct === null) {
    return {
      regime: "unknown",
      adx,
      slopePct,
      samples,
      reason: `Histórico insuficiente: são necessárias ~${maPeriod + SLOPE_LOOKBACK} velas para a média longa e ~${adxPeriod * 2 + 1} para o ADX.`,
    };
  }

  if (adx < ADX_TREND_THRESHOLD) {
    return {
      regime: "range",
      adx,
      slopePct,
      samples,
      reason: `ADX ${adx.toFixed(1)} abaixo de ${ADX_TREND_THRESHOLD} — sem tendência definida, mercado lateral.`,
    };
  }

  if (Math.abs(slopePct) < FLAT_SLOPE_PCT) {
    return {
      regime: "range",
      adx,
      slopePct,
      samples,
      reason: `ADX ${adx.toFixed(1)} indica movimento, mas a média longa variou só ${slopePct.toFixed(2)}% — sem direção clara.`,
    };
  }

  const up = slopePct > 0;
  return {
    regime: up ? "uptrend" : "downtrend",
    adx,
    slopePct,
    samples,
    reason: `ADX ${adx.toFixed(1)} com média longa ${up ? "subindo" : "caindo"} ${Math.abs(slopePct).toFixed(2)}% em ${SLOPE_LOOKBACK} períodos.`,
  };
}
