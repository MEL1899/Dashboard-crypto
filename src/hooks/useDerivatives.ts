import { useEffect, useState } from "react";
import {
  fetchFundingRateHistory,
  fetchLongShortRatio,
  fetchOpenInterestHistory,
  fetchPremiumIndex,
  symbolForToken,
} from "../lib/binanceFutures";
import { fetchFearGreedIndex } from "../lib/fearGreed";
import { mockDerivatives, mockFearGreed } from "../lib/mock";
import type { DerivativesSnapshot } from "../types";

interface DerivativesState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  data: DerivativesSnapshot | null;
}

export function useDerivatives(tokenId: string) {
  const [state, setState] = useState<DerivativesState>({
    loading: true,
    isDemo: false,
    error: null,
    data: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      const symbol = symbolForToken(tokenId);

      if (!symbol) {
        const fearGreed = await fetchFearGreedIndex().catch(() => mockFearGreed());
        if (!cancelled) {
          setState({
            loading: false,
            isDemo: false,
            error: null,
            data: {
              symbol: null,
              markPrice: null,
              lastFundingRate: null,
              nextFundingTime: null,
              fundingHistory: [],
              openInterestHistory: [],
              longShortHistory: [],
              fearGreed,
            },
          });
        }
        return;
      }

      try {
        const [premium, fundingHistory, openInterestHistory, longShortHistory, fearGreed] =
          await Promise.all([
            fetchPremiumIndex(symbol),
            fetchFundingRateHistory(symbol),
            fetchOpenInterestHistory(symbol),
            fetchLongShortRatio(symbol),
            fetchFearGreedIndex(),
          ]);
        if (cancelled) return;
        setState({
          loading: false,
          isDemo: false,
          error: null,
          data: {
            symbol,
            markPrice: premium.markPrice,
            lastFundingRate: premium.lastFundingRate,
            nextFundingTime: premium.nextFundingTime,
            fundingHistory,
            openInterestHistory,
            longShortHistory,
            fearGreed,
          },
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          isDemo: true,
          error:
            err instanceof Error ? err.message : "Failed to load derivatives data",
          data: mockDerivatives(tokenId),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  return state;
}
