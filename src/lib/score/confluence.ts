import { CONFLUENCE_BEARISH_BELOW, CONFLUENCE_BULLISH_ABOVE } from "./config";
import type { GroupContribution } from "./signalScore";

/**
 * LAYER 2 — Confluence (a confidence label, never part of the number).
 *
 * Checks whether the three groups agree. It deliberately returns only a
 * label and never touches the score: the research doc is explicit that no
 * peer-reviewed or institutional study measures confluence actually
 * improving win rate or risk-adjusted return (section 4). Folding an
 * unvalidated multiplier into the score would be inventing precision;
 * showing the user "these groups disagree" is honest transparency.
 *
 * Kept in its own module, taking the previous layer's output as plain data,
 * so each layer can be audited on its own.
 */

export type ConfluenceLevel = "high" | "mixed" | "insufficient";

/** How one group reads on the 0-100 scale. */
export type GroupStance = "bullish" | "bearish" | "neutral";

export interface GroupStanceDetail {
  id: string;
  label: string;
  score: number;
  stance: GroupStance;
}

export interface ConfluenceResult {
  level: ConfluenceLevel;
  /** Short label for the badge, in the UI's language. */
  label: string;
  /** One-line explanation of why it reads that way. */
  detail: string;
  /** Per-group stance, so the UI can show which ones disagree. */
  stances: GroupStanceDetail[];
  /** Groups that had data. Below 2 there is nothing to agree *with*. */
  availableGroups: number;
}

export function classifyStance(score: number): GroupStance {
  if (score > CONFLUENCE_BULLISH_ABOVE) return "bullish";
  if (score < CONFLUENCE_BEARISH_BELOW) return "bearish";
  return "neutral";
}

const STANCE_LABEL: Record<GroupStance, string> = {
  bullish: "altista",
  bearish: "baixista",
  neutral: "neutro",
};

/**
 * "High confluence" requires every available group to take the *same*
 * non-neutral stance. A neutral group is treated as disagreement rather
 * than as a free pass: if on-chain says nothing while technicals scream
 * buy, that is precisely the mixed signal the user should see.
 */
export function evaluateConfluence(groups: GroupContribution[]): ConfluenceResult {
  const stances: GroupStanceDetail[] = groups
    .filter((g): g is GroupContribution & { score: number } => g.score !== null)
    .map((g) => ({ id: g.id, label: g.label, score: g.score, stance: classifyStance(g.score) }));

  if (stances.length < 2) {
    return {
      level: "insufficient",
      label: "Dados insuficientes",
      detail:
        stances.length === 0
          ? "Nenhum grupo de métricas tinha dados — não há como avaliar confluência."
          : `Só o grupo ${stances[0].label} tinha dados — é preciso pelo menos dois grupos para haver concordância.`,
      stances,
      availableGroups: stances.length,
    };
  }

  const first = stances[0].stance;
  const allAgree = first !== "neutral" && stances.every((s) => s.stance === first);

  if (allAgree) {
    return {
      level: "high",
      label: "Alta confluência",
      detail: `Os ${stances.length} grupos com dados apontam na mesma direção (${STANCE_LABEL[first]}).`,
      stances,
      availableGroups: stances.length,
    };
  }

  const summary = stances.map((s) => `${s.label} ${STANCE_LABEL[s.stance]}`).join(", ");
  return {
    level: "mixed",
    label: "Sinal misto",
    detail: `Os grupos divergem (${summary}) — menor confiança, mesmo que o score esteja em um extremo.`,
    stances,
    availableGroups: stances.length,
  };
}
