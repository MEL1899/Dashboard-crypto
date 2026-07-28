import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Plus, Search, X } from "lucide-react";
import type { MarketToken } from "../types";
import { POPULAR_TOKENS, searchTokens, type TokenSearchResult } from "../lib/coingecko";
import { formatUsd } from "./common";

interface TokenSelectorProps {
  tokens: MarketToken[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  apiKey?: string;
}

const SUGGESTIONS = POPULAR_TOKENS.slice(0, 6);

export function TokenSelector({
  tokens,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
  apiKey,
}: TokenSelectorProps) {
  const watchlistIds = new Set(tokens.map((t) => t.id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {tokens.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "group flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
              t.id === selectedId
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-white/20",
            )}
          >
            <button onClick={() => onSelect(t.id)} className="flex items-center gap-2">
              <span className="font-medium">{t.symbol}</span>
              <span className="num-mono text-xs opacity-70">{formatUsd(t.price)}</span>
            </button>
            <button
              onClick={() => onRemove(t.id)}
              aria-label={`Remover ${t.symbol} da watchlist`}
              className="text-[var(--color-text-dim)] opacity-0 transition-opacity hover:text-[var(--color-down)] group-hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        <TokenSearchAdd watchlistIds={watchlistIds} onAdd={onAdd} apiKey={apiKey} />
      </div>

      {tokens.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-dim)]">
          <span>Sugestões:</span>
          {SUGGESTIONS.map((id) => (
            <button
              key={id}
              onClick={() => onAdd(id)}
              className="rounded-full border border-[var(--color-border)] px-2 py-0.5 hover:border-white/20 hover:text-[var(--color-text)]"
            >
              + {id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TokenSearchAdd({
  watchlistIds,
  onAdd,
  apiKey,
}: {
  watchlistIds: Set<string>;
  onAdd: (id: string) => void;
  apiKey?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const r = await searchTokens(query, apiKey);
        if (!cancelled) {
          setResults(r);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Busca indisponível agora.");
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, apiKey]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleAdd(id: string) {
    onAdd(id);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-dim)] focus-within:border-[var(--color-accent)]">
        <Search size={13} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Adicionar à watchlist..."
          className="w-36 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none"
        />
      </div>

      {open && (query.trim() || error) && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 shadow-lg">
          {error && <p className="px-2 py-1.5 text-xs text-[var(--color-down)]">{error}</p>}
          {!error && results.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-[var(--color-text-dim)]">
              {query.trim() ? "Nenhum resultado." : ""}
            </p>
          )}
          {results.map((r) => {
            const alreadyAdded = watchlistIds.has(r.id);
            return (
              <button
                key={r.id}
                disabled={alreadyAdded}
                onClick={() => handleAdd(r.id)}
                className={clsx(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
                  alreadyAdded
                    ? "cursor-default text-[var(--color-text-dim)] opacity-50"
                    : "text-[var(--color-text)] hover:bg-white/5",
                )}
              >
                <span>
                  <span className="font-medium">{r.symbol.toUpperCase()}</span>{" "}
                  <span className="text-[var(--color-text-dim)]">{r.name}</span>
                </span>
                {alreadyAdded ? "✓" : <Plus size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
