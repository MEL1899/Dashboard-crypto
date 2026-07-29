import { useEffect, useState } from "react";
import { fetchGlobalMarketData } from "../lib/coingecko";
import { fetchFearGreedIndex } from "../lib/fearGreed";

export interface MarketPanoramaData {
  totalMarketCap: number;
  totalMarketCapChange24h: number;
  btcDominance: number;
  fearGreedValue: number;
}

interface MarketPanoramaState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  data: MarketPanoramaData;
}

// Same deterministic feel as the rest of demo mode — a plausible snapshot
// shown only if both real fetches below fail.
const MOCK_PANORAMA: MarketPanoramaData = {
  totalMarketCap: 2_450_000_000_000,
  totalMarketCapChange24h: 1.8,
  btcDominance: 54.2,
  fearGreedValue: 42,
};

const INITIAL_STATE: MarketPanoramaState = {
  loading: true,
  isDemo: false,
  error: null,
  data: MOCK_PANORAMA,
};

/** Global market cap/dominance (CoinGecko) + Fear & Greed Index (alternative.me), both free and keyless. */
export function useMarketPanorama(apiKey?: string) {
  const [state, setState] = useState<MarketPanoramaState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [global, fearGreed] = await Promise.all([
          fetchGlobalMarketData(apiKey),
          fetchFearGreedIndex(),
        ]);
        if (cancelled) return;
        setState({
          loading: false,
          isDemo: false,
          error: null,
          data: { ...global, fearGreedValue: fearGreed.value },
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          isDemo: true,
          error: err instanceof Error ? err.message : "Failed to load market panorama",
          data: MOCK_PANORAMA,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return state;
}
