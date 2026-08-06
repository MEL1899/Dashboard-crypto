import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Star } from "lucide-react";
import type { MarketToken } from "../types";
import type { Currency } from "../lib/currency";
import type { TokenSignals } from "../hooks/useWatchlistSignals";
import type { ScoreHistory } from "../lib/scoreHistory";
import { computeSignalScore } from "../lib/score/signalScore";
import { evaluateConfluence } from "../lib/score/confluence";
import { Badge, Card, ScoreBadge, ScoreSparkline, formatMoney, formatPrice } from "./common";

type SortKey = "price" | "change24h" | "marketCap" | "volume24h";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Preço" },
  { key: "change24h", label: "24h" },
  { key: "marketCap", label: "Market Cap" },
  { key: "volume24h", label: "Volume 24h" },
];

const BIG_MOVE_THRESHOLD = 8;

type Tone = "up" | "down" | "neutral";

function rsiTone(value: number): Tone {
  if (value < 30) return "up";
  if (value > 70) return "down";
  return "neutral";
}

const PILL_STYLES: Record<Tone, string> = {
  up: "border-[var(--color-up)] bg-[var(--color-up)]/15 text-[var(--color-up)]",
  down: "border-[var(--color-down)] bg-[var(--color-down)]/15 text-[var(--color-down)]",
  neutral: "border-[var(--color-border)] bg-white/5 text-[var(--color-text-dim)]",
};

function RsiPill({ value }: { value: number }) {
  return (
    <span
      className={clsx(
        "num-mono inline-flex min-w-9 items-center justify-center rounded-full border px-1.5 py-0.5 text-xs font-medium",
        PILL_STYLES[rsiTone(value)],
      )}
    >
      {value}
    </span>
  );
}

function PortfolioStar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={active ? "Remover do portfólio" : "Marcar como parte do portfólio"}
      aria-pressed={active}
      className={clsx(
        "mr-1.5 inline-flex shrink-0 items-center justify-center",
        active
          ? "text-[var(--color-accent)]"
          : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
      )}
    >
      <Star size={13} fill={active ? "currentColor" : "none"} />
    </button>
  );
}

const NEUTRAL_TIMEFRAME_SIGNAL = {
  rsi: 50,
  macd: "neutral",
  bbPosition: "inside",
  volumeSpike: false,
  trend: "neutral",
  relativeStrength: "inline",
} as const;
const FALLBACK_SIGNALS: TokenSignals = {
  byTimeframe: {
    "1h": NEUTRAL_TIMEFRAME_SIGNAL,
    "4h": NEUTRAL_TIMEFRAME_SIGNAL,
    "1d": NEUTRAL_TIMEFRAME_SIGNAL,
    "1w": NEUTRAL_TIMEFRAME_SIGNAL,
    "1M": NEUTRAL_TIMEFRAME_SIGNAL,
  },
  // Built by the real functions on empty input rather than hand-written, so
  // this placeholder can't drift out of shape as the result type grows.
  score: computeSignalScore({}),
  confluence: evaluateConfluence([]),
  isDemo: true,
};

interface WatchlistTableProps {
  tokens: MarketToken[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currency: Currency;
  signalsByToken: Record<string, TokenSignals>;
  scoreHistoryByToken: ScoreHistory;
  portfolioIds: Set<string>;
  onTogglePortfolio: (id: string) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}

/** Renders the desktop table + mobile card list for one group of tokens
 * (either the portfolio section or the rest of the watchlist) — extracted
 * so both groups share the exact same columns/layout instead of duplicating
 * the markup. */
function WatchlistTable({
  tokens,
  selectedId,
  onSelect,
  currency,
  signalsByToken,
  scoreHistoryByToken,
  portfolioIds,
  onTogglePortfolio,
  sortKey,
  sortDir,
  onSort,
}: WatchlistTableProps) {
  return (
    <>
      {/* Desktop/tablet: full table. Mobile: stacked cards (below). */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="text-[var(--color-text-dim)]">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Ativo</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="py-1.5 pr-2 font-medium">
                  <button
                    onClick={() => onSort(col.key)}
                    className="flex items-center gap-1 hover:text-[var(--color-text)]"
                  >
                    {col.label}
                    {sortKey === col.key &&
                      (sortDir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                  </button>
                </th>
              ))}
              <th className="py-1.5 pr-2 text-center font-medium">RSI 1H</th>
              <th className="py-1.5 pr-2 text-center font-medium">RSI 4H</th>
              <th className="py-1.5 pr-2 text-center font-medium">RSI 1D</th>
              <th className="py-1.5 pr-2 text-center font-medium">RSI 1S</th>
              <th className="py-1.5 pr-2 text-center font-medium">RSI 1M</th>
              <th className="py-1.5 pr-2 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              const isBigMove = Math.abs(token.change24h) >= BIG_MOVE_THRESHOLD;
              const signals = signalsByToken[token.id] ?? FALLBACK_SIGNALS;
              const rsi = {
                "1h": signals.byTimeframe["1h"].rsi,
                "4h": signals.byTimeframe["4h"].rsi,
                "1d": signals.byTimeframe["1d"].rsi,
                "1w": signals.byTimeframe["1w"].rsi,
                "1M": signals.byTimeframe["1M"].rsi,
              };
              return (
                <tr
                  key={token.id}
                  onClick={() => onSelect(token.id)}
                  className={clsx(
                    "cursor-pointer border-t border-[var(--color-border)] transition-colors hover:bg-white/5",
                    token.id === selectedId && "bg-[var(--color-accent)]/10",
                  )}
                >
                  <td className="py-1.5 pr-2 font-medium text-[var(--color-text)]">
                    <span className="flex items-center">
                      <PortfolioStar
                        active={portfolioIds.has(token.id)}
                        onToggle={() => onTogglePortfolio(token.id)}
                      />
                      {token.symbol}
                      <span className="ml-1.5 text-[var(--color-text-dim)]">{token.name}</span>
                    </span>
                  </td>
                  <td className="num-mono py-1.5 pr-2">{formatPrice(token.price, currency)}</td>
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={clsx(
                          "num-mono",
                          token.change24h >= 0
                            ? "text-[var(--color-up)]"
                            : "text-[var(--color-down)]",
                        )}
                      >
                        {token.change24h >= 0 ? "▲" : "▼"} {Math.abs(token.change24h).toFixed(2)}%
                      </span>
                      {isBigMove && (
                        <Badge tone={token.change24h >= 0 ? "up" : "down"}>forte</Badge>
                      )}
                    </span>
                  </td>
                  <td className="num-mono py-1.5 pr-2 text-[var(--color-text-dim)]">
                    {formatMoney(token.marketCap, currency)}
                  </td>
                  <td className="num-mono py-1.5 pr-2 text-[var(--color-text-dim)]">
                    {formatMoney(token.volume24h, currency)}
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <RsiPill value={rsi["1h"]} />
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <RsiPill value={rsi["4h"]} />
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <RsiPill value={rsi["1d"]} />
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <RsiPill value={rsi["1w"]} />
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <RsiPill value={rsi["1M"]} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-2">
                      <ScoreBadge level={signals.score.level} score={signals.score.score} />
                      <ScoreSparkline points={scoreHistoryByToken[token.id] ?? []} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per coin instead of a horizontally-scrolling table. */}
      <div className="flex flex-col gap-2 md:hidden">
        {tokens.map((token) => {
          const isBigMove = Math.abs(token.change24h) >= BIG_MOVE_THRESHOLD;
          const signals = signalsByToken[token.id] ?? FALLBACK_SIGNALS;
          const rsi = {
            "1h": signals.byTimeframe["1h"].rsi,
            "4h": signals.byTimeframe["4h"].rsi,
            "1d": signals.byTimeframe["1d"].rsi,
            "1w": signals.byTimeframe["1w"].rsi,
            "1M": signals.byTimeframe["1M"].rsi,
          };
          return (
            // A <div role="button"> instead of a real <button> so the
            // portfolio star below can be its own nested, independently
            // clickable <button> (a <button> can't contain another one).
            <div
              key={token.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(token.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(token.id);
              }}
              className={clsx(
                "flex cursor-pointer flex-col gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                token.id === selectedId
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] hover:bg-white/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center text-sm">
                  <PortfolioStar
                    active={portfolioIds.has(token.id)}
                    onToggle={() => onTogglePortfolio(token.id)}
                  />
                  <span className="font-medium text-[var(--color-text)]">{token.symbol}</span>
                  <span className="ml-1.5 text-xs text-[var(--color-text-dim)]">{token.name}</span>
                </div>
                <span className="flex items-center gap-2">
                  <ScoreBadge level={signals.score.level} score={signals.score.score} />
                  <ScoreSparkline points={scoreHistoryByToken[token.id] ?? []} />
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="num-mono text-base font-semibold text-[var(--color-text)]">
                  {formatPrice(token.price, currency)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={clsx(
                      "num-mono text-xs",
                      token.change24h >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
                    )}
                  >
                    {token.change24h >= 0 ? "▲" : "▼"} {Math.abs(token.change24h).toFixed(2)}%
                  </span>
                  {isBigMove && (
                    <Badge tone={token.change24h >= 0 ? "up" : "down"}>forte</Badge>
                  )}
                </span>
              </div>

              <div className="num-mono flex items-center justify-between text-xs text-[var(--color-text-dim)]">
                <span>MCap {formatMoney(token.marketCap, currency)}</span>
                <span>Vol {formatMoney(token.volume24h, currency)}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)]">
                  1H <RsiPill value={rsi["1h"]} />
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)]">
                  4H <RsiPill value={rsi["4h"]} />
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)]">
                  1D <RsiPill value={rsi["1d"]} />
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)]">
                  1S <RsiPill value={rsi["1w"]} />
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)]">
                  1M <RsiPill value={rsi["1M"]} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

interface MarketWatchlistProps {
  tokens: MarketToken[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currency: Currency;
  /** Real multi-timeframe confluence score + per-timeframe RSI per token
   * (see useWatchlistSignals) — the same score shows here and in the
   * detail panel below, regardless of the chart's active timeframe. */
  signalsByToken: Record<string, TokenSignals>;
  /** Recent score points per token (see useScoreHistory) — drawn as a small
   * sparkline next to the Score badge. */
  scoreHistoryByToken: ScoreHistory;
  /** Subset of `tokens` the user has marked as actually held, not just
   * watched — splits the table into a "Meu Portfólio" group and the rest. */
  portfolioIds: string[];
  onTogglePortfolio: (id: string) => void;
}

export function MarketWatchlist({
  tokens,
  selectedId,
  onSelect,
  currency,
  signalsByToken,
  scoreHistoryByToken,
  portfolioIds,
  onTogglePortfolio,
}: MarketWatchlistProps) {
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const portfolioSet = useMemo(() => new Set(portfolioIds), [portfolioIds]);

  const sorted = useMemo(() => {
    const copy = [...tokens];
    copy.sort((a, b) => (a[sortKey] - b[sortKey]) * (sortDir === "asc" ? 1 : -1));
    return copy;
  }, [tokens, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const bigMovers = tokens.filter((t) => Math.abs(t.change24h) >= BIG_MOVE_THRESHOLD).length;
  const portfolioTokens = sorted.filter((t) => portfolioSet.has(t.id));
  const watchlistTokens = sorted.filter((t) => !portfolioSet.has(t.id));

  const tableProps = {
    selectedId,
    onSelect,
    currency,
    signalsByToken,
    scoreHistoryByToken,
    portfolioIds: portfolioSet,
    onTogglePortfolio,
    sortKey,
    sortDir,
    onSort: handleSort,
  };

  return (
    <Card
      title="Visão geral do mercado"
      action={
        bigMovers > 0 ? (
          <Badge tone="accent">
            {bigMovers} {bigMovers === 1 ? "ativo" : "ativos"} com variação forte
          </Badge>
        ) : undefined
      }
    >
      {portfolioTokens.length > 0 && (
        <div className={watchlistTokens.length > 0 ? "mb-4" : ""}>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
            <Star size={12} className="text-[var(--color-accent)]" fill="currentColor" />
            Meu Portfólio
          </h3>
          <WatchlistTable tokens={portfolioTokens} {...tableProps} />
        </div>
      )}
      {watchlistTokens.length > 0 && (
        <div>
          {portfolioTokens.length > 0 && (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
              Watchlist
            </h3>
          )}
          <WatchlistTable tokens={watchlistTokens} {...tableProps} />
        </div>
      )}
    </Card>
  );
}
