import { fetchKlines, symbolForToken } from "./binance";
import { fetchCandlesForTimeframe } from "./coingecko";
import type { Candle } from "../types";

export const BTC_TOKEN_ID = "bitcoin";

// The backtest wants as much history as it can get by default — a handful
// of trades over 6 months isn't enough to say anything statistically
// meaningful. Binance allows up to 1000 daily candles per request (~2.7
// years); CoinGecko's free/demo tier caps historical daily data at 365
// days no matter what's asked for, so that's the ceiling on that path.
const BACKTEST_BINANCE_LIMIT = 1000;
const BACKTEST_COINGECKO_LOOKBACK_DAYS = 365;

export interface BacktestWindowOption {
  label: string;
  /** Requested days of history; undefined = as much as each source allows. */
  days?: number;
}

export const BACKTEST_WINDOW_OPTIONS: BacktestWindowOption[] = [
  { label: "6 meses", days: 180 },
  { label: "1 ano", days: 365 },
  { label: "2 anos", days: 730 },
  { label: "Máximo disponível", days: undefined },
];

/** Shared by useBacktest (single token), useBacktestAll (whole watchlist),
 * and useRsiBacktest — same Binance-first/CoinGecko-fallback path the rest
 * of the app uses for daily candles, just asking for a much deeper window
 * than the live chart needs (and configurable per run via `windowDays`,
 * since "however much the API happens to return" was hard to reason
 * about). Binance's daily candles map 1:1 to days, so the same day count
 * works as the `limit` for that path too. */
export async function fetchDailyCandles(
  tokenId: string,
  apiKey?: string,
  windowDays?: number,
): Promise<Candle[]> {
  const symbol = symbolForToken(tokenId);
  const binanceLimit = windowDays ? Math.min(windowDays, BACKTEST_BINANCE_LIMIT) : BACKTEST_BINANCE_LIMIT;
  const coingeckoDays = windowDays
    ? Math.min(windowDays, BACKTEST_COINGECKO_LOOKBACK_DAYS)
    : BACKTEST_COINGECKO_LOOKBACK_DAYS;
  return symbol
    ? await fetchKlines(symbol, "1d", binanceLimit)
    : await fetchCandlesForTimeframe(tokenId, "1d", apiKey, coingeckoDays);
}
