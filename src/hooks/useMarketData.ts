import { useEffect, useState } from "react";
import { fetchKlines, symbolForToken } from "../lib/binance";
import { fetchCandlesForTimeframe } from "../lib/coingecko";
import { mockCandles } from "../lib/mock";
import { calcBollingerBands, calcRSI, calcVolumeSeries } from "../lib/indicators";
import type { BollingerBands, Candle, IndicatorPoint, Timeframe } from "../types";

interface MarketDataState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  candles: Candle[];
  rsi: IndicatorPoint[];
  bollinger: BollingerBands[];
  volume: IndicatorPoint[];
}

const EMPTY_STATE: MarketDataState = {
  loading: false,
  isDemo: false,
  error: null,
  candles: [],
  rsi: [],
  bollinger: [],
  volume: [],
};

// Same "price must never be stale" rule as useWatchlistTokens — the open
// chart's last candle is what the Preço card and Score are computed from,
// so it has to keep refreshing on its own, not just when timeframe changes.
const MARKET_DATA_REFRESH_INTERVAL_MS = 30_000;

export function useMarketData(tokenId: string | null, timeframe: Timeframe, apiKey?: string) {
  const [state, setState] = useState<MarketDataState>(EMPTY_STATE);

  useEffect(() => {
    if (!tokenId) {
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;

    async function load(isInitial: boolean) {
      if (!tokenId) return;
      if (isInitial) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const symbol = symbolForToken(tokenId);
        const candles = symbol
          ? await fetchKlines(symbol, timeframe)
          : await fetchCandlesForTimeframe(tokenId, timeframe, apiKey);
        if (cancelled) return;
        setState({
          loading: false,
          isDemo: false,
          error: null,
          candles,
          rsi: calcRSI(candles),
          bollinger: calcBollingerBands(candles),
          volume: calcVolumeSeries(candles),
        });
      } catch (err) {
        if (cancelled) return;
        setState((s) => {
          // Same rule as the watchlist ticker: a transient *background*
          // refresh failure keeps showing the last real candles instead of
          // swapping to a completely different mock series. But this only
          // holds for a refresh of the SAME token/timeframe already on
          // screen (!isInitial) — on a fresh switch to a different
          // token/timeframe, `s.candles` is still the PREVIOUS token's data,
          // and showing that here would silently display the wrong asset's
          // chart under the new one's label instead of falling back to mock.
          if (!isInitial && !s.isDemo && s.candles.length > 0) {
            return { ...s, loading: false };
          }
          const candles = mockCandles(tokenId, timeframe);
          return {
            loading: false,
            isDemo: true,
            error: err instanceof Error ? err.message : "Failed to load market data",
            candles,
            rsi: calcRSI(candles),
            bollinger: calcBollingerBands(candles),
            volume: calcVolumeSeries(candles),
          };
        });
      }
    }

    load(true);
    const refreshTimer = setInterval(() => load(false), MARKET_DATA_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, [tokenId, timeframe, apiKey]);

  return state;
}
