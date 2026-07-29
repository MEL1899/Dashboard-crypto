import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Card } from "./common";

interface ConfluenceHighlight {
  tokenId: string;
  symbol: string;
  direction: "oversold" | "overbought";
  rsi: { "1h": number; "4h": number; "1d": number };
}

// Mocked until RSI is computed per-timeframe for the whole watchlist (today
// it's only computed for whichever single timeframe the open chart uses).
// Real version: flag a coin here when RSI crosses the same threshold (<=30
// or >=70) on 1H, 4H and 1D at once.
const MOCK_HIGHLIGHTS: ConfluenceHighlight[] = [
  { tokenId: "bitcoin", symbol: "BTC", direction: "oversold", rsi: { "1h": 24, "4h": 27, "1d": 22 } },
  { tokenId: "solana", symbol: "SOL", direction: "overbought", rsi: { "1h": 78, "4h": 74, "1d": 81 } },
];

const DIRECTION_META = {
  oversold: { label: "sobrevendido", tone: "up" as const, icon: TrendingUp },
  overbought: { label: "sobrecomprado", tone: "down" as const, icon: TrendingDown },
};

export function MarketHighlights() {
  if (MOCK_HIGHLIGHTS.length === 0) return null;

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
        {MOCK_HIGHLIGHTS.map((h) => {
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
