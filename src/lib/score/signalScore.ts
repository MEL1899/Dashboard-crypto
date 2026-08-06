import type { ScoreLevel } from "../../components/common";
import {
  NEUTRAL,
  SCORE_MAX,
  SCORE_MIN,
  configForRegime,
  type MarketRegime,
  type MetricSpec,
  type ScoreWeightConfig,
} from "./config";

/**
 * LAYER 1 — Signal quality score (0-100).
 *
 * A pure function: it takes metric values that were already calculated
 * elsewhere and returns the score plus a full per-group, per-metric
 * breakdown. It touches no API, no clock and no randomness, so it is
 * exhaustively testable and auditable on its own — which is the point of
 * keeping the three layers apart (confluence lives in confluence.ts, risk
 * sizing in riskManagement.ts).
 *
 * See docs/pesquisa-score-oportunidade.md for the evidence behind every
 * weight, and config.ts for the weights themselves.
 */

/** RSI per timeframe. Any timeframe may be null when unavailable. */
export interface RsiByTimeframe {
  "1h": number | null;
  "4h": number | null;
  "1d": number | null;
}

/**
 * Raw metric inputs. Every field is nullable on purpose: on-chain and
 * sentiment feeds fail or simply do not exist for most altcoins, and a
 * score that refuses to produce a number in that case would be useless in
 * practice. Missing metrics are dropped and the remaining weights are
 * renormalized — `coverage` on the result reports how much of the intended
 * formula actually ran.
 */
export interface ScoreMetricInputs {
  rsi?: RsiByTimeframe | null;
  /** Bollinger %b — 0 = lower band, 1 = upper band. May sit outside [0,1]. */
  bollingerPercentB?: number | null;
  /** MACD histogram as a % of price, so it is comparable across assets. */
  macdHistogram?: number | null;
  /** Price distance to the long EMA, in %. Positive = price above. */
  emaDistance?: number | null;
  /** MVRV Z-Score (unitless). */
  mvrvZScore?: number | null;
  /** Perpetual funding rate, in % per day. */
  fundingRate?: number | null;
  /** Exchange netflow expressed in deviations from its own 7d average. */
  exchangeNetflow?: number | null;
  /** Alternative.me Fear & Greed Index, 0-100. */
  fearGreed?: number | null;
}

export interface MetricContribution {
  id: string;
  label: string;
  /** The value handed in, before normalization. */
  rawValue: number;
  /** After clipping + direction, on the 0-100 scale. */
  normalized: number;
  /** Weight actually applied, after renormalizing for missing siblings. */
  effectiveWeight: number;
  unit?: string;
}

export interface GroupContribution {
  id: string;
  label: string;
  /** 0-100 for this group alone, or null when no metric was available. */
  score: number | null;
  /** Weight actually applied, after scaling by coverage and renormalizing
   * over the surviving groups. Compare against the configured weight to see
   * how much a group was demoted for missing data. */
  effectiveWeight: number;
  /** Share of this group's configured metric weight that had data, 0-1.
   * Drives the demotion above. */
  coverage: number;
  metrics: MetricContribution[];
  /** Metrics defined in config but not supplied for this run. */
  missingMetrics: string[];
}

export interface SignalScoreResult {
  /** 0-100, 50 = neutral. This is "the score". */
  score: number;
  level: ScoreLevel;
  groups: GroupContribution[];
  /** Share of the configured formula backed by real data, 0-1. A score
   * built from one group out of three is a much weaker claim than one built
   * from all three, and the UI should be able to say so. */
  coverage: number;
  regime: MarketRegime;
  /** One short phrase per group, for places with room for a line of text
   * but not the full transparency panel — table subtitles, notification
   * bodies. Derived from the groups rather than written separately, so it
   * cannot describe a calculation that didn't happen. */
  breakdown: string[];
}

/** Maps a 0-100 score onto the 5-level badge the UI already renders.
 * Boundaries match the existing badge exactly: 20 → Venda, 40 → Neutro,
 * 60 → Compra, 80 → Compra Forte. */
export function classifyScore(score: number): ScoreLevel {
  if (score >= 80) return "strongBuy";
  if (score >= 60) return "buy";
  if (score >= 40) return "neutral";
  if (score >= 20) return "sell";
  return "strongSell";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Maps one raw value onto 0-100 using its spec: clip to the configured
 * range, scale linearly, then flip if the metric reads bearish-when-high.
 * A degenerate clip range (min === max) can't be scaled, so it returns
 * neutral rather than dividing by zero.
 */
export function normalizeMetric(rawValue: number, spec: MetricSpec): number {
  const { min, max } = spec.clip;
  if (max === min) return NEUTRAL;
  const clipped = clamp(rawValue, min, max);
  const scaled = ((clipped - min) / (max - min)) * (SCORE_MAX - SCORE_MIN) + SCORE_MIN;
  return spec.direction === "inverted" ? SCORE_MAX - scaled : scaled;
}

function isUsable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Collapses the three RSI timeframes into the single value the `rsi` metric
 * spec expects, weighting longer timeframes more heavily and renormalizing
 * over whichever timeframes are actually present.
 */
export function combineRsi(rsi: RsiByTimeframe, config: ScoreWeightConfig): number | null {
  const entries = (["1h", "4h", "1d"] as const)
    .map((tf) => ({ value: rsi[tf], weight: config.rsiTimeframeWeights[tf] }))
    .filter((e): e is { value: number; weight: number } => isUsable(e.value));

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) return null;
  return entries.reduce((sum, e) => sum + e.value * e.weight, 0) / totalWeight;
}

/** Pulls the raw value for one metric id out of the input bag, doing the
 * RSI timeframe collapse where needed. */
function rawValueFor(
  metricId: string,
  inputs: ScoreMetricInputs,
  config: ScoreWeightConfig,
): number | null {
  if (metricId === "rsi") {
    return inputs.rsi ? combineRsi(inputs.rsi, config) : null;
  }
  const value = (inputs as Record<string, unknown>)[metricId];
  return isUsable(value as number | null | undefined) ? (value as number) : null;
}

/**
 * Computes the score. `regime` currently selects an identical config for
 * every value (see config.ts) — it is threaded through now so that enabling
 * per-regime weights later needs no signature change here or at any call
 * site.
 */
export function computeSignalScore(
  inputs: ScoreMetricInputs,
  regime: MarketRegime = "unknown",
  /** Overrides the regime's config outright. Used by the direction A/B
   * harness, which needs two runs differing in exactly one metric's
   * direction; production callers should leave it unset. */
  configOverride?: ScoreWeightConfig,
): SignalScoreResult {
  const config = configOverride ?? configForRegime(regime);

  const groups: GroupContribution[] = config.groups.map((groupSpec) => {
    const present: { spec: MetricSpec; rawValue: number }[] = [];
    const missingMetrics: string[] = [];

    for (const metricSpec of groupSpec.metrics) {
      const rawValue = rawValueFor(metricSpec.id, inputs, config);
      if (rawValue === null) missingMetrics.push(metricSpec.id);
      else present.push({ spec: metricSpec, rawValue });
    }

    // Renormalize within the group so that, say, two of three on-chain
    // metrics still produce a properly weighted 0-100 group score instead
    // of one silently dragged toward zero by the missing third.
    const weightSum = present.reduce((sum, m) => sum + m.spec.weight, 0);
    const configuredWeightSum = groupSpec.metrics.reduce((sum, m) => sum + m.weight, 0);
    // Measured by weight, not by count: losing the 60%-weight metric out of
    // three is a much bigger hole than losing a 20% one.
    const coverage = configuredWeightSum > 0 ? weightSum / configuredWeightSum : 0;
    const metrics: MetricContribution[] = present.map(({ spec, rawValue }) => ({
      id: spec.id,
      label: spec.label,
      rawValue,
      normalized: normalizeMetric(rawValue, spec),
      effectiveWeight: weightSum > 0 ? spec.weight / weightSum : 0,
      unit: spec.unit,
    }));

    const score =
      metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.normalized * m.effectiveWeight, 0) : null;

    return {
      id: groupSpec.id,
      label: groupSpec.label,
      score,
      // Filled in below, once we know which groups survived.
      effectiveWeight: 0,
      coverage,
      metrics,
      missingMetrics,
    };
  });

  /*
   * Each group's weight is scaled by its own coverage before the surviving
   * groups are renormalized against each other.
   *
   * Without this, a group keeps its full share no matter how little of it
   * ran, and the last surviving metric inherits the whole thing. That was
   * not hypothetical: MVRV and exchange netflow have no free data source, so
   * the on-chain group was funding alone — and funding, a metric the
   * research doc gives ~11% of the score, was silently carrying 33%, more
   * than RSI and Bollinger combined. Nobody chose that; renormalization did.
   *
   * Scaling by coverage says the honest thing instead: a group that only
   * half ran only gets half its say, and the confidence it loses goes to the
   * groups that actually have data. With full coverage every weight is
   * exactly the configured one, so this changes nothing when all metrics
   * are present.
   */
  const available = groups.filter((g) => g.score !== null);
  const weightFor = (group: GroupContribution): number => {
    const spec = config.groups.find((s) => s.id === group.id);
    return (spec?.weight ?? 0) * group.coverage;
  };
  const groupWeightSum = available.reduce((sum, g) => sum + weightFor(g), 0);

  for (const group of groups) {
    if (group.score === null || groupWeightSum === 0) continue;
    group.effectiveWeight = weightFor(group) / groupWeightSum;
  }

  // No data at all is a genuinely neutral read, not a bearish one.
  const score =
    available.length > 0
      ? available.reduce((sum, g) => sum + (g.score as number) * g.effectiveWeight, 0)
      : NEUTRAL;

  const configuredMetricCount = config.groups.reduce((sum, g) => sum + g.metrics.length, 0);
  const suppliedMetricCount = groups.reduce((sum, g) => sum + g.metrics.length, 0);

  return {
    score: clamp(score, SCORE_MIN, SCORE_MAX),
    level: classifyScore(score),
    groups,
    coverage: configuredMetricCount > 0 ? suppliedMetricCount / configuredMetricCount : 0,
    regime,
    breakdown: groups.map((group) =>
      group.score === null ? `${group.label} sem dados` : `${group.label} ${group.score.toFixed(0)}`,
    ),
  };
}
