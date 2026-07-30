import { useEffect, useRef } from "react";
import type { TokenSignals } from "./useWatchlistSignals";
import type { MarketToken } from "../types";
import type { ScoreLevel } from "../components/common";

const ALERT_LEVELS: ScoreLevel[] = ["strongBuy", "strongSell"];

/**
 * Fires a browser notification the moment a token's confluence score
 * crosses INTO Compra Forte or Venda Forte — not on first load (there's no
 * "previous level" yet to compare against) and not again on every
 * subsequent refresh while it stays there, so one crossing means one
 * notification, not a stream of duplicates.
 */
export function useScoreAlerts(
  signalsByToken: Record<string, TokenSignals>,
  tokens: MarketToken[],
  enabled: boolean,
) {
  const prevLevelRef = useRef<Record<string, ScoreLevel>>({});

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    for (const [tokenId, signals] of Object.entries(signalsByToken)) {
      if (signals.isDemo) continue;
      const prevLevel = prevLevelRef.current[tokenId];
      const level = signals.score.level;
      prevLevelRef.current[tokenId] = level;

      if (prevLevel === undefined || prevLevel === level) continue;
      if (!ALERT_LEVELS.includes(level)) continue;

      const token = tokens.find((t) => t.id === tokenId);
      const label = token ? token.symbol : tokenId;
      const title = level === "strongBuy" ? `${label}: Compra Forte` : `${label}: Venda Forte`;
      new Notification(title, {
        body: `Score ${signals.score.score} — ${signals.score.breakdown.join(", ")}`,
        tag: `score-${tokenId}`,
      });
    }
  }, [signalsByToken, tokens, enabled]);
}
