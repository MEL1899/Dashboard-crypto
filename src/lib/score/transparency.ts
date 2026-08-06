import { configForRegime, type MarketRegime, type MetricDirection } from "./config";
import type { SignalScoreResult } from "./signalScore";

/**
 * Builds the data behind the "Como esse score é calculado?" panel.
 *
 * Generated from the very same config object the scoring functions read, so
 * the explanation cannot drift out of sync with the math the way a
 * hand-written description would. Per the research doc (section 3), of the
 * published composite indices only Alternative.me's Fear & Greed discloses
 * its exact weights — Coinglass, LunarCrush and IntoTheBlock are black
 * boxes to varying degrees. Publishing ours is the differentiator, so this
 * has to stay honest by construction rather than by discipline.
 *
 * Returns plain data, no JSX: the React panel renders this, and tests can
 * assert against it without touching the DOM.
 */

export interface ExplainedMetric {
  id: string;
  label: string;
  /** Weight inside its group, as a %, as CONFIGURED. */
  weightPct: number;
  /** Weight in the final score, as a %, as CONFIGURED (group × metric).
   * What the formula intends when every metric has data. */
  overallWeightPct: number;
  /**
   * Weight this metric ACTUALLY carried in the run being explained, as a %.
   * Present only when explaining a real result, and different from
   * `overallWeightPct` whenever siblings dropped out.
   *
   * This distinction is the whole point of the panel. Showing only the
   * configured number was a real defect: with MVRV and netflow permanently
   * unavailable, the panel published "Funding Rate — 11.1% do total" while
   * funding was in fact carrying 33.3%. A transparency panel that discloses
   * the intended weights and calls them the real ones is worse than no
   * panel, because it is confidently wrong.
   */
  effectiveWeightPct?: number;
  direction: MetricDirection;
  directionLabel: string;
  clip: { min: number; max: number };
  unit?: string;
  rationale: string;
  /** Present only when explaining an actual score run. */
  currentValue?: { raw: number; normalized: number } | null;
}

export interface ExplainedGroup {
  id: string;
  label: string;
  /** As configured. */
  weightPct: number;
  /** What the group actually weighed in the explained run, after being
   * scaled by its coverage. Present only when explaining a real result. */
  effectiveWeightPct?: number;
  /** Share of this group's configured metric weight that had data, as a %. */
  coveragePct?: number;
  metrics: ExplainedMetric[];
  /** Present only when explaining an actual run. */
  currentScore?: number | null;
  /** Metric ids configured but missing from that run. */
  missingMetrics?: string[];
}

export interface ScoreExplanation {
  groups: ExplainedGroup[];
  regime: MarketRegime;
  /** Fixed notes about the methodology itself, not about any one run. */
  methodologyNotes: string[];
  /** Present only when explaining an actual run. */
  currentScore?: number;
  coveragePct?: number;
}

const DIRECTION_LABEL: Record<MetricDirection, string> = {
  direct: "Valor alto = mais altista",
  inverted: "Valor alto = mais baixista",
};

const METHODOLOGY_NOTES = [
  "Os 3 grupos têm peso igual (1/3 cada). Pesos iguais são a escolha mais defensável enquanto não houver dado próprio para calibrar via PCA ou regressão (OECD Handbook on Constructing Composite Indicators).",
  "Cada métrica é normalizada para 0-100 (0 = extremamente baixista, 50 = neutro, 100 = extremamente altista) antes de qualquer ponderação.",
  "Dentro do grupo técnico, RSI e Bollinger pesam mais que MACD porque superaram o MACD em estudos independentes; o MACD foi o pior indicador em três deles.",
  "Métricas indisponíveis são descartadas e os pesos restantes são renormalizados — quando isso acontece, o painel mostra o peso real ao lado do peso configurado.",
  "O peso de um grupo é reduzido na proporção do que faltou nele: um grupo com metade das métricas sem dado entra com metade do peso, e a diferença vai para os grupos que têm dado. Sem isso, a última métrica de um grupo herdava o peso do grupo inteiro.",
  "Confluência entre os grupos é mostrada como rótulo separado e NÃO entra na conta: não há estudo publicado validando que confluência aumente o win rate.",
  "Os limites de normalização são ponto de partida, não valores definitivos — devem ser calibrados com dado histórico real.",
];

/**
 * Explains the formula. Pass a `result` to also fill in each metric's
 * current value; omit it to document the methodology on its own (for a
 * static docs page, say).
 */
export function explainScore(
  result?: SignalScoreResult,
  regime: MarketRegime = "unknown",
): ScoreExplanation {
  const effectiveRegime = result?.regime ?? regime;
  const config = configForRegime(effectiveRegime);

  const groups: ExplainedGroup[] = config.groups.map((groupSpec) => {
    const runGroup = result?.groups.find((g) => g.id === groupSpec.id);

    const metrics: ExplainedMetric[] = groupSpec.metrics.map((metricSpec) => {
      const runMetric = runGroup?.metrics.find((m) => m.id === metricSpec.id);
      return {
        id: metricSpec.id,
        label: metricSpec.label,
        weightPct: metricSpec.weight * 100,
        overallWeightPct: metricSpec.weight * groupSpec.weight * 100,
        direction: metricSpec.direction,
        directionLabel: DIRECTION_LABEL[metricSpec.direction],
        clip: metricSpec.clip,
        unit: metricSpec.unit,
        rationale: metricSpec.rationale,
        ...(result
          ? {
              currentValue: runMetric
                ? { raw: runMetric.rawValue, normalized: runMetric.normalized }
                : null,
              // Taken from the run, not recomputed: the metric's share of
              // its group times the group's share of the score, both after
              // renormalization. A metric with no data carried 0.
              effectiveWeightPct: runMetric
                ? runMetric.effectiveWeight * (runGroup?.effectiveWeight ?? 0) * 100
                : 0,
            }
          : {}),
      };
    });

    return {
      id: groupSpec.id,
      label: groupSpec.label,
      weightPct: groupSpec.weight * 100,
      metrics,
      ...(result
        ? {
            currentScore: runGroup?.score ?? null,
            missingMetrics: runGroup?.missingMetrics ?? [],
            effectiveWeightPct: (runGroup?.effectiveWeight ?? 0) * 100,
            coveragePct: (runGroup?.coverage ?? 0) * 100,
          }
        : {}),
    };
  });

  return {
    groups,
    regime: effectiveRegime,
    methodologyNotes: METHODOLOGY_NOTES,
    ...(result ? { currentScore: result.score, coveragePct: result.coverage * 100 } : {}),
  };
}
