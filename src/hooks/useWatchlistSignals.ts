import { useEffect, useRef, useState } from "react";
import { fetchKlines, symbolForToken } from "../lib/binance";
import { fetchCandlesForTimeframe } from "../lib/coingecko";
import {
  bbSignal,
  calcBollingerBands,
  calcMACD,
  calcRSI,
  isVolumeSpike,
  macdSignal,
} from "../lib/indicators";
import { mockSignalsByTimeframe } from "../lib/mock";
import {
  computeConfluenceScore,
  type BbPosition,
  type MacdSignal,
  type OpportunityScoreResult,
  type SignalTimeframe,
  type TimeframeSignal,
} from "../lib/opportunityScore";

export interface TokenSignals {
  /** RSI/MACD/Bollinger/volume for each of the 3 timeframes — the raw
   * inputs the confluence score below is built from, exposed so the UI can
   * show exactly what went into the number instead of just the result. */
  byTimeframe: Record<SignalTimeframe, TimeframeSignal>;
  /** Multi-timeframe confluence score — identical wherever it's shown for
   * this token, independent of whatever timeframe the chart has open. */
  score: OpportunityScoreResult;
  /** true if at least one of the 3 timeframes fell back to mock data. */
  isDemo: boolean;
}

const TIMEFRAMES: SignalTimeframe[] = ["1h", "4h", "1d", "1w", "1M"];
const RETRY_INTERVAL_MS = 60_000;

async function fetchOneTimeframeSignal(
  tokenId: string,
  timeframe: SignalTimeframe,
  apiKey?: string,
): Promise<TimeframeSignal | null> {
  try {
    const symbol = symbolForToken(tokenId);
    const candles = symbol
      ? await fetchKlines(symbol, timeframe)
      : await fetchCandlesForTimeframe(tokenId, timeframe, apiKey);
    const rsiSeries = calcRSI(candles);
    if (rsiSeries.length === 0) return null;
    const bbSeries = calcBollingerBands(candles);
    const lastCandle = candles[candles.length - 1];
    const lastBb = bbSeries[bbSeries.length - 1];
    const bbPosition: BbPosition = lastCandle && lastBb ? bbSignal(lastCandle.close, lastBb) : "inside";
    const macd: MacdSignal = macdSignal(calcMACD(candles));
    return {
      rsi: Math.round(rsiSeries[rsiSeries.length - 1].value),
      macd,
      bbPosition,
      volumeSpike: isVolumeSpike(candles),
    };
  } catch {
    return null;
  }
}

function buildTokenSignals(
  byTimeframe: Record<SignalTimeframe, TimeframeSignal>,
  isDemo: boolean,
): TokenSignals {
  return {
    byTimeframe,
    score: computeConfluenceScore(byTimeframe),
    isDemo,
  };
}

function mockTokenSignals(tokenId: string): TokenSignals {
  return buildTokenSignals(mockSignalsByTimeframe(tokenId), true);
}

async function fetchTokenSignals(tokenId: string, apiKey?: string): Promise<TokenSignals> {
  const fallback = mockSignalsByTimeframe(tokenId);
  const results = await Promise.all(
    TIMEFRAMES.map((tf) => fetchOneTimeframeSignal(tokenId, tf, apiKey)),
  );

  let isDemo = false;
  const byTimeframe = {} as Record<SignalTimeframe, TimeframeSignal>;
  TIMEFRAMES.forEach((tf, i) => {
    const result = results[i];
    if (result) {
      byTimeframe[tf] = result;
    } else {
      byTimeframe[tf] = fallback[tf];
      isDemo = true;
    }
  });

  return buildTokenSignals(byTimeframe, isDemo);
}

/**
 * Real RSI+MACD+Bollinger for all 3 timeframes, for every watchlist token,
 * combined into one confluence score per token (lib/opportunityScore.ts) —
 * what feeds the table's RSI columns/Score and the detail panel's Score
 * card, identically, regardless of which timeframe the chart has open.
 * Falls back per-timeframe to the deterministic mock (lib/mock.ts) only
 * when that one fetch fails, same resilience pattern as the rest of the app.
 */
export function useWatchlistSignals(ids: string[], apiKey?: string) {
  const key = ids.join(",");
  const [data, setData] = useState<Record<string, TokenSignals>>({});
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const currentIds = key ? key.split(",") : [];
    if (currentIds.length === 0) {
      setData({});
      return;
    }

    // Drop entries for tokens no longer on the watchlist, and give any
    // brand-new token an instant mock placeholder so there's never a gap
    // while its real fetch is in flight.
    setData((prev) => {
      const next: Record<string, TokenSignals> = {};
      for (const id of currentIds) {
        next[id] = prev[id] ?? mockTokenSignals(id);
      }
      return next;
    });

    let cancelled = false;

    async function loadMissing() {
      // Only (re)fetch tokens without a *successful* real fetch yet — never
      // re-request one that already has real data, but do keep retrying
      // ones still stuck on the mock fallback from a transient failure, so
      // a token doesn't stay wrong for the rest of the session just
      // because its first attempt happened to fail.
      const idsToFetch = currentIds.filter((id) => {
        const existing = dataRef.current[id];
        return !existing || existing.isDemo;
      });
      if (idsToFetch.length === 0) return;

      const entries = await Promise.all(
        idsToFetch.map(async (id) => [id, await fetchTokenSignals(id, apiKey)] as const),
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
