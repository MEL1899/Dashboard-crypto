import type { BollingerBands, Candle, IndicatorPoint, MarketToken } from "../types";
import { bbSignal, rsiSignal } from "../lib/indicators";
import type { Currency } from "../lib/currency";
import { Badge, Card, formatMoney } from "./common";

interface MarketOverviewProps {
  token: MarketToken | undefined;
  candles: Candle[];
  rsi: IndicatorPoint[];
  bollinger: BollingerBands[];
  currency: Currency;
}

export function MarketOverview({ token, candles, rsi, bollinger, currency }: MarketOverviewProps) {
  const lastCandle = candles[candles.length - 1];
  const lastRsi = rsi[rsi.length - 1];
  const lastBb = bollinger[bollinger.length - 1];

  const rsiTone =
    lastRsi && rsiSignal(lastRsi.value) === "overbought"
      ? "down"
      : lastRsi && rsiSignal(lastRsi.value) === "oversold"
        ? "up"
        : "neutral";

  const bbTone =
    lastCandle && lastBb
      ? bbSignal(lastCandle.close, lastBb) === "above-upper"
        ? "down"
        : bbSignal(lastCandle.close, lastBb) === "below-lower"
          ? "up"
          : "neutral"
      : "neutral";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card title="Preço">
        <div className="num-mono text-2xl font-semibold text-[var(--color-text)]">
          {token ? formatMoney(token.price, currency) : "-"}
        </div>
        {token && (
          <Badge tone={token.change24h >= 0 ? "up" : "down"}>
            {token.change24h >= 0 ? "▲" : "▼"} {Math.abs(token.change24h).toFixed(2)}% 24h
          </Badge>
        )}
      </Card>

      <Card title="Market Cap">
        <div className="num-mono text-2xl font-semibold text-[var(--color-text)]">
          {token ? formatMoney(token.marketCap, currency) : "-"}
        </div>
        <span className="text-xs text-[var(--color-text-dim)]">
          Vol 24h: {token ? formatMoney(token.volume24h, currency) : "-"}
        </span>
      </Card>

      <Card title="RSI (14)">
        <div className="num-mono text-2xl font-semibold text-[var(--color-text)]">
          {lastRsi ? lastRsi.value.toFixed(1) : "-"}
        </div>
        {lastRsi && (
          <Badge tone={rsiTone}>
            {rsiSignal(lastRsi.value) === "overbought"
              ? "Sobrecomprado"
              : rsiSignal(lastRsi.value) === "oversold"
                ? "Sobrevendido"
                : "Neutro"}
          </Badge>
        )}
      </Card>

      <Card title="Bollinger Bands">
        <div className="num-mono text-2xl font-semibold text-[var(--color-text)]">
          {lastBb ? formatMoney(lastBb.middle, currency) : "-"}
        </div>
        {lastBb && lastCandle && (
          <Badge tone={bbTone}>
            {bbSignal(lastCandle.close, lastBb) === "above-upper"
              ? "Acima da banda superior"
              : bbSignal(lastCandle.close, lastBb) === "below-lower"
                ? "Abaixo da banda inferior"
                : "Dentro das bandas"}
          </Badge>
        )}
      </Card>
    </div>
  );
}
