import { useEffect, useState } from "react";
import { fetchKlines, symbolForToken } from "../lib/binance";
import { fetchCandlesForTimeframe } from "../lib/coingecko";
import { calcRSI } from "../lib/indicators";
import { mockRsiByTimeframe } from "../lib/mock";
import type { Timeframe } from "../types";

export interface TokenRsiByTimeframe {
  "1h": number;
  "4h": number;
  "1d": number;
  /** true if at least one of the 3 timeframes fell back to mock data. */
  isDemo: boolean;
}

const TIMEFRAMES: Timeframe[] = ["1h", "4h", "1d"];

async function fetchOneRsi(
  tokenId: string,
  timeframe: Timeframe,
  apiKey?: string,
): Promise<number | null> {
  try {
    const symbol = symbolForToken(tokenId);
    const candles = symbol
      ? await fetchKlines(symbol, timeframe)
      : await fetchCandlesForTimeframe(tokenId, timeframe, apiKey);
    const series = calcRSI(candles);
    // Rounded here so every consumer (table pills, Score, confluence check)
    // always sees a whole number, same as the mock fallback below already did.
    return series.length > 0 ? Math.round(series[series.length - 1].value) : null;
  } catch {
    return null;
  }
}

async function fetchTokenRsi(tokenId: string, apiKey?: string): Promise<TokenRsiByTimeframe> {
  const fallback = mockRsiByTimeframe(tokenId);
  const [h1, h4, d1] = await Promise.all(
    TIMEFRAMES.map((tf) => fetchOneRsi(tokenId, tf, apiKey)),
  );
  return {
    "1h": h1 ?? fallback["1h"],
    "4h": h4 ?? fallback["4h"],
    "1d": d1 ?? fallback["1d"],
    isDemo: h1 === null || h4 === null || d1 === null,
  };
}

/**
 * Real RSI for all 3 timeframes, for every watchlist token — what feeds the
 * table's RSI columns/Score and the detail panel's "other timeframes" line.
 * Falls back per-timeframe to the deterministic mock (lib/mock.ts) only when
 * that one fetch fails, same resilience pattern as the rest of the app.
 */
export function useWatchlistRsi(ids: string[], apiKey?: string) {
  const key = ids.join(",");
  const [data, setData] = useState<Record<string, TokenRsiByTimeframe>>({});

  useEffect(() => {
    const currentIds = key ? key.split(",") : [];
    if (currentIds.length === 0) {
      setData({});
      return;
    }

    let cancelled = false;

    async function load() {
      const entries = await Promise.all(
        currentIds.map(async (id) => [id, await fetchTokenRsi(id, apiKey)] as const),
      );
      if (cancelled) return;
      setData(Object.fromEntries(entries));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [key, apiKey]);

  return data;
}
