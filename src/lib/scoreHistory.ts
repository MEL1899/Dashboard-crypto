const STORAGE_KEY = "crypto-dashboard:score-history";

/** Keep enough points for a legible sparkline without the localStorage blob
 * growing without bound over a long session. */
const MAX_POINTS_PER_TOKEN = 60;

export interface ScorePoint {
  time: number;
  score: number;
}

export type ScoreHistory = Record<string, ScorePoint[]>;

export function loadScoreHistory(): ScoreHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScoreHistory) : {};
  } catch {
    return {};
  }
}

export function saveScoreHistory(history: ScoreHistory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Same reasoning as saveSettings: a sparkline that stops persisting is
    // a nuisance, an exception thrown from inside a state updater is not.
  }
}

/** Appends one point for a token, capped to the last MAX_POINTS_PER_TOKEN —
 * returns a new object (doesn't mutate `history`) so it's safe to use
 * directly as React state. */
export function appendScorePoint(
  history: ScoreHistory,
  tokenId: string,
  point: ScorePoint,
): ScoreHistory {
  const existing = history[tokenId] ?? [];
  const next = [...existing, point].slice(-MAX_POINTS_PER_TOKEN);
  return { ...history, [tokenId]: next };
}
