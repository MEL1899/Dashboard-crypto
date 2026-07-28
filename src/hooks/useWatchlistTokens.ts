import { useEffect, useState } from "react";
import { fetchMarketTokens } from "../lib/coingecko";
import { mockMarketTokens } from "../lib/mock";
import type { MarketToken } from "../types";

interface WatchlistTokensState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  tokens: MarketToken[];
}

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
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const tokens = await fetchMarketTokens(currentIds, apiKey);
        if (cancelled) return;
        setState({ loading: false, isDemo: false, error: null, tokens });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          isDemo: true,
          error: err instanceof Error ? err.message : "Failed to load watchlist",
          tokens: mockMarketTokens(currentIds),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [key, apiKey]);

  return state;
}
