import { useState } from "react";
import clsx from "clsx";
import type { MarketToken } from "../types";
import { formatUsd } from "./common";

interface TokenSelectorProps {
  tokens: MarketToken[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function TokenSelector({ tokens, selectedId, onSelect }: TokenSelectorProps) {
  const [customId, setCustomId] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tokens.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={clsx(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
            t.id === selectedId
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text)]"
              : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-white/20",
          )}
        >
          <span className="font-medium">{t.symbol}</span>
          <span className="num-mono text-xs opacity-70">{formatUsd(t.price)}</span>
        </button>
      ))}

      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (customId.trim()) {
            onSelect(customId.trim().toLowerCase());
            setCustomId("");
          }
        }}
      >
        <input
          value={customId}
          onChange={(e) => setCustomId(e.target.value)}
          placeholder="id coingecko (ex: uniswap)"
          className="w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </form>
    </div>
  );
}
