import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { MarketRegime } from "../lib/score/config";
import { classifyScore, type SignalScoreResult } from "../lib/score/signalScore";
import { explainScore, type ExplainedGroup, type ExplainedMetric } from "../lib/score/transparency";
import { Card, ScoreBadge } from "./common";

/**
 * The "Como esse score é calculado?" panel.
 *
 * Every number rendered here comes from lib/score/transparency.ts, which
 * derives it from the same config object the scoring functions read — so
 * this panel cannot fall out of sync with the math the way a hand-written
 * description would. Of the composite indices surveyed in
 * docs/pesquisa-score-oportunidade.md (section 3), only Alternative.me's
 * Fear & Greed publishes its exact weights; Coinglass, LunarCrush and
 * IntoTheBlock are black boxes. Publishing ours is the differentiator, and
 * generating it is what keeps it true.
 *
 * Renders in two modes: pass a `result` to show each metric's current
 * value alongside the formula, or omit it to document the methodology on
 * its own (which is what happens while the score isn't wired to live data
 * yet).
 */

function formatValue(value: number, unit?: string): string {
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
  return unit ? `${rounded} ${unit}` : rounded;
}

/** 0-100 bar showing where a normalized metric or group sits. Bearish half
 * reads red, bullish half green, matching the badge's palette. */
function ScoreBar({ value }: { value: number }) {
  const tone = value > 60 ? "var(--color-up)" : value < 40 ? "var(--color-down)" : "var(--color-text-dim)";
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: tone }}
      />
    </div>
  );
}

function MetricRow({ metric, hasResult }: { metric: ExplainedMetric; hasResult: boolean }) {
  const current = metric.currentValue;
  return (
    <div className="border-t border-[var(--color-border)] py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-[var(--color-text)]">{metric.label}</span>
        {/* The effective figure leads whenever it differs, because it is
            the one that actually produced the number on screen. The
            configured one stays visible so the gap is auditable. */}
        <span className="num-mono text-[11px] text-[var(--color-text-dim)]">
          {metric.effectiveWeightPct !== undefined &&
          Math.abs(metric.effectiveWeightPct - metric.overallWeightPct) >= 0.1 ? (
            <>
              <span className="font-medium text-[var(--color-text)]">
                {metric.effectiveWeightPct.toFixed(1)}% do total agora
              </span>{" "}
              · {metric.overallWeightPct.toFixed(1)}% configurado
            </>
          ) : (
            <>
              {metric.weightPct.toFixed(0)}% do grupo · {metric.overallWeightPct.toFixed(1)}% do total
            </>
          )}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-dim)]">
        <span className="inline-flex items-center gap-1">
          {metric.direction === "direct" ? (
            <ArrowUp size={11} className="text-[var(--color-up)]" />
          ) : (
            <ArrowDown size={11} className="text-[var(--color-down)]" />
          )}
          {metric.directionLabel}
        </span>
        <span className="num-mono">
          Faixa: {metric.clip.min} a {metric.clip.max}
          {metric.unit ? ` ${metric.unit}` : ""}
        </span>
      </div>

      {hasResult &&
        (current ? (
          <div className="mt-1.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-[var(--color-text-dim)]">
                Valor atual: <span className="num-mono text-[var(--color-text)]">{formatValue(current.raw, metric.unit)}</span>
              </span>
              <span className="num-mono text-[var(--color-text)]">{current.normalized.toFixed(0)}/100</span>
            </div>
            <ScoreBar value={current.normalized} />
          </div>
        ) : (
          <div className="mt-1.5 text-xs text-[var(--color-text-dim)]">Sem dado nesta leitura — peso redistribuído.</div>
        ))}

      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-dim)]">{metric.rationale}</p>
    </div>
  );
}

function GroupSection({ group, hasResult }: { group: ExplainedGroup; hasResult: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--color-text)]">{group.label}</h4>
        <span className="num-mono text-xs text-[var(--color-text-dim)]">
          {group.effectiveWeightPct !== undefined &&
          Math.abs(group.effectiveWeightPct - group.weightPct) >= 0.1 ? (
            <>
              <span className="font-medium text-[var(--color-text)]">
                {group.effectiveWeightPct.toFixed(1)}% do score agora
              </span>{" "}
              · {group.weightPct.toFixed(1)}% configurado
            </>
          ) : (
            <>{group.weightPct.toFixed(1)}% do score</>
          )}
        </span>
      </div>

      {hasResult && (
        <div className="mt-2">
          {group.currentScore !== null && group.currentScore !== undefined ? (
            <>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-[var(--color-text-dim)]">Leitura do grupo</span>
                <span className="num-mono font-medium text-[var(--color-text)]">
                  {group.currentScore.toFixed(0)}/100
                </span>
              </div>
              <ScoreBar value={group.currentScore} />
              {group.coveragePct !== undefined && group.coveragePct < 99.9 && (
                <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
                  Só {group.coveragePct.toFixed(0)}% deste grupo tinha dado, então ele entrou com peso
                  reduzido — o restante foi para os grupos que têm dado.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-[var(--color-text-dim)]">
              Nenhuma métrica deste grupo tinha dado — o grupo saiu do cálculo e os pesos foram redistribuídos.
            </p>
          )}
        </div>
      )}

      <div className="mt-1">
        {group.metrics.map((metric) => (
          <MetricRow key={metric.id} metric={metric} hasResult={hasResult} />
        ))}
      </div>
    </div>
  );
}

const REGIME_LABEL: Record<MarketRegime, string> = {
  uptrend: "Tendência de alta",
  downtrend: "Tendência de baixa",
  range: "Lateral",
  unknown: "Não classificado",
};

export function ScoreMethodologyPanel({ result }: { result?: SignalScoreResult }) {
  const explanation = explainScore(result);
  const hasResult = result !== undefined;

  return (
    <Card title="Como esse score é calculado?">
      <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-dim)]">
        Esta página é gerada a partir do mesmo objeto de configuração que faz a conta — se um peso
        mudar no código, ele muda aqui junto. Dos índices compostos publicados no setor, só o Fear
        &amp; Greed da Alternative.me divulga seus pesos exatos; Coinglass, LunarCrush e
        IntoTheBlock não abrem a fórmula.
      </p>

      {hasResult && explanation.currentScore !== undefined && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div>
            <div className="text-xs text-[var(--color-text-dim)]">Score atual</div>
            <div className="num-mono mt-0.5 text-2xl font-semibold text-[var(--color-text)]">
              {explanation.currentScore.toFixed(0)}
            </div>
          </div>
          <ScoreBadge level={classifyScore(explanation.currentScore)} />
          {explanation.coveragePct !== undefined && (
            <div className="ml-auto text-right">
              <div className="text-xs text-[var(--color-text-dim)]">Cobertura de dados</div>
              <div className="num-mono text-sm font-medium text-[var(--color-text)]">
                {explanation.coveragePct.toFixed(0)}%
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-3 text-xs text-[var(--color-text-dim)]">
        Regime de mercado: <span className="text-[var(--color-text)]">{REGIME_LABEL[explanation.regime]}</span>{" "}
        — na v1 os pesos são os mesmos em qualquer regime.
      </div>

      <div className="flex flex-col gap-3">
        {explanation.groups.map((group) => (
          <GroupSection key={group.id} group={group} hasResult={hasResult} />
        ))}
      </div>

      <div className="mt-4">
        <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Notas de metodologia</h4>
        <ul className="flex flex-col gap-1.5">
          {explanation.methodologyNotes.map((note) => (
            <li
              key={note}
              className={clsx(
                "pl-3 text-xs leading-relaxed text-[var(--color-text-dim)]",
                "border-l-2 border-[var(--color-border)]",
              )}
            >
              {note}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
