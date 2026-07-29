import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { MarketToken } from "../types";
import type { Currency } from "../lib/currency";
import { Badge, Card, formatMoney } from "./common";

type SortKey = "price" | "change24h" | "marketCap" | "volume24h";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Preço" },
  { key: "change24h", label: "24h" },
  { key: "marketCap", label: "Market Cap" },
  { key: "volume24h", label: "Volume 24h" },
];

const BIG_MOVE_THRESHOLD = 8;

// Mocked per-timeframe RSI until it's actually computed for the whole
// watchlist (today RSI only exists for whichever token's chart is open, and
// only for its currently selected timeframe) — deterministic per token id
// so it doesn't jump around between renders.
function seedFromString(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

function mockRsi(tokenId: string): { "1h": number; "4h": number; "1d": number } {
  const seed = seedFromString(tokenId);
  const rand = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };
  return {
    "1h": Math.round(15 + rand(1) * 70),
    "4h": Math.round(15 + rand(2) * 70),
    "1d": Math.round(15 + rand(3) * 70),
  };
}

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

type SignalLevel = "strongBuy" | "buy" | "neutral" | "sell" | "strongSell";

const SIGNAL_META: Record<SignalLevel, { label: string; tone: Tone; strong: boolean }> = {
  strongBuy: { label: "Compra Forte", tone: "up", strong: true },
  buy: { label: "Compra", tone: "up", strong: false },
  neutral: { label: "Neutro", tone: "neutral", strong: false },
  sell: { label: "Venda", tone: "down", strong: false },
  strongSell: { label: "Venda Forte", tone: "down", strong: true },
};

/** Aggregates the 3 timeframe RSIs into one technical read. */
function classifySignal(rsi: { "1h": number; "4h": number; "1d": number }): SignalLevel {
  const avg = (rsi["1h"] + rsi["4h"] + rsi["1d"]) / 3;
  if (avg <= 30) return "strongBuy";
  if (avg <= 45) return "buy";
  if (avg < 55) return "neutral";
  if (avg <= 70) return "sell";
  return "strongSell";
}

function SignalBadge({ level }: { level: SignalLevel }) {
  const meta = SIGNAL_META[level];
  if (meta.tone === "neutral") {
    return (
      <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-[var(--color-text-dim)]">
        {meta.label}
      </span>
    );
  }
  const solid = meta.tone === "up" ? "#0ca30c" : "#d03b3b";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={
        meta.strong
          ? { backgroundColor: solid, color: "#fff" }
          : { backgroundColor: `${solid}8c`, color: solid }
      }
    >
      {meta.label}
    </span>
  );
}

interface MarketWatchlistProps {
  tokens: MarketToken[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currency: Currency;
}

export function MarketWatchlist({ tokens, selectedId, onSelect, currency }: MarketWatchlistProps) {
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
      <div className="overflow-x-auto">
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
              <th className="py-1.5 pr-2 font-medium">Sinal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((token) => {
              const isBigMove = Math.abs(token.change24h) >= BIG_MOVE_THRESHOLD;
              const rsi = mockRsi(token.id);
              const signal = classifySignal(rsi);
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
                    <SignalBadge level={signal} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
