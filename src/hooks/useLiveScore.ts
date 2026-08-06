import { useEffect, useRef, useState } from "react";
import { fetchKlines, symbolForToken } from "../lib/binance";
import { fetchCandlesForTimeframe } from "../lib/coingecko";
import { fetchFearGreedIndex } from "../lib/fearGreed";
import { mockCandles } from "../lib/mock";
import { buildScoreInputs, type CandlesByTimeframe } from "../lib/score/liveInputs";
import { detectRegime, type RegimeResult } from "../lib/score/regime";
import { computeSignalScore, type ScoreMetricInputs, type SignalScoreResult } from "../lib/score/signalScore";
import { evaluateConfluence, type ConfluenceResult } from "../lib/score/confluence";
import type { Candle } from "../types";

/**
 * The layered score, running on live data.
 *
 * Deliberately reports WHERE each number came from, not just what it is:
 * the user's first question about any score is whether it reflects the
 * market right now, and a score built from demo candles that looks
 * identical to a real one is worse than no score.
 */

const TIMEFRAMES = ["1h", "4h", "1d"] as const;
type ScoreTimeframe = (typeof TIMEFRAMES)[number];

const REFRESH_INTERVAL_MS = 5 * 60_000;

export type SourceStatus = "live" | "demo" | "unavailable";

export interface DataSourceInfo {
  label: string;
  status: SourceStatus;
  detail: string;
}

export interface LiveScoreState {
  loading: boolean;
  score: SignalScoreResult | null;
  confluence: ConfluenceResult | null;
  regime: RegimeResult | null;
  inputs: ScoreMetricInputs | null;
  sources: DataSourceInfo[];
  /** When the last successful refresh completed, unix ms. */
  updatedAt: number | null;
  /** True when any component fell back to simulated data. */
  isDemo: boolean;
}

const IDLE: LiveScoreState = {
  loading: false,
  score: null,
  confluence: null,
  regime: null,
  inputs: null,
  sources: [],
  updatedAt: null,
  isDemo: false,
};

async function fetchCandlesFor(
  tokenId: string,
  timeframe: ScoreTimeframe,
  apiKey?: string,
): Promise<{ candles: Candle[]; live: boolean }> {
  try {
    const symbol = symbolForToken(tokenId);
    const candles = symbol
      ? await fetchKlines(symbol, timeframe)
      : await fetchCandlesForTimeframe(tokenId, timeframe, apiKey);
    if (candles.length > 0) return { candles, live: true };
  } catch {
    // Falls through to the deterministic mock below, same resilience
    // pattern the rest of the app uses.
  }
  return { candles: mockCandles(tokenId, timeframe), live: false };
}

export function useLiveScore(tokenId: string | null, apiKey?: string): LiveScoreState {
  const [state, setState] = useState<LiveScoreState>(IDLE);
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  useEffect(() => {
    if (!tokenId) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    async function refresh(id: string) {
      const key = apiKeyRef.current;

      const results = await Promise.all(TIMEFRAMES.map((tf) => fetchCandlesFor(id, tf, key)));
      const candles: CandlesByTimeframe = {};
      const liveByTimeframe: Record<string, boolean> = {};
      TIMEFRAMES.forEach((tf, i) => {
        candles[tf] = results[i].candles;
        liveByTimeframe[tf] = results[i].live;
      });

      let fearGreed: number | null = null;
      let fearGreedLive = false;
      try {
        fearGreed = (await fetchFearGreedIndex()).value;
        fearGreedLive = true;
      } catch {
        // Sentiment simply drops out; the score renormalizes the remaining
        // groups rather than substituting a made-up reading.
        fearGreed = null;
      }

      if (cancelled) return;

      const inputs = buildScoreInputs(candles, { fearGreed });
      const daily = candles["1d"] ?? [];
      const regime = detectRegime(daily, { maPeriod: 50 });
      const score = computeSignalScore(inputs, regime.regime);
      const confluence = evaluateConfluence(score.groups);

      const technicalLive = TIMEFRAMES.every((tf) => liveByTimeframe[tf]);
      const sources: DataSourceInfo[] = [
        {
          label: "Técnico (velas 1h/4h/1d)",
          status: technicalLive ? "live" : "demo",
          detail: technicalLive
            ? "Binance/CoinGecko em tempo real"
            : `Simulado — falha em ${TIMEFRAMES.filter((tf) => !liveByTimeframe[tf]).join(", ")}`,
        },
        {
          label: "Sentimento (Fear & Greed)",
          status: fearGreedLive ? "live" : "unavailable",
          detail: fearGreedLive
            ? "Alternative.me em tempo real"
            : "Indisponível — o grupo saiu do cálculo e os pesos foram redistribuídos",
        },
        {
          label: "On-chain (MVRV, funding, netflow)",
          status: "unavailable",
          detail: "Ainda não conectado — nenhuma fonte gratuita de histórico definida",
        },
      ];

      setState({
        loading: false,
        score,
        confluence,
        regime,
        inputs,
        sources,
        updatedAt: Date.now(),
        isDemo: !technicalLive,
      });
    }

    refresh(tokenId);
    const timer = setInterval(() => refresh(tokenId), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tokenId]);

  return state;
}
