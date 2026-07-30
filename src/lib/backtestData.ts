import { fetchKlines, symbolForToken } from "./binance";
import { fetchCandlesForTimeframe } from "./coingecko";
import type { BacktestTimeframe } from "./backtest";
import type { Candle } from "../types";

export const BTC_TOKEN_ID = "bitcoin";

export interface BacktestWindowOption {
  label: string;
  /** Requested days of history; undefined = as much as each source allows. */
  days?: number;
}

interface TimeframeDataConfig {
  /** Candles per calendar day, to convert a day-based window into Binance's
   * candle-count `limit` param. */
  candlesPerDay: number;
  /** Binance's hard per-request cap is 1000 candles regardless of
   * timeframe, but that's a lot more calendar time on 1d than on 1h. */
  binanceMaxCandles: number;
  /** CoinGecko's free/demo tier only returns genuine sub-daily granularity
   * within ~90 days of "now" — beyond that it silently falls back to daily
   * points no matter what's asked for, so intraday windows are capped here
   * to avoid quietly faking hourly/4h candles out of daily data. Daily
   * itself is capped at 365 days, that tier's own ceiling. */
  coingeckoMaxDays: number;
  windowOptions: BacktestWindowOption[];
}

const TIMEFRAME_DATA_CONFIG: Record<BacktestTimeframe, TimeframeDataConfig> = {
  "1h": {
    candlesPerDay: 24,
    binanceMaxCandles: 1000,
    coingeckoMaxDays: 90,
    windowOptions: [
      { label: "7 dias", days: 7 },
      { label: "20 dias", days: 20 },
      { label: "Máximo disponível", days: undefined },
    ],
  },
  "4h": {
    candlesPerDay: 6,
    binanceMaxCandles: 1000,
    coingeckoMaxDays: 90,
    windowOptions: [
      { label: "30 dias", days: 30 },
      { label: "90 dias", days: 90 },
      { label: "Máximo disponível", days: undefined },
    ],
  },
  "1d": {
    candlesPerDay: 1,
    binanceMaxCandles: 1000,
    coingeckoMaxDays: 365,
    windowOptions: [
      { label: "6 meses", days: 180 },
      { label: "1 ano", days: 365 },
      { label: "2 anos", days: 730 },
      { label: "Máximo disponível", days: undefined },
    ],
  },
};

/** Window choices (and their real data ceiling) for each backtest
 * timeframe — the finer the candle, the less real history either API can
 * actually back it with, so the options differ per timeframe rather than
 * offering a "2 anos" that quietly can't be honored on 1h. */
export const BACKTEST_WINDOW_OPTIONS: Record<BacktestTimeframe, BacktestWindowOption[]> = {
  "1h": TIMEFRAME_DATA_CONFIG["1h"].windowOptions,
  "4h": TIMEFRAME_DATA_CONFIG["4h"].windowOptions,
  "1d": TIMEFRAME_DATA_CONFIG["1d"].windowOptions,
};

/** Shared by useBacktestAll (whole watchlist) and useRsiBacktestAll — same
 * Binance-first/CoinGecko-fallback path the rest of the app uses for
 * candles, just asking for a much deeper window than the live chart needs
 * (and configurable per run via `windowDays`, since "however much the API
 * happens to return" was hard to reason about). */
export async function fetchBacktestCandles(
  tokenId: string,
  timeframe: BacktestTimeframe,
  apiKey?: string,
  windowDays?: number,
): Promise<Candle[]> {
  const config = TIMEFRAME_DATA_CONFIG[timeframe];
  const symbol = symbolForToken(tokenId);
  if (symbol) {
    const candleCount = windowDays
      ? Math.min(Math.round(windowDays * config.candlesPerDay), config.binanceMaxCandles)
      : config.binanceMaxCandles;
    return await fetchKlines(symbol, timeframe, candleCount);
  }
  const coingeckoDays = windowDays ? Math.min(windowDays, config.coingeckoMaxDays) : config.coingeckoMaxDays;
  return await fetchCandlesForTimeframe(tokenId, timeframe, apiKey, coingeckoDays);
}
