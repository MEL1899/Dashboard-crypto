import { fetchKlines, symbolForToken } from "./binance";
import { fetchCandlesForTimeframe } from "./coingecko";
import type { Candle } from "../types";

export const BTC_TOKEN_ID = "bitcoin";

/** Shared by useBacktest (single token) and useBacktestAll (whole
 * watchlist) — same Binance-first/CoinGecko-fallback path the rest of the
 * app uses for daily candles. */
export async function fetchDailyCandles(tokenId: string, apiKey?: string): Promise<Candle[]> {
  const symbol = symbolForToken(tokenId);
  return symbol ? await fetchKlines(symbol, "1d") : await fetchCandlesForTimeframe(tokenId, "1d", apiKey);
}
