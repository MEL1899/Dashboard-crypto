import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { MarketToken } from "../types";
import type { Currency } from "../lib/currency";
import { mockRsiByTimeframe } from "../lib/mock";
import type { TokenRsiByTimeframe } from "../hooks/useWatchlistRsi";
import type { OpportunityScoreResult } from "../lib/opportunityScore";
import { Badge, Card, ScoreBadge, type ScoreLevel, formatMoney } from "./common";

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

/**
 * Aggregates the 3 timeframe RSIs (real, via useWatchlistRsi — mock only as
 * a per-timeframe fallback if that fetch failed) into one technical read.
 * This is the table's own lightweight RSI-only classifier — the detail
 * panel's score (lib/opportunityScore.ts) is the fuller one, combining RSI +
 * MACD + Bollinger position for whichever token's chart is open. The table
 * doesn't have MACD/Bollinger per row, so it stays RSI-only.
 */
function classifySignal(rsi: { "1h": number; "4h": number; "1d": number }): ScoreLevel {
  const avg = (rsi["1h"] + rsi["4h"] + rsi["1d"]) / 3;
  if (avg <= 30) return "strongBuy";
  if (avg <= 45) return "buy";
  if (avg < 55) return "neutral";
  if (avg <= 70) return "sell";
  return "strongSell";
}

/**
 * A displayable 0-100 number alongside the badge above, same buy/high
 * direction as lib/opportunityScore.ts (higher = more bullish), just
 * derived from the RSI average instead of RSI+MACD+Bollinger. Its bucket
 * boundaries are picked to agree with classifySignal so the number and the
 * badge next to it never contradict each other.
 */
function rowScore(rsi: { "1h": number; "4h": number; "1d": number }): number {
  const avg = (rsi["1h"] + rsi["4h"] + rsi["1d"]) / 3;
  return Math.round(100 - avg);
}

interface MarketWatchlistProps {
  tokens: MarketToken[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currency: Currency;
  /** Real per-timeframe RSI per token, keyed by token id (see useWatchlistRsi).
   * A token missing here just means its fetch hasn't resolved yet — the
   * deterministic mock covers that gap until it does. */
  rsiByToken: Record<string, TokenRsiByTimeframe>;
  /** Real score (RSI+MACD+Bollinger) for whichever token's chart is open —
   * overrides that one row's score so it agrees with the detail panel
   * below instead of showing a second, independently-derived number. */
  selectedScore?: OpportunityScoreResult;
}

export function MarketWatchlist({
  tokens,
  selectedId,
  onSelect,
  currency,
  rsiByToken,
  selectedScore,
}: MarketWatchlistProps) {
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
      {/* Desktop/tablet: full table. Mobile: stacked cards (below). */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="text-[var(--color-text-dim)]">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Ativo</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="py-1.5 pr-2 font-medium">
                  <button
                    onClick={() => handleSort(col.key)}
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
              <th className="py-1.5 pr-2 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((token) => {
              const isBigMove = Math.abs(token.change24h) >= BIG_MOVE_THRESHOLD;
              const rsi = rsiByToken[token.id] ?? mockRsiByTimeframe(token.id);
              const real = token.id === selectedId ? selectedScore : undefined;
              const signal = real ? real.level : classifySignal(rsi);
              const score = real ? real.score : rowScore(rsi);
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
                    {token.symbol}
                    <span className="ml-1.5 text-[var(--color-text-dim)]">{token.name}</span>
                  </td>
                  <td className="num-mono py-1.5 pr-2">{formatMoney(token.price, currency)}</td>
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
                  <td className="py-1.5 pr-2">
                    <ScoreBadge level={signal} score={score} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per coin instead of a horizontally-scrolling table. */}
      <div className="flex flex-col gap-2 md:hidden">
        {sorted.map((token) => {
          const isBigMove = Math.abs(token.change24h) >= BIG_MOVE_THRESHOLD;
          const rsi = rsiByToken[token.id] ?? mockRsiByTimeframe(token.id);
          const real = token.id === selectedId ? selectedScore : undefined;
          const signal = real ? real.level : classifySignal(rsi);
          const score = real ? real.score : rowScore(rsi);
          return (
            <button
              key={token.id}
              onClick={() => onSelect(token.id)}
              className={clsx(
                "flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                token.id === selectedId
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] hover:bg-white/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium text-[var(--color-text)]">{token.symbol}</span>
                  <span className="ml-1.5 text-xs text-[var(--color-text-dim)]">{token.name}</span>
                </div>
                <ScoreBadge level={signal} score={score} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="num-mono text-base font-semibold text-[var(--color-text)]">
                  {formatMoney(token.price, currency)}
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
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
