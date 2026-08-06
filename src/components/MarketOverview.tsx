import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, Info } from "lucide-react";
import type { BollingerBands, Candle, MarketToken } from "../types";
import { bbSignal } from "../lib/indicators";
import type { RelativeStrengthSignal, TrendSignal } from "../lib/indicators";
import type { BbPosition, MacdSignal, SignalTimeframe } from "../lib/indicators";
import type { TokenSignals } from "../hooks/useWatchlistSignals";
import type { MarketRegime } from "../lib/score/config";
import type { ReadingAction } from "../lib/score/interpretation";
import type { Currency } from "../lib/currency";
import { Badge, Card, formatMoney, formatPrice, ScoreBadge, ScoreSparkline } from "./common";
import { ScoreMethodologyPanel } from "./ScoreMethodologyPanel";
import type { ScorePoint } from "../lib/scoreHistory";

const TIMEFRAME_LABEL: Record<SignalTimeframe, string> = {
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1S",
  "1M": "1M",
};
const TIMEFRAME_ORDER: SignalTimeframe[] = ["1h", "4h", "1d", "1w", "1M"];

type Tone = "up" | "down" | "neutral";

/** Colour of the headline reading. "caution" is deliberately the same red
 * as a sell: a buy the trend contradicts is a warning, not a soft buy. */
const READING_TONE: Record<ReadingAction, string> = {
  buy: "text-[var(--color-up)]",
  sell: "text-[var(--color-down)]",
  caution: "text-[var(--color-down)]",
  wait: "text-[var(--color-text)]",
};

const REGIME_BADGE: Record<MarketRegime, string> = {
  uptrend: "Tendência de alta",
  downtrend: "Tendência de baixa",
  range: "Mercado lateral",
  unknown: "Regime não classificado",
};

const MACD_LABEL: Record<MacdSignal, string> = { bullish: "Alta", bearish: "Baixa", neutral: "Neutro" };
const BB_LABEL: Record<BbPosition, string> = {
  "above-upper": "Acima",
  "below-lower": "Abaixo",
  inside: "Dentro",
};
const TREND_LABEL: Record<TrendSignal, string> = { up: "Alta", down: "Baixa", neutral: "Sem tendência" };
const RS_LABEL: Record<RelativeStrengthSignal, string> = {
  outperforming: "Acima do BTC",
  underperforming: "Abaixo do BTC",
  inline: "Em linha",
};

function toneForRsi(value: number): Tone {
  if (value <= 30) return "up";
  if (value >= 70) return "down";
  return "neutral";
}
function toneForMacd(signal: MacdSignal): Tone {
  return signal === "bullish" ? "up" : signal === "bearish" ? "down" : "neutral";
}
function toneForBb(position: BbPosition): Tone {
  return position === "below-lower" ? "up" : position === "above-upper" ? "down" : "neutral";
}
function toneForTrend(trend: TrendSignal): Tone {
  return trend === "up" ? "up" : trend === "down" ? "down" : "neutral";
}
function toneForRs(rs: RelativeStrengthSignal): Tone {
  return rs === "outperforming" ? "up" : rs === "underperforming" ? "down" : "neutral";
}

function ToneText({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "num-mono font-medium",
        tone === "up" && "text-[var(--color-up)]",
        tone === "down" && "text-[var(--color-down)]",
        tone === "neutral" && "text-[var(--color-text-dim)]",
      )}
    >
      {children}
    </span>
  );
}

interface IndicatorRow {
  label: string;
  hint: string;
  render: (signal: TokenSignals["byTimeframe"][SignalTimeframe]) => ReactNode;
}

const INDICATOR_ROWS: IndicatorRow[] = [
  {
    label: "RSI",
    hint: "força e velocidade do movimento",
    render: (s) => <ToneText tone={toneForRsi(s.rsi)}>{s.rsi}</ToneText>,
  },
  {
    label: "MACD",
    hint: "direção do momentum",
    render: (s) => <ToneText tone={toneForMacd(s.macd)}>{MACD_LABEL[s.macd]}</ToneText>,
  },
  {
    label: "Bollinger",
    hint: "posição vs. suporte/resistência",
    render: (s) => <ToneText tone={toneForBb(s.bbPosition)}>{BB_LABEL[s.bbPosition]}</ToneText>,
  },
  {
    label: "Volume",
    hint: "confirma (ou não) o movimento",
    render: (s) => <ToneText tone={s.volumeSpike ? "up" : "neutral"}>{s.volumeSpike ? "Alto" : "Normal"}</ToneText>,
  },
  {
    label: "Tendência",
    hint: "contexto vs. médias móveis (SMA 20/50)",
    render: (s) => <ToneText tone={toneForTrend(s.trend)}>{TREND_LABEL[s.trend]}</ToneText>,
  },
  {
    label: "Força relativa",
    hint: "desempenho comparado ao BTC",
    render: (s) => <ToneText tone={toneForRs(s.relativeStrength)}>{RS_LABEL[s.relativeStrength]}</ToneText>,
  },
];

interface MarketOverviewProps {
  token: MarketToken | undefined;
  candles: Candle[];
  bollinger: BollingerBands[];
  currency: Currency;
  /** Multi-timeframe confluence score + per-timeframe RSI for this token
   * (see useWatchlistSignals) — the same number shown in the watchlist
   * table, independent of the chart's active timeframe below. */
  signals?: TokenSignals;
  /** Recent score points for this token (see useScoreHistory), drawn next
   * to the score number. */
  scoreHistory?: ScorePoint[];
}

export function MarketOverview({
  token,
  candles,
  bollinger,
  currency,
  signals,
  scoreHistory,
}: MarketOverviewProps) {
  const [showExplainer, setShowExplainer] = useState(false);
  const lastCandle = candles[candles.length - 1];
  const lastBb = bollinger[bollinger.length - 1];

  const bbTone =
    lastCandle && lastBb
      ? bbSignal(lastCandle.close, lastBb) === "above-upper"
        ? "down"
        : bbSignal(lastCandle.close, lastBb) === "below-lower"
          ? "up"
          : "neutral"
      : "neutral";

  return (
    <div className="flex flex-col gap-3">
      <Card
        title={token ? `Score de Oportunidade — ${token.symbol}` : "Score de Oportunidade"}
        action={
          <button
            onClick={() => setShowExplainer((v) => !v)}
            aria-expanded={showExplainer}
            className="flex items-center gap-1 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            <Info size={13} />
            Como funciona?
          </button>
        }
      >
        <div className="flex items-center gap-2">
          <div className="num-mono text-3xl font-semibold text-[var(--color-text)]">
            {token && signals ? Math.round(signals.score.score) : "-"}
          </div>
          {token && signals && <ScoreBadge level={signals.score.level} />}
          {/* Confluence rides alongside the badge, never inside the number —
              see lib/score/confluence.ts for why it stays a label. */}
          {token && signals && signals.confluence.level !== "insufficient" && (
            <span
              className={clsx(
                "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                signals.confluence.level === "high"
                  ? "bg-[var(--color-up)]/15 text-[var(--color-up)]"
                  : "bg-white/5 text-[var(--color-text-dim)]",
              )}
            >
              {signals.confluence.label}
            </span>
          )}
          {token && signals && <ScoreSparkline points={scoreHistory ?? []} width={64} height={20} />}
        </div>
        {token && signals && (
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            {signals.score.breakdown.join(" · ")}
            {signals.score.coverage < 1 && (
              <span className="ml-1 opacity-70">
                · cobertura {(signals.score.coverage * 100).toFixed(0)}%
              </span>
            )}
          </p>
        )}

        {/* The reading: score + regime turned into one call. Separate from
            the number on purpose — see lib/score/interpretation.ts. */}
        {token && signals && (
          <div
            className={clsx(
              "mt-3 rounded-lg border p-3",
              signals.reading.regimeConflict
                ? "border-[var(--color-down)]/40 bg-[var(--color-down)]/10"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)]",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              {signals.reading.regimeConflict && (
                <AlertTriangle size={14} className="shrink-0 text-[var(--color-down)]" />
              )}
              <span
                className={clsx(
                  "text-sm font-semibold",
                  READING_TONE[signals.reading.action],
                )}
              >
                {signals.reading.label}
              </span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--color-text-dim)]">
                {REGIME_BADGE[signals.regime.regime]}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-dim)]">
              {signals.reading.detail}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)] opacity-80">
              {signals.regime.reason} Descreve o estado atual do mercado — não é previsão de que
              ele vai lateralizar.
            </p>
          </div>
        )}

        {token && signals && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--color-text-dim)]">
                  <th className="py-1 pr-2 text-left font-medium">Indicador</th>
                  {TIMEFRAME_ORDER.map((t) => (
                    <th key={t} className="px-2 py-1 text-center font-medium">
                      {TIMEFRAME_LABEL[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INDICATOR_ROWS.map((row) => (
                  <tr key={row.label} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 pr-2 text-[var(--color-text-dim)]">
                      {row.label}
                      <span className="ml-1 text-[10px] opacity-70">({row.hint})</span>
                    </td>
                    {TIMEFRAME_ORDER.map((t) => (
                      <td key={t} className="px-2 py-1.5 text-center">
                        {row.render(signals.byTimeframe[t])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {signals.isDemo && (
              <p className="mt-1 text-[10px] text-[var(--color-text-dim)]">
                Alguns valores acima são estimados — não foi possível buscar o dado real para
                todos os timeframes.
              </p>
            )}
          </div>
        )}

        {showExplainer && (
          <div className="mt-3">
            {/* Generated from the score's own config rather than written by
                hand: the previous prose here described the older inline
                formula and silently went stale the moment the layered score
                took over this card. */}
            <ScoreMethodologyPanel result={signals?.score} />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card title="Preço">
          <div className="num-mono text-2xl font-semibold text-[var(--color-text)]">
            {token ? formatPrice(token.price, currency) : "-"}
          </div>
          {token && (
            <Badge tone={token.change24h >= 0 ? "up" : "down"}>
              {token.change24h >= 0 ? "▲" : "▼"} {Math.abs(token.change24h).toFixed(2)}% 24h
            </Badge>
          )}
        </Card>

        <Card title="Market Cap">
          <div className="num-mono text-2xl font-semibold text-[var(--color-text)]">
            {token ? formatMoney(token.marketCap, currency) : "-"}
          </div>
          <span className="text-xs text-[var(--color-text-dim)]">
            Vol 24h: {token ? formatMoney(token.volume24h, currency) : "-"}
          </span>
        </Card>

        <Card title="Bollinger Bands" className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] text-[var(--color-text-dim)]">Superior</div>
              <div className="num-mono text-lg font-semibold text-[var(--color-down)]">
                {lastBb ? formatPrice(lastBb.upper, currency) : "-"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--color-text-dim)]">Inferior</div>
              <div className="num-mono text-lg font-semibold text-[var(--color-up)]">
                {lastBb ? formatPrice(lastBb.lower, currency) : "-"}
              </div>
            </div>
          </div>
          {lastBb && lastCandle && (
            <div className="mt-1.5">
              <Badge tone={bbTone}>
                {bbSignal(lastCandle.close, lastBb) === "above-upper"
                  ? "Acima da banda superior"
                  : bbSignal(lastCandle.close, lastBb) === "below-lower"
                    ? "Abaixo da banda inferior"
                    : "Dentro das bandas"}
              </Badge>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
