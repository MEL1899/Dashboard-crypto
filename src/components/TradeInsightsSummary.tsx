import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { buildTradeInsights } from "../lib/insights";
import { Badge, Card } from "./common";

interface TradeInsightsSummaryProps {
  symbol: string;
  rsi: number | null;
  bbPosition: "above-upper" | "below-lower" | "inside" | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  fearGreedValue: number | null;
  fearGreedLabel: string | null;
}

const BIAS_META = {
  bullish: { label: "Viés de alta", tone: "up" as const, icon: TrendingUp },
  bearish: { label: "Viés de baixa", tone: "down" as const, icon: TrendingDown },
  neutral: { label: "Sem viés claro", tone: "neutral" as const, icon: Minus },
};

export function TradeInsightsSummary(props: TradeInsightsSummaryProps) {
  const result = buildTradeInsights({
    symbol: props.symbol,
    rsi: props.rsi,
    bbPosition: props.bbPosition,
    fundingRate: props.fundingRate,
    longShortRatio: props.longShortRatio,
    fearGreedValue: props.fearGreedValue,
    fearGreedLabel: props.fearGreedLabel,
  });

  const meta = BIAS_META[result.bias];
  const Icon = meta.icon;

  return (
    <Card
      title={`Leitura de mercado — ${props.symbol}`}
      action={
        <Badge tone={meta.tone}>
          <span className="flex items-center gap-1">
            <Icon size={12} />
            {meta.label}
          </span>
        </Badge>
      }
    >
      {result.signals.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          Sem sinais extremos no momento — indicadores dentro de faixas normais.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.signals.map((signal, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span
                className={
                  signal.bias === "bullish"
                    ? "text-[var(--color-up)]"
                    : signal.bias === "bearish"
                      ? "text-[var(--color-down)]"
                      : "text-[var(--color-text-dim)]"
                }
              >
                {signal.bias === "bullish" ? "▲" : signal.bias === "bearish" ? "▼" : "•"}
              </span>
              <span className="text-[var(--color-text)]">{signal.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-[var(--color-text-dim)]">
        Leitura automática combinando RSI, Bollinger Bands, funding rate, long/short ratio e
        sentimento de mercado. Não é recomendação de investimento.
      </p>
    </Card>
  );
}
