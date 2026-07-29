import type { ReactNode } from "react";
import { Gauge, Globe, PieChart } from "lucide-react";
import type { Currency } from "../lib/currency";
import type { MarketPanoramaData } from "../hooks/useMarketPanorama";
import { fearGreedLabel } from "../lib/fearGreed";
import { Badge, Card, formatMoney } from "./common";

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

export function MarketPanorama({ currency, data }: { currency: Currency; data: MarketPanoramaData }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile
        icon={<Globe size={18} />}
        label="Market Cap Total"
        value={formatMoney(data.totalMarketCap, currency)}
        action={
          <Badge tone={data.totalMarketCapChange24h >= 0 ? "up" : "down"}>
            {data.totalMarketCapChange24h >= 0 ? "▲" : "▼"}{" "}
            {Math.abs(data.totalMarketCapChange24h).toFixed(1)}%
          </Badge>
        }
      />
      <Tile
        icon={<PieChart size={18} />}
        label="Dominância do BTC"
        value={`${data.btcDominance.toFixed(1)}%`}
      />
      <Tile
        icon={<Gauge size={18} />}
        label="Fear & Greed Index"
        value={String(data.fearGreedValue)}
        action={
          <Badge tone={fearGreedTone(data.fearGreedValue)}>
            {fearGreedLabel(data.fearGreedValue)}
          </Badge>
        }
      />
    </div>
  );
}
