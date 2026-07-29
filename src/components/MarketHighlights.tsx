import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { MarketToken } from "../types";
import type { TokenRsiByTimeframe } from "../hooks/useWatchlistRsi";
import { Badge, Card } from "./common";

interface ConfluenceHighlight {
  tokenId: string;
  symbol: string;
  direction: "oversold" | "overbought";
  rsi: { "1h": number; "4h": number; "1d": number };
}

const DIRECTION_META = {
  oversold: { label: "sobrevendido", tone: "up" as const, icon: TrendingUp },
  overbought: { label: "sobrecomprado", tone: "down" as const, icon: TrendingDown },
};

/** Flags a coin only when RSI crosses the same threshold on all 3 timeframes at once. */
function classifyDirection(rsi: TokenRsiByTimeframe): "oversold" | "overbought" | null {
  if (rsi["1h"] <= 30 && rsi["4h"] <= 30 && rsi["1d"] <= 30) return "oversold";
  if (rsi["1h"] >= 70 && rsi["4h"] >= 70 && rsi["1d"] >= 70) return "overbought";
  return null;
}

interface MarketHighlightsProps {
  tokens: MarketToken[];
  rsiByToken: Record<string, TokenRsiByTimeframe>;
}

export function MarketHighlights({ tokens, rsiByToken }: MarketHighlightsProps) {
  const highlights: ConfluenceHighlight[] = [];
  for (const token of tokens) {
    const rsi = rsiByToken[token.id];
    if (!rsi) continue;
    const direction = classifyDirection(rsi);
    if (!direction) continue;
    highlights.push({ tokenId: token.id, symbol: token.symbol, direction, rsi });
  }

  if (highlights.length === 0) return null;

  return (
    <Card
      title="Destaques"
      action={
        <span className="flex items-center gap-1 text-xs text-[var(--color-text-dim)]">
          <Sparkles size={13} />
          Confluência de RSI nos 3 timeframes
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {highlights.map((h) => {
          const meta = DIRECTION_META[h.direction];
          const Icon = meta.icon;
          return (
            <div
              key={h.tokenId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <Icon size={15} className={meta.tone === "up" ? "text-[var(--color-up)]" : "text-[var(--color-down)]"} />
                <span className="font-medium text-[var(--color-text)]">{h.symbol}</span>
                <span className="text-[var(--color-text-dim)]">
                  {meta.label} em 1H, 4H e 1D
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={meta.tone}>1H {h.rsi["1h"]}</Badge>
                <Badge tone={meta.tone}>4H {h.rsi["4h"]}</Badge>
                <Badge tone={meta.tone}>1D {h.rsi["1d"]}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
