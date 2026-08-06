import clsx from "clsx";
import { CheckCircle2, CircleSlash, FlaskConical } from "lucide-react";
import { useLiveScore, type SourceStatus } from "../hooks/useLiveScore";
import type { MarketToken } from "../types";
import { Card, ScoreBadge, Spinner } from "./common";
import { ScoreMethodologyPanel } from "./ScoreMethodologyPanel";

/**
 * The score running on live data, for one token.
 *
 * Leads with provenance rather than the number. A score is only as good as
 * what fed it, and a demo-fed reading that looks exactly like a real one is
 * worse than showing nothing — so every group states plainly whether it is
 * live, simulated, or absent from the calculation entirely.
 */

const STATUS_META: Record<SourceStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  live: { label: "Tempo real", tone: "text-[var(--color-up)]", Icon: CheckCircle2 },
  demo: { label: "Simulado", tone: "text-[var(--color-down)]", Icon: FlaskConical },
  unavailable: { label: "Fora do cálculo", tone: "text-[var(--color-text-dim)]", Icon: CircleSlash },
};

function formatUpdatedAt(ts: number | null): string {
  if (ts === null) return "—";
  return new Date(ts).toLocaleTimeString("pt-BR");
}

export function LiveScorePanel({
  tokens,
  selectedTokenId,
  onSelectToken,
  apiKey,
}: {
  tokens: MarketToken[];
  selectedTokenId: string | null;
  onSelectToken: (id: string) => void;
  apiKey?: string;
}) {
  const live = useLiveScore(selectedTokenId, apiKey);
  const selected = tokens.find((t) => t.id === selectedTokenId);

  if (tokens.length === 0) {
    return (
      <Card title="Score ao vivo">
        <p className="text-sm text-[var(--color-text-dim)]">
          Adicione moedas à watchlist na aba Mercado para calcular o score.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card title="Score ao vivo">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={selectedTokenId ?? ""}
            onChange={(e) => onSelectToken(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            {tokens.map((token) => (
              <option key={token.id} value={token.id}>
                {token.symbol.toUpperCase()} — {token.name}
              </option>
            ))}
          </select>
          {live.loading && <Spinner />}
          <span className="ml-auto text-xs text-[var(--color-text-dim)]">
            Atualizado às <span className="num-mono">{formatUpdatedAt(live.updatedAt)}</span> · a cada 5 min
          </span>
        </div>

        {live.score && (
          <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <div>
              <div className="text-xs text-[var(--color-text-dim)]">
                {selected ? selected.symbol.toUpperCase() : "Score"}
              </div>
              <div className="num-mono mt-0.5 text-4xl font-semibold text-[var(--color-text)]">
                {live.score.score.toFixed(0)}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <ScoreBadge level={live.score.level} />
              {live.confluence && (
                <span
                  className={clsx(
                    "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
                    live.confluence.level === "high"
                      ? "bg-[var(--color-up)]/15 text-[var(--color-up)]"
                      : "bg-white/5 text-[var(--color-text-dim)]",
                  )}
                >
                  {live.confluence.label}
                </span>
              )}
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-[var(--color-text-dim)]">Cobertura de dados</div>
              <div className="num-mono text-lg font-medium text-[var(--color-text)]">
                {(live.score.coverage * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        )}

        {live.confluence && (
          <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-dim)]">{live.confluence.detail}</p>
        )}

        {live.regime && (
          <div className="mb-3 rounded-lg border border-[var(--color-border)] p-3">
            <div className="text-xs text-[var(--color-text-dim)]">Regime de mercado</div>
            <div className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
              {live.regime.regime === "uptrend"
                ? "Tendência de alta"
                : live.regime.regime === "downtrend"
                  ? "Tendência de baixa"
                  : live.regime.regime === "range"
                    ? "Lateral"
                    : "Não classificado"}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-dim)]">{live.regime.reason}</p>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">
              Na v1 o regime é apenas informativo — ele ainda não altera os pesos do score.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-[var(--color-text)]">De onde vem cada dado</h4>
          {live.sources.map((source) => {
            const meta = STATUS_META[source.status];
            return (
              <div
                key={source.label}
                className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] p-2.5"
              >
                <meta.Icon size={15} className={clsx("mt-0.5 shrink-0", meta.tone)} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs font-medium text-[var(--color-text)]">{source.label}</span>
                    <span className={clsx("text-[11px] font-medium", meta.tone)}>{meta.label}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                    {source.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {live.isDemo && (
          <div className="mt-3 rounded-lg border border-[var(--color-down)]/40 bg-[var(--color-down)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
            Parte dos dados é simulada — este score não reflete o mercado agora e não deve orientar
            nenhuma decisão.
          </div>
        )}
      </Card>

      {/* Same panel as the methodology-only view, now filled in with the
          current reading of every metric. */}
      <ScoreMethodologyPanel result={live.score ?? undefined} />
    </>
  );
}
