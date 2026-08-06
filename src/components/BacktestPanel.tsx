import { useMemo, useState } from "react";
import clsx from "clsx";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ListChecks } from "lucide-react";
import type { MarketToken } from "../types";
import type { Currency } from "../lib/currency";
import {
  DEFAULT_RISK_PER_TRADE_PCT,
  ROUND_TRIP_COST_PCT,
  type BacktestMode,
  type BacktestResult,
  type BacktestTimeframe,
  type ExitReason,
} from "../lib/backtest";
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

const EXIT_REASON_LABEL: Record<ExitReason, string> = {
  stop: "Stop",
  trail: "Stop móvel",
  target: "Alvo",
  signal: "Sinal",
  end: "Fim do período",
};

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

/** Daily candles only need a date; 1h/4h candles can carry several trades
 * per day, so those get the time of day too, or entries/exits on the same
 * day would look identical. */
function formatCandleTime(t: number, timeframe: BacktestTimeframe): string {
  const date = new Date(t * 1000);
  return timeframe === "1d"
    ? date.toLocaleDateString("pt-BR")
    : date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TIMEFRAME_OPTIONS: { label: string; value: BacktestTimeframe }[] = [
  { label: "1 hora", value: "1h" },
  { label: "4 horas", value: "4h" },
  { label: "1 dia", value: "1d" },
];

interface SelectedDetail {
  source: "score" | "rsi";
  sourceLabel: string;
  tokenId: string;
  symbol: string;
  result: BacktestResult;
  baseline: BacktestResult;
  isDemo: boolean;
  timeframe: BacktestTimeframe;
}

/**
 * What the run is testing: the score at its stricter or looser band, or
 * plain RSI as the simplest possible baseline.
 */
type Strategy = "strongOnly" | "any" | "rsi";

const STRATEGY_OPTIONS: { label: string; value: Strategy }[] = [
  { label: "Score — Só Compra Forte/Venda Forte (≥80 / ≤20)", value: "strongOnly" },
  { label: "Score — Compra/Venda (≥60 / ≤40)", value: "any" },
  { label: "RSI puro", value: "rsi" },
];

const RSI_PERIOD_OPTIONS = [7, 14, 21];

interface EdgeVerdict {
  /** Tokens where the strategy beat its own coin-flip control group. */
  beatBaseline: number;
  total: number;
  strategyAvgReturnPct: number;
  baselineAvgReturnPct: number;
  /** Tokens whose average trade is profitable after costs. */
  positiveExpectancy: number;
}

/** The honest scoreboard: does the signal actually beat random entries
 * with the same risk management? If not, the risk management is doing the
 * work and the indicators are decoration. */
function computeEdgeVerdict(summaries: { result: BacktestResult; baseline: BacktestResult }[]): EdgeVerdict | null {
  const scored = summaries.filter((s) => s.result.trades.length > 0);
  if (scored.length === 0) return null;
  return {
    beatBaseline: scored.filter((s) => s.result.strategyReturnPct > s.baseline.strategyReturnPct).length,
    total: scored.length,
    strategyAvgReturnPct: scored.reduce((sum, s) => sum + s.result.strategyReturnPct, 0) / scored.length,
    baselineAvgReturnPct: scored.reduce((sum, s) => sum + s.baseline.strategyReturnPct, 0) / scored.length,
    positiveExpectancy: scored.filter((s) => s.result.expectancyPct > 0).length,
  };
}

function EdgeVerdictBanner({ verdict }: { verdict: EdgeVerdict }) {
  const beatsRandom = verdict.beatBaseline > verdict.total / 2;
  const margin = verdict.strategyAvgReturnPct - verdict.baselineAvgReturnPct;

  return (
    <div
      className={clsx(
        "rounded-lg border p-3",
        beatsRandom
          ? "border-[var(--color-up)]/40 bg-[var(--color-up)]/10"
          : "border-[var(--color-down)]/40 bg-[var(--color-down)]/10",
      )}
    >
      <div className="text-sm font-semibold text-[var(--color-text)]">
        {beatsRandom ? "O sinal superou entradas aleatórias" : "O sinal NÃO superou entradas aleatórias"}
      </div>
      <div className="mt-1 text-xs leading-relaxed text-[var(--color-text-dim)]">
        Venceu em <span className="num-mono font-medium">{verdict.beatBaseline}</span> de{" "}
        <span className="num-mono font-medium">{verdict.total}</span> moedas. Retorno médio da estratégia{" "}
        <span
          className={clsx(
            "num-mono font-medium",
            verdict.strategyAvgReturnPct >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
          )}
        >
          {verdict.strategyAvgReturnPct >= 0 ? "+" : ""}
          {verdict.strategyAvgReturnPct.toFixed(1)}%
        </span>{" "}
        contra{" "}
        <span
          className={clsx(
            "num-mono font-medium",
            verdict.baselineAvgReturnPct >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
          )}
        >
          {verdict.baselineAvgReturnPct >= 0 ? "+" : ""}
          {verdict.baselineAvgReturnPct.toFixed(1)}%
        </span>{" "}
        do acaso ({margin >= 0 ? "+" : ""}
        {margin.toFixed(1)} p.p. de diferença).{" "}
        <span className="num-mono font-medium">{verdict.positiveExpectancy}</span> de{" "}
        <span className="num-mono font-medium">{verdict.total}</span> têm expectativa positiva por trade.
      </div>
      <div className="mt-2 text-xs leading-relaxed text-[var(--color-text-dim)]">
        {beatsRandom
          ? "Indício de edge — mas confirme com mais trades e em outra janela antes de confiar. Amostras pequenas produzem vencedores por sorte."
          : "Sem edge demonstrado: nesse período, jogar moeda com a mesma gestão de risco daria resultado igual ou melhor. Qualquer lucro veio do stop/alvo, não dos indicadores."}
      </div>
    </div>
  );
}

interface PortfolioTotal {
  investedPerToken: number;
  totalInvested: number;
  totalFinal: number;
  totalReturnPct: number;
  tokenCount: number;
}

/** Equal-weight blend of every token in a comparison table: pretend
 * $100 went into each one at the same time, and add up where they all
 * landed — a single number for "how did the whole watchlist do," not
 * just the best or worst row. */
function computePortfolioTotal(summaries: { result: BacktestResult }[]): PortfolioTotal | null {
  if (summaries.length === 0) return null;
  const investedPerToken = 100;
  const totalInvested = investedPerToken * summaries.length;
  const totalFinal = summaries.reduce((sum, s) => sum + (investedPerToken + s.result.strategyReturnPct), 0);
  return {
    investedPerToken,
    totalInvested,
    totalFinal,
    totalReturnPct: ((totalFinal - totalInvested) / totalInvested) * 100,
    tokenCount: summaries.length,
  };
}

function PortfolioTotalBanner({ total, currency }: { total: PortfolioTotal; currency: Currency }) {
  return (
    <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="text-xs text-[var(--color-text-dim)]">
        P&L total da carteira unificada — {total.tokenCount} moeda{total.tokenCount > 1 ? "s" : ""},{" "}
        {formatPrice(total.investedPerToken, currency)} em cada
      </div>
      <div
        className={clsx(
          "num-mono mt-1 flex flex-wrap items-baseline gap-2 text-lg font-semibold",
          total.totalReturnPct >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
        )}
      >
        <span>
          {formatPrice(total.totalInvested, currency)} → {formatPrice(total.totalFinal, currency)}
        </span>
        <span className="text-sm">
          ({total.totalReturnPct >= 0 ? "+" : ""}
          {total.totalReturnPct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

function ComparisonTable<
  T extends { tokenId: string; symbol: string; result: BacktestResult; baseline: BacktestResult; isDemo: boolean },
>({
  summaries,
  selectedTokenId,
  currency,
  onSelect,
}: {
  summaries: T[];
  selectedTokenId: string | null;
  currency: Currency;
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
            <th className="py-1.5 pr-3 font-medium">Acaso (controle)</th>
            <th className="py-1.5 pr-3 font-medium">Simulação (base {formatPrice(100, currency)})</th>
            <th className="py-1.5 pr-3 font-medium">Buy & Hold (ref.)</th>
            <th className="py-1.5 pr-3 font-medium">Trades</th>
            <th className="py-1.5 pr-3 font-medium">Acerto / mín.</th>
            <th className="py-1.5 pr-3 font-medium">Exp./trade</th>
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
              {/* The control group sits right next to the strategy on
                  purpose: beating it is the actual bar, and a green
                  strategy number next to a greener random number should
                  look like the disappointment it is. */}
              <td
                className={clsx(
                  "num-mono py-1.5 pr-3",
                  s.result.strategyReturnPct > s.baseline.strategyReturnPct
                    ? "text-[var(--color-text-dim)]"
                    : "font-medium text-[var(--color-down)]",
                )}
              >
                {s.baseline.strategyReturnPct >= 0 ? "+" : ""}
                {s.baseline.strategyReturnPct.toFixed(1)}%
              </td>
              <td className="num-mono py-1.5 pr-3 text-[var(--color-text-dim)]">
                {formatPrice(100, currency)} → {formatPrice(100 + s.result.strategyReturnPct, currency)}
              </td>
              <td className="num-mono py-1.5 pr-3 text-[var(--color-text-dim)]">
                {s.result.buyHoldReturnPct >= 0 ? "+" : ""}
                {s.result.buyHoldReturnPct.toFixed(1)}%
              </td>
              <td className="num-mono py-1.5 pr-3 text-[var(--color-text-dim)]">{s.result.trades.length}</td>
              <td className="num-mono py-1.5 pr-3 text-[var(--color-text-dim)]">
                {s.result.trades.length > 0 ? (
                  <span
                    className={
                      s.result.winRate >= s.result.breakevenWinRate
                        ? "text-[var(--color-up)]"
                        : "text-[var(--color-down)]"
                    }
                  >
                    {s.result.winRate.toFixed(0)}%
                  </span>
                ) : (
                  "-"
                )}
                {s.result.trades.length > 0 && ` / ${s.result.breakevenWinRate.toFixed(0)}%`}
              </td>
              <td
                className={clsx(
                  "num-mono py-1.5 pr-3 font-medium",
                  s.result.expectancyPct >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
                )}
              >
                {s.result.trades.length > 0
                  ? `${s.result.expectancyPct >= 0 ? "+" : ""}${s.result.expectancyPct.toFixed(2)}%`
                  : "-"}
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
  const [strategy, setStrategy] = useState<Strategy>("any");
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [timeframe, setTimeframe] = useState<BacktestTimeframe>("1d");
  const windowOptions = BACKTEST_WINDOW_OPTIONS[timeframe];
  // Index into windowOptions, kept as a string since that's what <select>
  // values are — defaults to "Máximo disponível" (last option).
  const [windowIndex, setWindowIndex] = useState(String(windowOptions.length - 1));
  const windowDays = windowOptions[Number(windowIndex)]?.days;

  function handleTimeframeChange(next: BacktestTimeframe) {
    setTimeframe(next);
    // Each timeframe has its own window option list (finer candles have a
    // much shorter real data ceiling) — reset to that list's own "Máximo
    // disponível" instead of keeping an index that may not even exist there.
    setWindowIndex(String(BACKTEST_WINDOW_OPTIONS[next].length - 1));
  }

  const scoreBatch = useBacktestAll();
  const rsiBatch = useRsiBacktestAll();
  const [selected, setSelected] = useState<SelectedDetail | null>(null);
  // What was actually run last (may lag behind the `strategy`/`timeframe`
  // selects if the user changes them without clicking "Rodar" again) —
  // drives which batch's results the comparison table/detail section below
  // show.
  const [lastRun, setLastRun] = useState<{ source: "score" | "rsi"; label: string; timeframe: BacktestTimeframe } | null>(
    null,
  );

  const running = strategy === "rsi" ? rsiBatch.running : scoreBatch.running;
  const activeBatch = lastRun?.source === "rsi" ? rsiBatch : scoreBatch;

  function handleRun() {
    if (tokens.length === 0) return;
    setSelected(null);
    if (strategy === "rsi") {
      rsiBatch.runAll(tokens, rsiPeriod, apiKey, windowDays, timeframe);
      setLastRun({ source: "rsi", label: `RSI(${rsiPeriod})`, timeframe });
    } else {
      const strategyLabel = STRATEGY_OPTIONS.find((opt) => opt.value === strategy)?.label ?? "Score";
      scoreBatch.runAll(tokens, apiKey, strategy as BacktestMode, windowDays, timeframe);
      setLastRun({ source: "score", label: strategyLabel, timeframe });
    }
  }

  function handleSelect(s: BacktestSummary | RsiBacktestSummary) {
    if (!lastRun) return;
    setSelected({
      source: lastRun.source,
      sourceLabel: lastRun.label,
      tokenId: s.tokenId,
      symbol: s.symbol,
      result: s.result,
      baseline: s.baseline,
      isDemo: s.isDemo,
      timeframe: lastRun.timeframe,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Backtest">
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-dim)]">
          Simula uma regra de swing/day trade pra toda a sua watchlist de uma vez, operando
          comprado (long) E vendido (short): abre ou vira comprado na primeira vela em que o
          sinal escolhido abaixo aponta compra, abre ou vira vendido na primeira em que aponta
          venda — ou seja, também pode lucrar com o mercado caindo, não só subindo. Escolha o
          sinal: as duas primeiras opções usam o mesmo score que a aba Mercado exibe (técnico +
          sentimento, com o grupo on-chain fora por falta de histórico gratuito), em faixas
          mais ou menos exigentes; RSI puro usa só o RSI (≤30 compra, ≥70 vende) como linha de
          base mais simples. Escolha também o timeframe: 1h/4h pra
          horizontes mais curtos (poucos dias), 1d pro swing trade clássico (dias a semanas) —
          quanto menor a vela, menos histórico real dá pra buscar (a Binance limita a 1000
          velas por consulta: ~41 dias em 1h, ~166 dias em 4h, ~2,7 anos em 1d), e o stop/alvo
          são recalibrados pra cada um. Cada entrada já sai com stop-loss e take-profit
          calculados a partir do suporte/resistência recente (mínima/máxima das últimas 20
          velas), e o tamanho da posição sai da distância até o stop de forma que cada trade
          arrisque {DEFAULT_RISK_PER_TRADE_PCT}% do capital — stop apertado gera posição maior,
          stop largo gera posição menor, e a perda é a mesma nos dois casos. É a mesma regra de
          1-2% que a aba de gestão de risco recomenda, então o backtest simula a disciplina que
          o app prega, não uma mais agressiva. Todo trade paga{" "}
          {ROUND_TRIP_COST_PCT.toFixed(2)}% de custo de ida e volta (taxa + slippage), então
          resultados de alta frequência não aparecem inflados aqui. Usa só um timeframe por vez
          — não a confluência completa de 5 timeframes do app. Buy & hold aparece como
          referência de contexto, mas a barra que importa é o "Acaso": se o sinal não vence
          entradas aleatórias com a mesma gestão de risco, ele não demonstrou edge nenhum.
          Trate como um teste de direção do sinal, não uma réplica exata do score ao vivo, e
          lembre que desempenho passado não garante resultado futuro.
        </p>

        {tokens.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            Adicione moedas à watchlist na aba Mercado para poder rodar um backtest.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as Strategy)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {STRATEGY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {strategy === "rsi" && (
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
              )}
              <select
                value={timeframe}
                onChange={(e) => handleTimeframeChange(e.target.value as BacktestTimeframe)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {TIMEFRAME_OPTIONS.map((opt) => (
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
                {windowOptions.map((opt, i) => (
                  <option key={opt.label} value={i}>
                    Janela: {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleRun}
                disabled={running}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {running ? <Spinner /> : <ListChecks size={14} />}
                Rodar para toda a watchlist ({tokens.length})
              </button>
            </div>
            {running && (
              <p className="text-xs text-[var(--color-text-dim)]">
                Rodando{" "}
                {strategy === "rsi" ? rsiBatch.progress.done : scoreBatch.progress.done} de{" "}
                {strategy === "rsi" ? rsiBatch.progress.total : scoreBatch.progress.total}...
              </p>
            )}
          </div>
        )}
      </Card>

      {lastRun && activeBatch.summaries.length > 0 && (
        <Card title={`Comparação da watchlist — ${lastRun.label}`}>
          <p className="mb-2 text-xs leading-relaxed text-[var(--color-text-dim)]">
            Ordenado pelo retorno absoluto da estratégia — clique numa linha pra ver os trades em
            detalhe abaixo. "Acaso" é o grupo de controle: entradas por cara-ou-coroa nas mesmas
            velas, com stop, alvo, alocação e custos idênticos — bater isso é a barra real, e
            fica vermelho quando a estratégia perde pro acaso. "Acerto / mín." compara a taxa de
            acerto com a mínima necessária pra empatar dado o tamanho médio dos ganhos e perdas.
            "Exp./trade" é o resultado médio por operação já com custos: se for negativa, cada
            trade a mais destrói capital, por melhor que o acerto pareça.
          </p>
          {(() => {
            const verdict = computeEdgeVerdict(activeBatch.summaries);
            return verdict ? (
              <div className="mb-3">
                <EdgeVerdictBanner verdict={verdict} />
              </div>
            ) : null;
          })()}
          {(() => {
            const total = computePortfolioTotal(activeBatch.summaries);
            return total ? <PortfolioTotalBanner total={total} currency={currency} /> : null;
          })()}
          <ComparisonTable
            summaries={activeBatch.summaries}
            selectedTokenId={selected?.source === lastRun.source ? selected.tokenId : null}
            currency={currency}
            onSelect={handleSelect}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              label="Retorno da estratégia"
              value={`${selected.result.strategyReturnPct >= 0 ? "+" : ""}${selected.result.strategyReturnPct.toFixed(1)}%`}
              tone={selected.result.strategyReturnPct >= 0 ? "up" : "down"}
            />
            <StatTile
              label="Simulação (base 100)"
              value={`${formatPrice(100, currency)} → ${formatPrice(100 + selected.result.strategyReturnPct, currency)}`}
              tone={selected.result.strategyReturnPct >= 0 ? "up" : "down"}
            />
            <StatTile
              label="Buy & Hold (referência)"
              value={`${selected.result.buyHoldReturnPct >= 0 ? "+" : ""}${selected.result.buyHoldReturnPct.toFixed(1)}%`}
              tone={selected.result.buyHoldReturnPct >= 0 ? "up" : "down"}
            />
            <StatTile label="Nº de trades" value={String(selected.result.trades.length)} />
            <StatTile
              label={`Acerto (mín. ${selected.result.breakevenWinRate.toFixed(0)}%)`}
              value={`${selected.result.winRate.toFixed(0)}%`}
              tone={selected.result.winRate >= selected.result.breakevenWinRate ? "up" : "down"}
            />
            <StatTile
              label="Maior drawdown"
              value={`-${selected.result.maxDrawdownPct.toFixed(1)}%`}
              tone="down"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Expectativa por trade"
              value={`${selected.result.expectancyPct >= 0 ? "+" : ""}${selected.result.expectancyPct.toFixed(2)}%`}
              tone={selected.result.expectancyPct >= 0 ? "up" : "down"}
            />
            <StatTile
              label="Custo total pago"
              value={`-${selected.result.totalCostPct.toFixed(2)}%`}
              tone="down"
            />
            <StatTile
              label="Acaso, mesmo risco (controle)"
              value={`${selected.baseline.strategyReturnPct >= 0 ? "+" : ""}${selected.baseline.strategyReturnPct.toFixed(1)}%`}
              tone={selected.result.strategyReturnPct > selected.baseline.strategyReturnPct ? "neutral" : "down"}
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
                      selected.timeframe === "1d"
                        ? new Date(Number(v) * 1000).toLocaleDateString("pt-BR", { month: "short", day: "2-digit" })
                        : new Date(Number(v) * 1000).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
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
                    labelFormatter={(v) => formatCandleTime(Number(v), selected.timeframe)}
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
                <p className="mb-2 text-xs text-[var(--color-text-dim)]">
                  "Saldo" simula {formatPrice(100, currency)} investidos no início, acumulando
                  o resultado de cada trade em sequência — assim dá pra ver a evolução real do
                  capital, não só a % de cada operação isolada. "Motivo" mostra se o trade
                  fechou no stop-loss, no take-profit (ambos calculados pelo suporte/resistência
                  recente), por um sinal contrário, ou porque o período simulado acabou.
                </p>
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--color-text-dim)]">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Direção</th>
                      <th className="py-1.5 pr-3 font-medium">Entrada</th>
                      <th className="py-1.5 pr-3 font-medium">Saída</th>
                      <th className="py-1.5 pr-3 font-medium">Preço entrada</th>
                      <th className="py-1.5 pr-3 font-medium">Preço saída</th>
                      <th className="py-1.5 pr-3 font-medium">Motivo</th>
                      <th className="py-1.5 pr-3 font-medium">Retorno</th>
                      <th className="py-1.5 pr-3 font-medium">Saldo (base {formatPrice(100, currency)})</th>
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
                        <td className="py-1.5 pr-3">{formatCandleTime(t.entryTime, selected.timeframe)}</td>
                        <td className="py-1.5 pr-3">{formatCandleTime(t.exitTime, selected.timeframe)}</td>
                        <td className="num-mono py-1.5 pr-3">{formatPrice(t.entryPrice, currency)}</td>
                        <td className="num-mono py-1.5 pr-3">{formatPrice(t.exitPrice, currency)}</td>
                        <td className="py-1.5 pr-3 text-[var(--color-text-dim)]">
                          {EXIT_REASON_LABEL[t.exitReason]}
                        </td>
                        <td
                          className={clsx(
                            "num-mono py-1.5 pr-3 font-medium",
                            t.returnPct >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
                          )}
                        >
                          {t.returnPct >= 0 ? "+" : ""}
                          {t.returnPct.toFixed(2)}%
                        </td>
                        <td
                          className={clsx(
                            "num-mono py-1.5 pr-3 font-medium",
                            t.equityAfter >= 100 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
                          )}
                        >
                          {formatPrice(t.equityAfter, currency)}
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
