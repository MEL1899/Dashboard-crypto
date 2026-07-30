import { useEffect, useRef, useState } from "react";
import { appendScorePoint, loadScoreHistory, saveScoreHistory, type ScoreHistory } from "../lib/scoreHistory";
import type { TokenSignals } from "./useWatchlistSignals";

/**
 * Records a score point per token every time useWatchlistSignals resolves a
 * *real* (non-demo) score for it, building up the trail a sparkline needs.
 * Persisted to localStorage so the trail survives a reload instead of
 * starting over empty every time the page opens.
 */
export function useScoreHistory(signalsByToken: Record<string, TokenSignals>): ScoreHistory {
  const [history, setHistory] = useState<ScoreHistory>(() => loadScoreHistory());
  const seenRef = useRef<Record<string, TokenSignals>>({});

  useEffect(() => {
    // Only append when this is a genuinely new read for the token (a new
    // object reference means useWatchlistSignals just resolved a fresh
    // fetch), not on every render.
    const fresh = Object.entries(signalsByToken).filter(
      ([tokenId, signals]) => !signals.isDemo && seenRef.current[tokenId] !== signals,
    );
    if (fresh.length === 0) return;
    for (const [tokenId, signals] of fresh) seenRef.current[tokenId] = signals;

    setHistory((prev) => {
      let next = prev;
      for (const [tokenId, signals] of fresh) {
        next = appendScorePoint(next, tokenId, { time: Date.now(), score: signals.score.score });
      }
      saveScoreHistory(next);
      return next;
    });
  }, [signalsByToken]);

  return history;
}
