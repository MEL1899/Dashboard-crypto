import type { BollingerBands, Candle, IndicatorPoint, MACDPoint } from "../types";

/**
 * Wilder's RSI (the standard used by most charting platforms).
 */
export function calcRSI(candles: Candle[], period = 14): IndicatorPoint[] {
  if (candles.length < period + 1) return [];

  const out: IndicatorPoint[] = [];
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out.push({ time: candles[period].time, value: rsiFromAverages(avgGain, avgLoss) });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].time, value: rsiFromAverages(avgGain, avgLoss) });
  }

  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calcSMA(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) {
      out.push({ time: candles[i].time, value: sum / period });
    }
  }
  return out;
}

export function calcBollingerBands(
  candles: Candle[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerBands[] {
  const out: BollingerBands[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const mean = window.reduce((s, c) => s + c.close, 0) / period;
    const variance =
      window.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    out.push({
      time: candles[i].time,
      middle: mean,
      upper: mean + stdDevMultiplier * stdDev,
      lower: mean - stdDevMultiplier * stdDev,
    });
  }
  return out;
}

export function calcVolumeSeries(candles: Candle[]): IndicatorPoint[] {
  return candles.map((c) => ({ time: c.time, value: c.volume }));
}

function calcEMASeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

/** Last EMA value of the closing series, or null without enough candles to
 * let the average settle (the seed is just the first close, so a short
 * series would mostly report that seed back). */
export function calcEMA(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const series = calcEMASeries(
    candles.map((c) => c.close),
    period,
  );
  return series[series.length - 1];
}

/**
 * How far the latest close sits from its long EMA, in % of the EMA —
 * positive above, negative below. Scale-free, so the reading means the same
 * on any asset.
 *
 * Shared by the live score and the backtest on purpose: if one measured
 * distance-to-EMA and the other distance-to-SMA, the score being backtested
 * would not be the score being displayed.
 */
export function emaDistancePct(candles: Candle[], period: number): number | null {
  const ema = calcEMA(candles, period);
  if (ema === null || ema === 0) return null;
  const lastClose = candles[candles.length - 1].close;
  return ((lastClose - ema) / ema) * 100;
}

/** Bollinger %b — 0 = price at the lower band, 1 = at the upper. Null when
 * the bands have collapsed to a single line and position is undefined. */
export function bollingerPercentB(price: number, band: { upper: number; lower: number }): number | null {
  const width = band.upper - band.lower;
  if (width <= 0) return null;
  return (price - band.lower) / width;
}

/**
 * MACD (12/26 EMA difference, 9-period EMA signal line) — the classic
 * momentum companion to RSI: RSI flags "stretched", MACD flags whether
 * momentum has actually turned.
 */
export function calcMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDPoint[] {
  if (candles.length < slowPeriod + signalPeriod) return [];

  const closes = candles.map((c) => c.close);
  const fastEma = calcEMASeries(closes, fastPeriod);
  const slowEma = calcEMASeries(closes, slowPeriod);
  const macdLine = closes.map((_, i) => fastEma[i] - slowEma[i]);
  const signalLine = calcEMASeries(macdLine.slice(slowPeriod - 1), signalPeriod);

  const out: MACDPoint[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    const candleIndex = i + slowPeriod - 1;
    const macd = macdLine[candleIndex];
    const signal = signalLine[i];
    out.push({
      time: candles[candleIndex].time,
      macd,
      signal,
      histogram: macd - signal,
    });
  }
  return out;
}

/** Bullish once the MACD line sits above its signal line, bearish below. */
export type MacdSignal = "bullish" | "bearish" | "neutral";

export function macdSignal(points: MACDPoint[]): MacdSignal {
  if (points.length === 0) return "neutral";
  const last = points[points.length - 1];
  if (last.histogram > 0) return "bullish";
  if (last.histogram < 0) return "bearish";
  return "neutral";
}

/** Simple momentum read used for a plain-language insight badge. */
export function rsiSignal(value: number): "oversold" | "overbought" | "neutral" {
  if (value <= 30) return "oversold";
  if (value >= 70) return "overbought";
  return "neutral";
}

export type BbPosition = "above-upper" | "below-lower" | "inside";

export function bbSignal(close: number, band: BollingerBands): BbPosition {
  if (close >= band.upper) return "above-upper";
  if (close <= band.lower) return "below-lower";
  return "inside";
}

/**
 * Whether the latest candle's volume is a real spike (>= 1.5x the trailing
 * average), the classic "does the move have volume behind it" check — a
 * price touching a support/resistance band on unusually high volume is a
 * more meaningful signal than the same touch on quiet, average volume.
 */
export function isVolumeSpike(candles: Candle[], period = 20): boolean {
  if (candles.length < period + 1) return false;
  const window = candles.slice(-period - 1, -1);
  const avgVolume = window.reduce((sum, c) => sum + c.volume, 0) / window.length;
  if (avgVolume <= 0) return false;
  const lastVolume = candles[candles.length - 1].volume;
  return lastVolume / avgVolume >= 1.5;
}

export type TrendSignal = "up" | "down" | "neutral";

/**
 * Trend filter using a 20/50-period SMA pair — shorter than the classic
 * 50/200 so it stays computable on every timeframe this app fetches
 * (1h only pulls ~168 candles, 1M only ~120, both short of 200). Reads
 * uptrend when price and the fast SMA both sit above the slow one,
 * downtrend when both sit below, and neutral on a crossover/transition.
 * Exists to give RSI/Bollinger's mean-reversion calls some context: an
 * "oversold" RSI reading in a downtrend can just be a falling knife, not
 * a dip worth buying.
 */
export function trendSignal(candles: Candle[]): TrendSignal {
  const fast = calcSMA(candles, 20);
  const slow = calcSMA(candles, 50);
  if (fast.length === 0 || slow.length === 0) return "neutral";
  const lastClose = candles[candles.length - 1].close;
  const lastFast = fast[fast.length - 1].value;
  const lastSlow = slow[slow.length - 1].value;
  if (lastClose > lastSlow && lastFast > lastSlow) return "up";
  if (lastClose < lastSlow && lastFast < lastSlow) return "down";
  return "neutral";
}

function periodChangePct(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  if (first <= 0) return 0;
  return ((last - first) / first) * 100;
}

export type RelativeStrengthSignal = "outperforming" | "underperforming" | "inline";

/**
 * The timeframes the app reads indicators across. Separate from the chart's
 * own `Timeframe` (types/index.ts) even though they currently list the same
 * values, so adding a chart-only granularity wouldn't silently enlarge
 * every signal table.
 */
export type SignalTimeframe = "1h" | "4h" | "1d" | "1w" | "1M";

/**
 * One timeframe's worth of indicator readings, in categorical form.
 *
 * This is the raw indicator view the detail table renders — it is NOT a
 * score and nothing here weights or combines anything. The scoring lives
 * entirely in lib/score, which reads numeric values rather than these
 * buckets.
 */
export interface TimeframeSignal {
  rsi: number;
  macd: MacdSignal;
  bbPosition: BbPosition;
  /** Was the last candle's volume a real spike (>= 1.5x trailing average)? */
  volumeSpike: boolean;
  trend: TrendSignal;
  /** The token's own move vs. BTC's over the same window. */
  relativeStrength: RelativeStrengthSignal;
}

const RELATIVE_STRENGTH_THRESHOLD_PP = 5;

/**
 * Compares the token's own % change over the fetched window against BTC's
 * % change over the same window and timeframe — flags whether a move is
 * the token genuinely standing out, or just following the rest of the
 * market up or down together (which RSI/MACD/Bollinger alone can't tell
 * apart, since they only look at the token's own price).
 */
export function relativeStrengthSignal(
  tokenCandles: Candle[],
  btcCandles: Candle[],
): RelativeStrengthSignal {
  const diff = periodChangePct(tokenCandles) - periodChangePct(btcCandles);
  if (diff >= RELATIVE_STRENGTH_THRESHOLD_PP) return "outperforming";
  if (diff <= -RELATIVE_STRENGTH_THRESHOLD_PP) return "underperforming";
  return "inline";
}
