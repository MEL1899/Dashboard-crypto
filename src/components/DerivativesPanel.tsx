import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DerivativesSnapshot } from "../types";
import { Badge, Card, Spinner, formatUsd } from "./common";
import { TradeInsightsSummary } from "./TradeInsightsSummary";
import { bbSignal } from "../lib/indicators";
import type { BollingerBands, IndicatorPoint } from "../types";

const tooltipStyle = {
  background: "#191c26",
  border: "1px solid #262a38",
  borderRadius: 8,
  fontSize: 12,
};

function formatHour(time: number): string {
  return new Date(time * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fngColor(value: number): string {
  if (value <= 24) return "#f43f5e";
  if (value <= 44) return "#f59e0b";
  if (value <= 55) return "#8b93a7";
  if (value <= 75) return "#22c55e";
  return "#16a34a";
}

interface DerivativesPanelProps {
  tokenSymbol: string;
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  data: DerivativesSnapshot | null;
  rsi: IndicatorPoint[];
  bollinger: BollingerBands[];
  lastClose: number | null;
}

export function DerivativesPanel({
  tokenSymbol,
  loading,
  isDemo,
  error,
  data,
  rsi,
  bollinger,
  lastClose,
}: DerivativesPanelProps) {
  if (loading || !data) {
    return (
      <Card className="flex items-center justify-center py-16">
        <Spinner />
      </Card>
    );
  }

  const lastFng = data.fearGreed[data.fearGreed.length - 1] ?? null;
  const lastRsi = rsi[rsi.length - 1] ?? null;
  const lastBb = bollinger[bollinger.length - 1] ?? null;
  const lastLongShort = data.longShortHistory[data.longShortHistory.length - 1] ?? null;

  const bbPosition =
    lastBb && lastClose !== null ? bbSignal(lastClose, lastBb) : null;

  return (
    <div className="flex flex-col gap-4">
      {isDemo && (
        <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
          Modo demonstração: não foi possível carregar dados reais de derivativos agora
          {error ? ` (${error})` : ""}. Exibindo dados simulados.
        </div>
      )}

      <TradeInsightsSummary
        symbol={tokenSymbol}
        rsi={lastRsi ? lastRsi.value : null}
        bbPosition={bbPosition}
        fundingRate={data.lastFundingRate}
        longShortRatio={lastLongShort ? lastLongShort.ratio : null}
        fearGreedValue={lastFng ? lastFng.value : null}
        fearGreedLabel={lastFng ? lastFng.classification : null}
      />

      {!data.symbol ? (
        <Card className="py-6 text-center text-sm text-[var(--color-text-dim)]">
          Sem mercado de futuros perpétuos para {tokenSymbol} na Binance. Indicadores de RSI/BB
          continuam disponíveis na aba Mercado; o Fear &amp; Greed Index abaixo é sempre global.
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card title="Mark Price">
            <div className="num-mono text-xl font-semibold">
              {data.markPrice !== null ? formatUsd(data.markPrice) : "-"}
            </div>
          </Card>
          <Card title="Funding Rate">
            <div className="num-mono text-xl font-semibold">
              {data.lastFundingRate !== null
                ? `${(data.lastFundingRate * 100).toFixed(4)}%`
                : "-"}
            </div>
            {data.lastFundingRate !== null && (
              <Badge tone={data.lastFundingRate >= 0 ? "down" : "up"}>
                {data.lastFundingRate >= 0 ? "Longs pagam" : "Shorts pagam"}
              </Badge>
            )}
          </Card>
          <Card title="Open Interest">
            <div className="num-mono text-xl font-semibold">
              {data.openInterestHistory.length
                ? formatUsd(
                    data.openInterestHistory[data.openInterestHistory.length - 1].valueUsd,
                  )
                : "-"}
            </div>
          </Card>
          <Card title="Long / Short">
            <div className="num-mono text-xl font-semibold">
              {lastLongShort ? lastLongShort.ratio.toFixed(2) : "-"}
            </div>
            {lastLongShort && (
              <span className="text-xs text-[var(--color-text-dim)]">
                {lastLongShort.longAccountPct.toFixed(1)}% long /{" "}
                {lastLongShort.shortAccountPct.toFixed(1)}% short
              </span>
            )}
          </Card>
        </div>
      )}

      {data.symbol && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Funding Rate (histórico)">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.fundingHistory}>
                  <CartesianGrid stroke="#1c1f2a" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={formatHour}
                    tick={{ fill: "#8b93a7", fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${(v * 100).toFixed(2)}%`}
                    tick={{ fill: "#8b93a7", fontSize: 10 }}
                    width={55}
                  />
                  <ReferenceLine y={0} stroke="#262a38" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => formatHour(Number(v))}
                    formatter={(v) => [`${(Number(v) * 100).toFixed(4)}%`, "Funding"]}
                  />
                  <Bar dataKey="rate" radius={[2, 2, 2, 2]}>
                    {data.fundingHistory.map((point, i) => (
                      <Cell key={i} fill={point.rate >= 0 ? "#22c55e" : "#f43f5e"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Open Interest (USD)">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.openInterestHistory}>
                  <CartesianGrid stroke="#1c1f2a" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={formatHour}
                    tick={{ fill: "#8b93a7", fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatUsd(v)}
                    tick={{ fill: "#8b93a7", fontSize: 10 }}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => formatHour(Number(v))}
                    formatter={(v) => [formatUsd(Number(v)), "OI"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="valueUsd"
                    stroke="#7c6cff"
                    fill="#7c6cff33"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Long / Short Ratio (contas)">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.longShortHistory}>
                  <CartesianGrid stroke="#1c1f2a" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={formatHour}
                    tick={{ fill: "#8b93a7", fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fill: "#8b93a7", fontSize: 10 }} width={35} />
                  <ReferenceLine y={1} stroke="#262a38" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => formatHour(Number(v))}
                    formatter={(v) => [Number(v).toFixed(2), "Ratio"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="ratio"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <FearGreedCard fearGreed={data.fearGreed} />
        </div>
      )}

      {!data.symbol && <FearGreedCard fearGreed={data.fearGreed} />}
    </div>
  );
}

function FearGreedCard({ fearGreed }: { fearGreed: DerivativesSnapshot["fearGreed"] }) {
  const last = fearGreed[fearGreed.length - 1];

  return (
    <Card title="Fear & Greed Index (global)">
      {last && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <div className="num-mono text-2xl font-semibold" style={{ color: fngColor(last.value) }}>
              {last.value}
            </div>
            <Badge tone="neutral">{last.classification}</Badge>
          </div>
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${last.value}%`, background: fngColor(last.value) }}
            />
          </div>
        </>
      )}
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={fearGreed}>
            <XAxis
              dataKey="time"
              tickFormatter={(v: number) => new Date(v * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              tick={{ fill: "#8b93a7", fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis domain={[0, 100]} tick={{ fill: "#8b93a7", fontSize: 10 }} width={28} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v) => [Number(v), "Índice"]}
            />
            <Line type="monotone" dataKey="value" stroke="#c084fc" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
