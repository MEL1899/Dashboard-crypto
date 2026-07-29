import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { MarketToken } from "../types";
import { Badge, Card, formatUsd } from "./common";

type SortKey = "price" | "change24h" | "marketCap" | "volume24h";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Preço" },
  { key: "change24h", label: "24h" },
  { key: "marketCap", label: "Market Cap" },
  { key: "volume24h", label: "Volume 24h" },
];

const BIG_MOVE_THRESHOLD = 8;

interface MarketWatchlistProps {
  tokens: MarketToken[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MarketWatchlist({ tokens, selectedId, onSelect }: MarketWatchlistProps) {
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
        <table className="w-full min-w-[520px] text-left text-xs">
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((token) => {
              const isBigMove = Math.abs(token.change24h) >= BIG_MOVE_THRESHOLD;
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
                  <td className="num-mono py-1.5 pr-2">{formatUsd(token.price)}</td>
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
                    {formatUsd(token.marketCap)}
                  </td>
                  <td className="num-mono py-1.5 pr-2 text-[var(--color-text-dim)]">
                    {formatUsd(token.volume24h)}
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
