import { useEffect, useRef, useState } from "react";
import { fetchFundingRateDailyPct, fetchKlines, symbolForToken } from "../lib/binance";
import { fetchCandlesForTimeframe } from "../lib/coingecko";
import { fetchFearGreedIndex } from "../lib/fearGreed";
import { buildScoreInputs, type CandlesByTimeframe } from "../lib/score/liveInputs";
import { computeSignalScore, type SignalScoreResult } from "../lib/score/signalScore";
import { evaluateConfluence, type ConfluenceResult } from "../lib/score/confluence";
import { LIVE_MA_PERIOD, detectRegime, type RegimeResult } from "../lib/score/regime";
import { interpretReading, type Reading } from "../lib/score/interpretation";
import {
  bbSignal,
  calcBollingerBands,
  calcMACD,
  calcRSI,
  isVolumeSpike,
  macdSignal,
  relativeStrengthSignal,
  trendSignal,
} from "../lib/indicators";
import { mockCandles, mockSignalsByTimeframe } from "../lib/mock";
import type { BbPosition, MacdSignal, SignalTimeframe, TimeframeSignal } from "../lib/indicators";
import type { Candle } from "../types";

const BTC_TOKEN_ID = "bitcoin";

export interface TokenSignals {
  /** RSI/MACD/Bollinger/volume for each of the 3 timeframes — the raw
   * inputs the confluence score below is built from, exposed so the UI can
   * show exactly what went into the number instead of just the result. */
  byTimeframe: Record<SignalTimeframe, TimeframeSignal>;
  /**
   * The layered score (lib/score) — what the watchlist badge now shows.
   * Built from the same candles already fetched for `byTimeframe`, so
   * adopting it costs no extra requests.
   */
  score: SignalScoreResult;
  /** Which groups agree, shown as a label beside the score and never folded
   * into it (see lib/score/confluence.ts). */
  confluence: ConfluenceResult;
  /** Is the market trending or going sideways right now, read off the daily
   * candles (ADX + long-MA slope). Describes the CURRENT state — it does not
   * forecast that price will start ranging. */
  regime: RegimeResult;
  /** Score + regime turned into one plain-language call: compra, venda,
   * lateral, or "cuidado, isso é contra a tendência". Also a label only —
   * see lib/score/interpretation.ts. */
  reading: Reading;
  /** true if at least one of the 3 timeframes fell back to mock data. */
  isDemo: boolean;
}

const TIMEFRAMES: SignalTimeframe[] = ["1h", "4h", "1d", "1w", "1M"];
const RETRY_INTERVAL_MS = 60_000;
// Score/RSI don't need 30s-fresh price-grade updates, but they still need
// to move sometime — without this, a token that succeeds once would never
// be refetched again (loadMissing only retries failed/mock ones), which
// would leave the score history sparkline permanently flat.
const FULL_REFRESH_INTERVAL_MS = 5 * 60_000;

/** Fetches BTC's own candles for a timeframe, used as the relative-strength
 * baseline for every other token — fetched once per refresh and shared
 * across the whole watchlist rather than once per token. */
async function fetchBtcCandles(
  timeframe: SignalTimeframe,
  apiKey?: string,
): Promise<Candle[] | null> {
  try {
    const symbol = symbolForToken(BTC_TOKEN_ID);
    return symbol
      ? await fetchKlines(symbol, timeframe)
      : await fetchCandlesForTimeframe(BTC_TOKEN_ID, timeframe, apiKey);
  } catch {
    return null;
  }
}

async function fetchBtcCandlesByTimeframe(
  apiKey?: string,
): Promise<Partial<Record<SignalTimeframe, Candle[]>>> {
  const entries = await Promise.all(
    TIMEFRAMES.map(async (tf) => [tf, await fetchBtcCandles(tf, apiKey)] as const),
  );
  const out: Partial<Record<SignalTimeframe, Candle[]>> = {};
  for (const [tf, candles] of entries) {
    if (candles) out[tf] = candles;
  }
  return out;
}

/** The categorical readings the indicator table renders, plus the raw
 * candles the score needs — one fetch serving both, since re-requesting the
 * same series for each would double the load on a rate-limited API. */
interface TimeframeFetch {
  signal: TimeframeSignal;
  candles: Candle[];
}

async function fetchOneTimeframeSignal(
  tokenId: string,
  timeframe: SignalTimeframe,
  btcCandles: Candle[] | null,
  apiKey?: string,
): Promise<TimeframeFetch | null> {
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
      signal: {
        rsi: Math.round(rsiSeries[rsiSeries.length - 1].value),
        macd,
        bbPosition,
        volumeSpike: isVolumeSpike(candles),
        trend: trendSignal(candles),
        // BTC is the benchmark, not compared against itself.
        relativeStrength:
          tokenId === BTC_TOKEN_ID || !btcCandles
            ? "inline"
            : relativeStrengthSignal(candles, btcCandles),
      },
      candles,
    };
  } catch {
    return null;
  }
}

interface ExternalReadings {
  fearGreed: number | null;
  fundingRate: number | null;
}

function buildTokenSignals(
  byTimeframe: Record<SignalTimeframe, TimeframeSignal>,
  candles: CandlesByTimeframe,
  external: ExternalReadings,
  isDemo: boolean,
): TokenSignals {
  // Read off the daily series: the regime question is "what is this market
  // doing over weeks", not "what did the last few hours look like".
  const regime = detectRegime(candles["1d"] ?? [], { maPeriod: LIVE_MA_PERIOD });
  // Threaded into the score for forward compatibility. It changes nothing
  // today — every regime maps to the same weights on purpose (config.ts) —
  // but it means the result carries the regime it was computed under, which
  // the transparency panel reads.
  const score = computeSignalScore(buildScoreInputs(candles, external), regime.regime);
  return {
    byTimeframe,
    score,
    confluence: evaluateConfluence(score.groups),
    regime,
    reading: interpretReading(score.level, regime.regime),
    isDemo,
  };
}

/** Placeholder shown the instant a token joins the watchlist, before its
 * real fetch lands — mock candles so the layered score has something
 * shaped correctly to read, always flagged demo. */
function mockTokenSignals(tokenId: string): TokenSignals {
  return buildTokenSignals(
    mockSignalsByTimeframe(tokenId),
    {
      "1h": mockCandles(tokenId, "1h"),
      "4h": mockCandles(tokenId, "4h"),
      "1d": mockCandles(tokenId, "1d"),
    },
    { fearGreed: null, fundingRate: null },
    true,
  );
}

async function fetchTokenSignals(
  tokenId: string,
  btcCandlesByTf: Partial<Record<SignalTimeframe, Candle[]>>,
  fearGreed: number | null,
  apiKey?: string,
): Promise<TokenSignals> {
  const fallback = mockSignalsByTimeframe(tokenId);
  const results = await Promise.all(
    TIMEFRAMES.map((tf) => fetchOneTimeframeSignal(tokenId, tf, btcCandlesByTf[tf] ?? null, apiKey)),
  );

  let isDemo = false;
  const byTimeframe = {} as Record<SignalTimeframe, TimeframeSignal>;
  const candles: CandlesByTimeframe = {};
  TIMEFRAMES.forEach((tf, i) => {
    const result = results[i];
    if (result) {
      byTimeframe[tf] = result.signal;
      // Only the three the score reads. 1w/1M are fetched for the indicator
      // table's own columns and deliberately stay out of the score.
      if (tf === "1h" || tf === "4h" || tf === "1d") candles[tf] = result.candles;
    } else {
      byTimeframe[tf] = fallback[tf];
      if (tf === "1h" || tf === "4h" || tf === "1d") candles[tf] = mockCandles(tokenId, tf);
      isDemo = true;
    }
  });

  const symbol = symbolForToken(tokenId);
  const fundingRate = symbol ? await fetchFundingRateDailyPct(symbol) : null;

  return buildTokenSignals(byTimeframe, candles, { fearGreed, fundingRate }, isDemo);
}

/**
 * Real RSI+MACD+Bollinger for all 3 timeframes, for every watchlist token,
 * fed into the layered score (lib/score/) — what drives the table's RSI
 * columns and Score badge and the detail panel's Score card, identically,
 * regardless of which timeframe the chart has open.
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

    async function refresh(ids: string[]) {
      if (ids.length === 0) return;
      // Fetched once per refresh and reused for every token below, instead
      // of once per token, since it's the same BTC baseline for all of them.
      const btcCandlesByTf = await fetchBtcCandlesByTimeframe(apiKey);
      // One market-wide reading shared by every token, rather than the same
      // request repeated per row.
      let fearGreed: number | null = null;
      try {
        fearGreed = (await fetchFearGreedIndex()).value;
      } catch {
        fearGreed = null;
      }
      const entries = await Promise.all(
        ids.map(
          async (id) => [id, await fetchTokenSignals(id, btcCandlesByTf, fearGreed, apiKey)] as const,
        ),
      );
      if (cancelled) return;
      setData((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    }

    // Only (re)fetch tokens without a *successful* real fetch yet — never
    // re-request one that already has real data, but do keep retrying ones
    // still stuck on the mock fallback from a transient failure, so a token
    // doesn't stay wrong for the rest of the session just because its first
    // attempt happened to fail.
    function loadMissing() {
      const idsToFetch = currentIds.filter((id) => {
        const existing = dataRef.current[id];
        return !existing || existing.isDemo;
      });
      return refresh(idsToFetch);
    }

    loadMissing();
    const retryTimer = setInterval(loadMissing, RETRY_INTERVAL_MS);
    // Separately, refresh everything (including already-successful tokens)
    // on a slower cadence, so the score can actually move over time instead
    // of freezing at whatever it read on the first successful fetch.
    const fullRefreshTimer = setInterval(() => refresh(currentIds), FULL_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(retryTimer);
      clearInterval(fullRefreshTimer);
    };
  }, [key, apiKey]);

  return data;
}
