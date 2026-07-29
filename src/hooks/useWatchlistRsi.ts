import { useEffect, useRef, useState } from "react";
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
const RETRY_INTERVAL_MS = 60_000;

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
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const currentIds = key ? key.split(",") : [];
    if (currentIds.length === 0) {
      setData({});
      return;
    }

    // Drop entries for tokens no longer on the watchlist.
    setData((prev) => {
      const next: Record<string, TokenRsiByTimeframe> = {};
      for (const id of currentIds) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });

    let cancelled = false;

    async function loadMissing() {
      // Only (re)fetch tokens without a *successful* real fetch yet — never
      // re-request one that already has real data (that was the burst that
      // could trip CoinGecko's rate limit when adding a coin), but do keep
      // retrying ones still stuck on the mock fallback from a transient
      // failure, so a token doesn't stay wrong for the rest of the session
      // just because its first attempt happened to fail.
      const idsToFetch = currentIds.filter((id) => {
        const existing = dataRef.current[id];
        return !existing || existing.isDemo;
      });
      if (idsToFetch.length === 0) return;

      const entries = await Promise.all(
        idsToFetch.map(async (id) => [id, await fetchTokenRsi(id, apiKey)] as const),
      );
      if (cancelled) return;
      setData((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    }

    loadMissing();
    const retryTimer = setInterval(loadMissing, RETRY_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(retryTimer);
    };
  }, [key, apiKey]);

  return data;
}
