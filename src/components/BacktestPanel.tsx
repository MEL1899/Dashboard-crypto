import { useMemo, useState } from "react";
import clsx from "clsx";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ListChecks } from "lucide-react";
import type { MarketToken } from "../types";
import type { Currency } from "../lib/currency";
import type { BacktestMode, BacktestResult } from "../lib/backtest";
import { BACKTEST_WINDOW_OPTIONS } from "../lib/backtestData";
import { useBacktestAll, type BacktestSummary } from "../hooks/useBacktestAll";
import { useRsiBacktestAll, type RsiBacktestSummary } from "../hooks/useRsiBacktestAll";
import { Card, Spinner, formatPrice } from "./common";

interface BacktestPanelProps {
  tokens: MarketToken[];
  apiKey?: string;
  currency: Currency;
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="text-xs text-[var(--color-text-dim)]">{label}</div>
      <div
        className={clsx(
          "num-mono mt-1 text-xl font-semibold",
          tone === "up" && "text-[var(--color-up)]",
          tone === "down" && "text-[var(--color-down)]",
          (!tone || tone === "neutral") && "text-[var(--color-text)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** "DD/MM/AAAA a DD/MM/AAAA (N dias)" for the exact period the trades were
 * actually simulated over — the warmup candles aren't included, since no
 * trade can happen during them. */
function dateRangeLabel(result: BacktestResult): string | null {
  if (result.equityCurve.length === 0) return null;
  const first = result.equityCurve[0].time;
  const last = result.equityCurve[result.equityCurve.length - 1].time;
  const days = Math.round((last - first) / 86400);
  const fmt = (t: number) => new Date(t * 1000).toLocaleDateString("pt-BR");
  return `${fmt(first)} a ${fmt(last)} (${days} dias)`;
}

interface SelectedDetail {
  source: "score" | "rsi";
  sourceLabel: string;
  tokenId: string;
  symbol: string;
  result: BacktestResult;
  isDemo: boolean;
}

const MODE_OPTIONS: { label: string; value: BacktestMode }[] = [
  { label: "Compra/Venda (score ≥60 / ≤40)", value: "any" },
  { label: "Só Compra Forte/Venda Forte (score ≥80 / ≤20)", value: "strongOnly" },
];

const RSI_PERIOD_OPTIONS = [7, 14, 21];

function ComparisonTable<T extends { tokenId: string; symbol: string; result: BacktestResult; isDemo: boolean }>({
  summaries,
  selectedTokenId,
  onSelect,
}: {
  summaries: T[];
  selectedTokenId: string | null;
  onSelect: (s: T) => void;
}) {
  // Ranked by absolute strategy return — profit is the goal here, not
  // beating buy & hold (that's still shown alongside for context, since
  // it's free information, but it's not what decides the order).
  const ranked = useMemo(
    () => [...summaries].sort((a, b) => b.result.strategyReturnPct - a.result.strategyReturnPct),
    [summaries],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[var(--color-text-dim)]">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Ativo</th>
            <th className="py-1.5 pr-3 font-medium">Estratégia</th>
            <th className="py-1.5 pr-3 font-medium">Buy & Hold (ref.)</th>
            <th className="py-1.5 pr-3 font-medium">Trades</th>
            <th className="py-1.5 pr-3 font-medium">Acerto</th>
            <th className="py-1.5 pr-3 font-medium">Drawdown</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s) => (
            <tr
              key={s.tokenId}
              onClick={() => onSelect(s)}
              className={clsx(
                "cursor-pointer border-t border-[var(--color-border)] transition-colors hover:bg-white/5",
                s.tokenId === selectedTokenId && "bg-[var(--color-accent)]/10",
              )}
            >
              <td className="py-1.5 pr-3 font-medium text-[var(--color-text)]">
                {s.symbol}
                {s.isDemo && <span className="ml-1 text-[10px] text-[var(--color-text-dim)]">(demo)</span>}
              </td>
              <td
                className={clsx(
                  "num-mono py-1.5 pr-3 font-medium",
                  s.result.strategyReturnPct >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
                )}
              >
                {s.result.strategyReturnPct >= 0 ? "+" : ""}
                {s.result.strategyReturnPct.toFixed(1)}%
              </td>
              <td className="num-mono py-1.5 pr-3 text-[var(--color-text-dim)]">
                {s.result.buyHoldReturnPct >= 0 ? "+" : ""}
                {s.result.buyHoldReturnPct.toFixed(1)}%
              </td>
              <td className="num-mono py-1.5 pr-3 text-[var(--color-text-dim)]">{s.result.trades.length}</td>
              <td className="num-mono py-1.5 pr-3 text-[var(--color-text-dim)]">
                {s.result.trades.length > 0 ? `${s.result.winRate.toFixed(0)}%` : "-"}
              </td>
              <td className="num-mono py-1.5 pr-3 text-[var(--color-down)]">
                -{s.result.maxDrawdownPct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BacktestPanel({ tokens, apiKey, currency }: BacktestPanelProps) {
  const [mode, setMode] = useState<BacktestMode>("any");
  const [rsiPeriod, setRsiPeriod] = useState(14);
  // Index into BACKTEST_WINDOW_OPTIONS, kept as a string since that's what
  // <select> values are — defaults to "Máximo disponível" (last option).
  const [windowIndex, setWindowIndex] = useState(String(BACKTEST_WINDOW_OPTIONS.length - 1));
  const windowDays = BACKTEST_WINDOW_OPTIONS[Number(windowIndex)]?.days;

  const scoreBatch = useBacktestAll();
  const rsiBatch = useRsiBacktestAll();
  const [selected, setSelected] = useState<SelectedDetail | null>(null);

  function handleRunScore() {
    if (tokens.length === 0) return;
    setSelected(null);
    scoreBatch.runAll(tokens, apiKey, mode, windowDays);
  }

  function handleRunRsi() {
    if (tokens.length === 0) return;
    setSelected(null);
    rsiBatch.runAll(tokens, rsiPeriod, apiKey, windowDays);
  }

  function handleSelectScore(s: BacktestSummary) {
    setSelected({
      source: "score",
      sourceLabel: "Score",
      tokenId: s.tokenId,
      symbol: s.symbol,
      result: s.result,
      isDemo: s.isDemo,
    });
  }

  function handleSelectRsi(s: RsiBacktestSummary) {
    setSelected({
      source: "rsi",
      sourceLabel: `RSI(${rsiPeriod})`,
      tokenId: s.tokenId,
      symbol: s.symbol,
      result: s.result,
      isDemo: s.isDemo,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Backtest — Score de Oportunidade">
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-dim)]">
          Simula o score como uma regra de swing trade pra toda a sua watchlist de uma vez,
          operando comprado (long) E vendido (short): abre ou vira comprado no primeiro dia em
          que o score entra na faixa de compra escolhida abaixo, abre ou vira vendido no
          primeiro dia em que entra na faixa de venda — ou seja, também pode lucrar com o
          mercado caindo, não só subindo. Usa só o timeframe diário — não a confluência completa
          de 5 timeframes do app — e não modela taxas, slippage nem alavancagem. Buy & hold
          aparece como referência de contexto, não como meta: o que importa aqui é o retorno
          absoluto da estratégia. Trate como um teste de direção do sinal, não uma réplica exata
          do score ao vivo, e lembre que desempenho passado não garante resultado futuro.
        </p>

        {tokens.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            Adicione moedas à watchlist na aba Mercado para poder rodar um backtest.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as BacktestMode)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={windowIndex}
                onChange={(e) => setWindowIndex(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {BACKTEST_WINDOW_OPTIONS.map((opt, i) => (
                  <option key={opt.label} value={i}>
                    Janela: {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleRunScore}
                disabled={scoreBatch.running}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {scoreBatch.running ? <Spinner /> : <ListChecks size={14} />}
                Rodar para toda a watchlist ({tokens.length})
              </button>
            </div>
            {scoreBatch.running && (
              <p className="text-xs text-[var(--color-text-dim)]">
                Rodando {scoreBatch.progress.done} de {scoreBatch.progress.total}...
              </p>
            )}
          </div>
        )}
      </Card>

      {scoreBatch.summaries.length > 0 && (
        <Card title="Comparação da watchlist — Score">
          <p className="mb-2 text-xs text-[var(--color-text-dim)]">
            Ordenado pelo retorno absoluto da estratégia — clique numa linha pra ver os trades em
            detalhe abaixo.
          </p>
          <ComparisonTable
            summaries={scoreBatch.summaries}
            selectedTokenId={selected?.source === "score" ? selected.tokenId : null}
            onSelect={handleSelectScore}
          />
        </Card>
      )}

      <Card title="Backtest — RSI puro">
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-dim)]">
          Estratégia bem mais simples que o score, também long/short: abre ou vira comprado
          quando o RSI cai a 30 ou menos, abre ou vira vendido quando sobe a 70 ou mais — sem
          MACD, Bollinger, tendência ou força relativa. Útil como comparação direta: o score
          completo pode abrir uma compra mesmo com o RSI em sobrecompra moderada, se os outros
          indicadores (tendência, MACD, força relativa) estiverem fortes o bastante pra
          compensar — o que explica comprar perto de topos em movimentos de alta forte. Rodando
          só o RSI isola esse comportamento.
        </p>
        {tokens.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={rsiPeriod}
                onChange={(e) => setRsiPeriod(Number(e.target.value))}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {RSI_PERIOD_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    RSI({p})
                  </option>
                ))}
              </select>
              <button
                onClick={handleRunRsi}
                disabled={rsiBatch.running}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] disabled:opacity-60"
              >
                {rsiBatch.running ? <Spinner /> : <Activity size={14} />}
                Rodar RSI para toda a watchlist ({tokens.length})
              </button>
            </div>
            {rsiBatch.running && (
              <p className="text-xs text-[var(--color-text-dim)]">
                Rodando {rsiBatch.progress.done} de {rsiBatch.progress.total}...
              </p>
            )}
          </div>
        )}
      </Card>

      {rsiBatch.summaries.length > 0 && (
        <Card title={`Comparação da watchlist — RSI(${rsiPeriod})`}>
          <p className="mb-2 text-xs text-[var(--color-text-dim)]">
            Ordenado pelo retorno absoluto da estratégia — clique numa linha pra ver os trades em
            detalhe abaixo.
          </p>
          <ComparisonTable
            summaries={rsiBatch.summaries}
            selectedTokenId={selected?.source === "rsi" ? selected.tokenId : null}
            onSelect={handleSelectRsi}
          />
        </Card>
      )}

      {selected && selected.isDemo && (
        <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
          Modo demonstração: não foi possível carregar histórico real pra esse ativo. Exibindo
          candles simulados.
        </div>
      )}

      {selected && selected.result.equityCurve.length === 0 && (
        <p className="text-sm text-[var(--color-text-dim)]">
          Histórico insuficiente pra {selected.symbol} — o resultado ficou vazio.
        </p>
      )}

      {selected && selected.result.equityCurve.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile
              label="Retorno da estratégia"
              value={`${selected.result.strategyReturnPct >= 0 ? "+" : ""}${selected.result.strategyReturnPct.toFixed(1)}%`}
              tone={selected.result.strategyReturnPct >= 0 ? "up" : "down"}
            />
            <StatTile
              label="Buy & Hold (referência)"
              value={`${selected.result.buyHoldReturnPct >= 0 ? "+" : ""}${selected.result.buyHoldReturnPct.toFixed(1)}%`}
              tone={selected.result.buyHoldReturnPct >= 0 ? "up" : "down"}
            />
            <StatTile label="Nº de trades" value={String(selected.result.trades.length)} />
            <StatTile label="Taxa de acerto" value={`${selected.result.winRate.toFixed(0)}%`} />
            <StatTile
              label="Maior drawdown"
              value={`-${selected.result.maxDrawdownPct.toFixed(1)}%`}
              tone="down"
            />
          </div>

          <Card title={`Curva de capital — ${selected.symbol} (${selected.sourceLabel})`}>
            {dateRangeLabel(selected.result) && (
              <p className="mb-2 text-xs text-[var(--color-text-dim)]">
                Período simulado: {dateRangeLabel(selected.result)}
              </p>
            )}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selected.result.equityCurve}>
                  <CartesianGrid stroke="#1c1f2a" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(v) =>
                      new Date(Number(v) * 1000).toLocaleDateString("pt-BR", {
                        month: "short",
                        day: "2-digit",
                      })
                    }
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: "#191c26",
                      border: "1px solid #262a38",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => new Date(Number(v) * 1000).toLocaleDateString("pt-BR")}
                    formatter={(v, name) => [
                      Number(v).toFixed(1),
                      name === "equity" ? "Estratégia" : "Buy & Hold",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="buyHoldEquity"
                    stroke="#8b93a7"
                    fill="#8b93a733"
                    strokeWidth={1.5}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#7c6cff" fill="#7c6cff33" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`Trades (${selected.result.trades.length})`}>
            {selected.result.trades.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">
                Nenhum trade — o sinal não cruzou nesse período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--color-text-dim)]">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Direção</th>
                      <th className="py-1.5 pr-3 font-medium">Entrada</th>
                      <th className="py-1.5 pr-3 font-medium">Saída</th>
                      <th className="py-1.5 pr-3 font-medium">Preço entrada</th>
                      <th className="py-1.5 pr-3 font-medium">Preço saída</th>
                      <th className="py-1.5 pr-3 font-medium">Retorno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.result.trades.map((t) => (
                      <tr key={t.entryTime} className="border-t border-[var(--color-border)]">
                        <td className="py-1.5 pr-3">
                          <span
                            className={clsx(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              t.type === "long"
                                ? "bg-[var(--color-up)]/15 text-[var(--color-up)]"
                                : "bg-[var(--color-down)]/15 text-[var(--color-down)]",
                            )}
                          >
                            {t.type === "long" ? "Long" : "Short"}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          {new Date(t.entryTime * 1000).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-1.5 pr-3">
                          {new Date(t.exitTime * 1000).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="num-mono py-1.5 pr-3">{formatPrice(t.entryPrice, currency)}</td>
                        <td className="num-mono py-1.5 pr-3">{formatPrice(t.exitPrice, currency)}</td>
                        <td
                          className={clsx(
                            "num-mono py-1.5 pr-3 font-medium",
                            t.returnPct >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
                          )}
                        >
                          {t.returnPct >= 0 ? "+" : ""}
                          {t.returnPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
