import { useEffect, useState } from "react";
import { fetchKlines, symbolForToken } from "../lib/binance";
import { fetchCandlesForTimeframe } from "../lib/coingecko";
import { mockCandles } from "../lib/mock";
import type { Candle, Timeframe } from "../types";

interface CompareCandlesState {
  candles: Candle[];
  isDemo: boolean;
}

const EMPTY_STATE: CompareCandlesState = { candles: [], isDemo: false };

/**
 * Candles for whichever token is picked as the chart's comparison overlay —
 * only fetched while a comparison token is chosen. This is a supplementary
 * reference line, not the primary price-of-record for the open token, so
 * unlike useMarketData it doesn't poll on an interval — refetching on
 * timeframe/token change is enough for a comparison line.
 */
export function useCompareCandles(
  compareTokenId: string | null,
  timeframe: Timeframe,
  apiKey?: string,
): CompareCandlesState {
  const [state, setState] = useState<CompareCandlesState>(EMPTY_STATE);

  useEffect(() => {
    if (!compareTokenId) {
      setState(EMPTY_STATE);
      return;
    }
    const tokenId = compareTokenId;

    let cancelled = false;
    async function load() {
      try {
        const symbol = symbolForToken(tokenId);
        const candles = symbol
          ? await fetchKlines(symbol, timeframe)
          : await fetchCandlesForTimeframe(tokenId, timeframe, apiKey);
        if (cancelled) return;
        setState({ candles, isDemo: false });
      } catch {
        if (cancelled) return;
        setState({ candles: mockCandles(tokenId, timeframe), isDemo: true });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [compareTokenId, timeframe, apiKey]);

  return state;
}
