import { useEffect, useState } from "react";
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

export function useMarketData(tokenId: string | null, timeframe: Timeframe, apiKey?: string) {
  const [state, setState] = useState<MarketDataState>(EMPTY_STATE);

  useEffect(() => {
    if (!tokenId) {
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      if (!tokenId) return;
      try {
        const candles = await fetchCandlesForTimeframe(tokenId, timeframe, apiKey);
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
        const candles = mockCandles(tokenId, timeframe);
        setState({
          loading: false,
          isDemo: true,
          error: err instanceof Error ? err.message : "Failed to load market data",
          candles,
          rsi: calcRSI(candles),
          bollinger: calcBollingerBands(candles),
          volume: calcVolumeSeries(candles),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tokenId, timeframe, apiKey]);

  return state;
}
