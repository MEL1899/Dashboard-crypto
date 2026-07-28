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
import type { DerivativesSnapshot, Timeframe } from "../types";

interface DerivativesState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  data: DerivativesSnapshot | null;
}

const EMPTY_STATE: DerivativesState = {
  loading: false,
  isDemo: false,
  error: null,
  data: null,
};

export function useDerivatives(tokenId: string | null, timeframe: Timeframe) {
  const [state, setState] = useState<DerivativesState>(EMPTY_STATE);

  useEffect(() => {
    if (!tokenId) {
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      if (!tokenId) return;
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
            fetchOpenInterestHistory(symbol, timeframe),
            fetchLongShortRatio(symbol, timeframe),
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
          data: mockDerivatives(tokenId, timeframe),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tokenId, timeframe]);

  return state;
}
