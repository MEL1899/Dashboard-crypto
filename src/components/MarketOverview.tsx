import type { BollingerBands, Candle, IndicatorPoint, MarketToken, Timeframe } from "../types";
import { bbSignal } from "../lib/indicators";
import { computeOpportunityScoreFromMarket } from "../lib/opportunityScore";
import type { TokenRsiByTimeframe } from "../hooks/useWatchlistRsi";
import type { Currency } from "../lib/currency";
import { Badge, Card, formatMoney, ScoreBadge } from "./common";

const TIMEFRAME_LABEL: Record<Timeframe, string> = { "1h": "1H", "4h": "4H", "1d": "1D" };
const TIMEFRAME_ORDER: Timeframe[] = ["1h", "4h", "1d"];

interface MarketOverviewProps {
  token: MarketToken | undefined;
  candles: Candle[];
  rsi: IndicatorPoint[];
  bollinger: BollingerBands[];
  currency: Currency;
  timeframe: Timeframe;
  /** Real per-timeframe RSI for this token (see useWatchlistRsi); the score
   * itself only ever uses the active timeframe's real RSI/MACD/Bollinger
   * above — this is just a secondary reference for the other two. */
  otherTimeframeRsi?: TokenRsiByTimeframe;
}

export function MarketOverview({
  token,
  candles,
  rsi,
  bollinger,
  currency,
  timeframe,
  otherTimeframeRsi,
}: MarketOverviewProps) {
  const lastCandle = candles[candles.length - 1];
  const lastBb = bollinger[bollinger.length - 1];
  const opportunity = computeOpportunityScoreFromMarket(candles, rsi, bollinger);
  const otherTimeframes = TIMEFRAME_ORDER.filter((t) => t !== timeframe);

  const bbTone =
    lastCandle && lastBb
      ? bbSignal(lastCandle.close, lastBb) === "above-upper"
        ? "down"
        : bbSignal(lastCandle.close, lastBb) === "below-lower"
          ? "up"
          : "neutral"
      : "neutral";

  return (
    <div className="flex flex-col gap-3">
      <Card title="Score de Oportunidade">
        <div className="flex items-center gap-2">
          <div className="num-mono text-3xl font-semibold text-[var(--color-text)]">
            {token ? opportunity.score : "-"}
          </div>
          {token && <ScoreBadge level={opportunity.level} />}
        </div>
        {token && (
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            {opportunity.breakdown.join(" · ")}
          </p>
        )}
        {token && otherTimeframeRsi && (
          <p className="num-mono mt-2 flex items-center gap-3 text-[10px] text-[var(--color-text-dim)]">
            {otherTimeframes.map((t) => (
              <span key={t}>
                RSI {TIMEFRAME_LABEL[t]}
                {otherTimeframeRsi.isDemo ? " (estimado)" : ""}: {otherTimeframeRsi[t]}
              </span>
            ))}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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

        <Card title="Bollinger Bands" className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] text-[var(--color-text-dim)]">Superior</div>
              <div className="num-mono text-lg font-semibold text-[var(--color-down)]">
                {lastBb ? formatMoney(lastBb.upper, currency) : "-"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--color-text-dim)]">Inferior</div>
              <div className="num-mono text-lg font-semibold text-[var(--color-up)]">
                {lastBb ? formatMoney(lastBb.lower, currency) : "-"}
              </div>
            </div>
          </div>
          {lastBb && lastCandle && (
            <div className="mt-1.5">
              <Badge tone={bbTone}>
                {bbSignal(lastCandle.close, lastBb) === "above-upper"
                  ? "Acima da banda superior"
                  : bbSignal(lastCandle.close, lastBb) === "below-lower"
                    ? "Abaixo da banda inferior"
                    : "Dentro das bandas"}
              </Badge>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
