import type { ReactNode } from "react";
import { Gauge, Globe, PieChart } from "lucide-react";
import { Badge, Card, formatUsd } from "./common";

// Mocked until a real aggregate-market endpoint (global market cap, BTC
// dominance, Fear & Greed) is wired up — presentation only for now.
const MOCK_PANORAMA = {
  totalMarketCap: 2_450_000_000_000,
  totalMarketCapChange24h: 1.8,
  btcDominance: 54.2,
  fearGreedValue: 42,
  fearGreedLabel: "Medo",
};

function fearGreedTone(value: number): "up" | "down" | "neutral" {
  if (value <= 24) return "down";
  if (value >= 75) return "up";
  return "neutral";
}

function Tile({
  icon,
  label,
  value,
  action,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--color-text-dim)]">{label}</div>
          <div className="num-mono truncate text-lg font-semibold text-[var(--color-text)]">
            {value}
          </div>
        </div>
        {action}
      </div>
    </Card>
  );
}

export function MarketPanorama() {
  const p = MOCK_PANORAMA;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile
        icon={<Globe size={18} />}
        label="Market Cap Total"
        value={formatUsd(p.totalMarketCap)}
        action={
          <Badge tone={p.totalMarketCapChange24h >= 0 ? "up" : "down"}>
            {p.totalMarketCapChange24h >= 0 ? "▲" : "▼"}{" "}
            {Math.abs(p.totalMarketCapChange24h).toFixed(1)}%
          </Badge>
        }
      />
      <Tile
        icon={<PieChart size={18} />}
        label="Dominância do BTC"
        value={`${p.btcDominance.toFixed(1)}%`}
      />
      <Tile
        icon={<Gauge size={18} />}
        label="Fear & Greed Index"
        value={String(p.fearGreedValue)}
        action={<Badge tone={fearGreedTone(p.fearGreedValue)}>{p.fearGreedLabel}</Badge>}
      />
    </div>
  );
}
