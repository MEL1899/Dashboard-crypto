import {
  bollingerPercentB,
  calcBollingerBands,
  calcMACD,
  calcRSI,
  emaDistancePct,
} from "../indicators";
import type { Candle } from "../../types";
import type { RsiByTimeframe, ScoreMetricInputs } from "./signalScore";

/**
 * Turns raw candles into the numbers computeSignalScore expects.
 *
 * Kept separate from the fetching hooks so the conversion is pure and
 * testable: given candles in, the metric values out are deterministic, and
 * nothing here knows about React, APIs or caching.
 */

/** Long EMA used for the trend metric. 50 on the daily is long enough to
 * describe the prevailing trend without needing the ~200 candles a 200-EMA
 * would demand — the shorter free-tier histories often can't supply that. */
export const LONG_EMA_PERIOD = 50;

/** The non-RSI technical metrics are read off a single reference
 * timeframe. RSI is the one the brief specifies as multi-timeframe; giving
 * every metric its own blend would multiply the fetches without any
 * evidence that it helps. */
export const REFERENCE_TIMEFRAME = "1d";

export interface TechnicalMetricsFromCandles {
  rsi: number | null;
  bollingerPercentB: number | null;
  macdHistogram: number | null;
  emaDistance: number | null;
}

/**
 * Every technical metric derivable from one candle series. Each is null
 * when the series is too short for it, which the score handles by dropping
 * the metric and renormalizing the remaining weights.
 */
export function technicalMetricsFromCandles(candles: Candle[]): TechnicalMetricsFromCandles {
  if (candles.length === 0) {
    return { rsi: null, bollingerPercentB: null, macdHistogram: null, emaDistance: null };
  }

  const lastClose = candles[candles.length - 1].close;

  const rsiSeries = calcRSI(candles);
  const rsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : null;

  const bbSeries = calcBollingerBands(candles);
  const lastBb = bbSeries[bbSeries.length - 1];

  const macdSeries = calcMACD(candles);
  const lastMacd = macdSeries[macdSeries.length - 1];

  return {
    rsi,
    bollingerPercentB: lastBb ? bollingerPercentB(lastClose, lastBb) : null,
    // As a % of price, so the value is comparable across assets rather than
    // scaling with whatever the token happens to cost.
    macdHistogram: lastMacd && lastClose !== 0 ? (lastMacd.histogram / lastClose) * 100 : null,
    emaDistance: emaDistancePct(candles, LONG_EMA_PERIOD),
  };
}

/** Just the RSI, for the timeframes that only contribute that. */
export function rsiFromCandles(candles: Candle[]): number | null {
  const series = calcRSI(candles);
  return series.length > 0 ? series[series.length - 1].value : null;
}

export interface CandlesByTimeframe {
  "1h"?: Candle[] | null;
  "4h"?: Candle[] | null;
  "1d"?: Candle[] | null;
}

export interface ExternalMetricValues {
  /** Alternative.me Fear & Greed, 0-100. */
  fearGreed?: number | null;
  mvrvZScore?: number | null;
  fundingRate?: number | null;
  exchangeNetflow?: number | null;
}

/**
 * Assembles the complete input bag: RSI blended across whichever of
 * 1h/4h/1d are available, the remaining technical metrics off the daily,
 * and whatever external readings the caller managed to fetch.
 *
 * Anything missing stays null rather than being guessed at — the score
 * drops it, renormalizes, and reports lower coverage, which is a truthful
 * "we know less right now" instead of a confident number built on filler.
 */
export function buildScoreInputs(
  candles: CandlesByTimeframe,
  external: ExternalMetricValues = {},
): ScoreMetricInputs {
  const daily = candles["1d"] ?? null;
  const technical = daily
    ? technicalMetricsFromCandles(daily)
    : { rsi: null, bollingerPercentB: null, macdHistogram: null, emaDistance: null };

  const rsi: RsiByTimeframe = {
    "1h": candles["1h"] ? rsiFromCandles(candles["1h"]) : null,
    "4h": candles["4h"] ? rsiFromCandles(candles["4h"]) : null,
    "1d": technical.rsi,
  };

  return {
    rsi,
    bollingerPercentB: technical.bollingerPercentB,
    macdHistogram: technical.macdHistogram,
    emaDistance: technical.emaDistance,
    mvrvZScore: external.mvrvZScore ?? null,
    fundingRate: external.fundingRate ?? null,
    exchangeNetflow: external.exchangeNetflow ?? null,
    fearGreed: external.fearGreed ?? null,
  };
}
