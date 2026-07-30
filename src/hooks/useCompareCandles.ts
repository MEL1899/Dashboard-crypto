import { useEffect, useState } from "react";
import { fetchKlines, symbolForToken } from "../lib/binance";
import { fetchCandlesForTimeframe } from "../lib/coingecko";
import { mockCandles } from "../lib/mock";
import type { Candle, Timeframe } from "../types";

const COMPARE_TOKEN_ID = "bitcoin";

interface CompareCandlesState {
  candles: Candle[];
  isDemo: boolean;
}

const EMPTY_STATE: CompareCandlesState = { candles: [], isDemo: false };

/**
 * BTC's own candles for the chart's "Comparar com BTC" overlay — only
 * fetched while the toggle is on and the open token isn't BTC itself (no
 * point comparing BTC to BTC). This is a supplementary reference line, not
 * the primary price-of-record for the open token, so unlike useMarketData
 * it doesn't poll on an interval — refetching on timeframe/token change is
 * enough for a comparison line.
 */
export function useCompareCandles(
  enabled: boolean,
  tokenId: string | null,
  timeframe: Timeframe,
  apiKey?: string,
): CompareCandlesState {
  const [state, setState] = useState<CompareCandlesState>(EMPTY_STATE);

  useEffect(() => {
    if (!enabled || !tokenId || tokenId === COMPARE_TOKEN_ID) {
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const symbol = symbolForToken(COMPARE_TOKEN_ID);
        const candles = symbol
          ? await fetchKlines(symbol, timeframe)
          : await fetchCandlesForTimeframe(COMPARE_TOKEN_ID, timeframe, apiKey);
        if (cancelled) return;
        setState({ candles, isDemo: false });
      } catch {
        if (cancelled) return;
        setState({ candles: mockCandles(COMPARE_TOKEN_ID, timeframe), isDemo: true });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [enabled, tokenId, timeframe, apiKey]);

  return state;
}
