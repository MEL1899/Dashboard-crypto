import { fetchKlines, symbolForToken } from "./binance";
import { fetchCandlesForTimeframe } from "./coingecko";
import type { Candle } from "../types";

export const BTC_TOKEN_ID = "bitcoin";

// The backtest wants as much history as it can get — a handful of trades
// over 6 months isn't enough to say anything statistically meaningful.
// Binance allows up to 1000 daily candles per request (~2.7 years);
// CoinGecko's free/demo tier caps historical daily data at 365 days no
// matter what's asked for, so that's the ceiling on that path.
const BACKTEST_BINANCE_LIMIT = 1000;
const BACKTEST_COINGECKO_LOOKBACK_DAYS = 365;

/** Shared by useBacktest (single token) and useBacktestAll (whole
 * watchlist) — same Binance-first/CoinGecko-fallback path the rest of the
 * app uses for daily candles, just asking for a much deeper window than
 * the live chart needs. */
export async function fetchDailyCandles(tokenId: string, apiKey?: string): Promise<Candle[]> {
  const symbol = symbolForToken(tokenId);
  return symbol
    ? await fetchKlines(symbol, "1d", BACKTEST_BINANCE_LIMIT)
    : await fetchCandlesForTimeframe(tokenId, "1d", apiKey, BACKTEST_COINGECKO_LOOKBACK_DAYS);
}
