import { useEffect, useState } from "react";
import { fetchTickers, symbolForToken } from "../lib/binance";
import { fetchMarketTokens } from "../lib/coingecko";
import { mockMarketTokens } from "../lib/mock";
import type { MarketToken } from "../types";

interface WatchlistTokensState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  tokens: MarketToken[];
}

/**
 * CoinGecko supplies market cap/name/image; wherever a token also has a
 * Binance pair, its price/24h-change/volume get overridden by the live
 * Binance ticker instead — that's the same source the chart uses for that
 * token, so the two can never disagree.
 */
async function withBinancePrices(tokens: MarketToken[]): Promise<MarketToken[]> {
  const symbolByTokenId = new Map<string, string>();
  for (const t of tokens) {
    const symbol = symbolForToken(t.id);
    if (symbol) symbolByTokenId.set(t.id, symbol);
  }
  if (symbolByTokenId.size === 0) return tokens;

  try {
    const tickers = await fetchTickers([...symbolByTokenId.values()]);
    return tokens.map((t) => {
      const symbol = symbolByTokenId.get(t.id);
      const ticker = symbol ? tickers[symbol] : undefined;
      if (!ticker) return t;
      return { ...t, price: ticker.price, change24h: ticker.change24h, volume24h: ticker.volume24h };
    });
  } catch {
    // Binance cross-check failed; CoinGecko's own numbers are still fine.
    return tokens;
  }
}

// Price is the one number this app can never afford to show wrong or stale
// — refetch on this cadence so the ticker keeps tracking the real market
// instead of freezing at whatever it happened to be when the watchlist was
// last touched.
const PRICE_REFRESH_INTERVAL_MS = 30_000;

export function useWatchlistTokens(ids: string[], apiKey?: string) {
  const key = ids.join(",");
  const [state, setState] = useState<WatchlistTokensState>({
    loading: ids.length > 0,
    isDemo: false,
    error: null,
    tokens: [],
  });

  useEffect(() => {
    // Derived from `key` (not the `ids` prop directly) so this effect only
    // re-runs when the watchlist's actual contents change, not on every
    // render that happens to pass a new array instance with the same ids.
    const currentIds = key ? key.split(",") : [];

    if (currentIds.length === 0) {
      setState({ loading: false, isDemo: false, error: null, tokens: [] });
      return;
    }

    let cancelled = false;

    async function load(isInitial: boolean) {
      if (isInitial) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const tokens = await withBinancePrices(await fetchMarketTokens(currentIds, apiKey));
        if (cancelled) return;
        setState({ loading: false, isDemo: false, error: null, tokens });
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({
          loading: false,
          isDemo: true,
          error: err instanceof Error ? err.message : "Failed to load watchlist",
          // A transient refresh failure shouldn't swap an already-correct
          // real price for a completely different, made-up mock one — only
          // fall back to mock if we never had real data to begin with.
          tokens: !s.isDemo && s.tokens.length > 0 ? s.tokens : mockMarketTokens(currentIds),
        }));
      }
    }

    load(true);
    const refreshTimer = setInterval(() => load(false), PRICE_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, [key, apiKey]);

  return state;
}
