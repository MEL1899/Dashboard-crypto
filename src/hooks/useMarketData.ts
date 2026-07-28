import { useEffect, useState } from "react";
import { fetchCandles, fetchMarketTokens, POPULAR_TOKENS } from "../lib/coingecko";
import { mockCandles, mockMarketTokens } from "../lib/mock";
import { calcBollingerBands, calcRSI, calcVolumeSeries } from "../lib/indicators";
import type { BollingerBands, Candle, IndicatorPoint, MarketToken } from "../types";

interface MarketDataState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  tokens: MarketToken[];
  candles: Candle[];
  rsi: IndicatorPoint[];
  bollinger: BollingerBands[];
  volume: IndicatorPoint[];
}

export function useMarketData(tokenId: string, days: number, apiKey?: string) {
  const [state, setState] = useState<MarketDataState>({
    loading: true,
    isDemo: false,
    error: null,
    tokens: [],
    candles: [],
    rsi: [],
    bollinger: [],
    volume: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const ids = POPULAR_TOKENS.includes(tokenId)
          ? POPULAR_TOKENS
          : [tokenId, ...POPULAR_TOKENS];
        const [tokens, candles] = await Promise.all([
          fetchMarketTokens(ids, apiKey),
          fetchCandles(tokenId, days, apiKey),
        ]);
        if (cancelled) return;
        setState({
          loading: false,
          isDemo: false,
          error: null,
          tokens,
          candles,
          rsi: calcRSI(candles),
          bollinger: calcBollingerBands(candles),
          volume: calcVolumeSeries(candles),
        });
      } catch (err) {
        if (cancelled) return;
        const tokens = mockMarketTokens(POPULAR_TOKENS);
        const candles = mockCandles(tokenId, days);
        setState({
          loading: false,
          isDemo: true,
          error: err instanceof Error ? err.message : "Failed to load market data",
          tokens,
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
  }, [tokenId, days, apiKey]);

  return state;
}
