import { useState } from "react";
import { Info } from "lucide-react";
import type { BollingerBands, Candle, MarketToken, Timeframe } from "../types";
import { bbSignal } from "../lib/indicators";
import type { TokenSignals } from "../hooks/useWatchlistSignals";
import type { Currency } from "../lib/currency";
import { Badge, Card, formatMoney, formatPrice, ScoreBadge } from "./common";

const TIMEFRAME_LABEL: Record<Timeframe, string> = { "1h": "1H", "4h": "4H", "1d": "1D" };
const TIMEFRAME_ORDER: Timeframe[] = ["1h", "4h", "1d"];

interface MarketOverviewProps {
  token: MarketToken | undefined;
  candles: Candle[];
  bollinger: BollingerBands[];
  currency: Currency;
  /** Multi-timeframe confluence score + per-timeframe RSI for this token
   * (see useWatchlistSignals) — the same number shown in the watchlist
   * table, independent of the chart's active timeframe below. */
  signals?: TokenSignals;
}

export function MarketOverview({
  token,
  candles,
  bollinger,
  currency,
  signals,
}: MarketOverviewProps) {
  const [showExplainer, setShowExplainer] = useState(false);
  const lastCandle = candles[candles.length - 1];
  const lastBb = bollinger[bollinger.length - 1];

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
      <Card
        title="Score de Oportunidade"
        action={
          <button
            onClick={() => setShowExplainer((v) => !v)}
            aria-expanded={showExplainer}
            className="flex items-center gap-1 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            <Info size={13} />
            Como funciona?
          </button>
        }
      >
        <div className="flex items-center gap-2">
          <div className="num-mono text-3xl font-semibold text-[var(--color-text)]">
            {token && signals ? signals.score.score : "-"}
          </div>
          {token && signals && <ScoreBadge level={signals.score.level} />}
        </div>
        {token && signals && (
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            {signals.score.breakdown.join(" · ")}
          </p>
        )}
        {token && signals && (
          <p className="num-mono mt-2 flex items-center gap-3 text-[10px] text-[var(--color-text-dim)]">
            {TIMEFRAME_ORDER.map((t) => (
              <span key={t}>
                RSI {TIMEFRAME_LABEL[t]}
                {signals.isDemo ? " (estimado)" : ""}: {signals.rsiByTimeframe[t]}
              </span>
            ))}
          </p>
        )}

        {showExplainer && (
          <div className="mt-3 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-text-dim)]">
            <p>
              O score combina os 3 timeframes (1H, 4H e 1D) de cada indicador, não só o que
              está aberto no gráfico — por isso o número é o mesmo aqui e na tabela, independente
              do timeframe selecionado abaixo. Começa neutro em{" "}
              <strong className="text-[var(--color-text)]">50</strong> e é ajustado por 3
              indicadores técnicos — nenhum deles sozinho consegue levar o resultado a um
              extremo, só a confluência entre eles:
            </p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>
                <strong className="text-[var(--color-text)]">
                  RSI (Índice de Força Relativa, 14 períodos)
                </strong>{" "}
                — mede a velocidade e a força das variações recentes de preço, numa escala de 0
                a 100. Abaixo de 30 é considerado sobrevendido (favorece compra); acima de 70,
                sobrecomprado (favorece venda). Usamos a{" "}
                <strong className="text-[var(--color-text)]">média entre os 3 timeframes</strong>
                ; quanto mais distante de 50, maior o ajuste no score.
              </li>
              <li>
                <strong className="text-[var(--color-text)]">MACD (12/26/9)</strong> — compara
                uma média móvel exponencial rápida (12 períodos) com uma lenta (26 períodos) e
                uma linha de sinal (9 períodos) sobre essa diferença. Linha MACD cruzando acima
                do sinal indica momentum de alta; abaixo, momentum de baixa. Usamos o sinal que
                aparece na <strong className="text-[var(--color-text)]">maioria dos 3
                timeframes</strong> (+15 pontos se em alta, −15 se em baixa).
              </li>
              <li>
                <strong className="text-[var(--color-text)]">
                  Bandas de Bollinger (20 períodos, 2 desvios-padrão)
                </strong>{" "}
                — uma média móvel com bandas de volatilidade acima e abaixo do preço. Preço
                abaixo da banda inferior soma +15 pontos (possível sobrevenda); acima da banda
                superior, −15 (possível sobrecompra) — também pela posição que aparece na maioria
                dos 3 timeframes.
              </li>
              <li>
                <strong className="text-[var(--color-text)]">Volume</strong> — quando o preço
                toca uma das bandas de Bollinger (suporte ou resistência) com volume pelo menos
                50% acima da média dos últimos 20 períodos em 2 dos 3 timeframes, isso é tratado
                como confirmação do movimento: os +15/−15 da banda viram{" "}
                <strong className="text-[var(--color-text)]">+20/−20</strong>.
              </li>
            </ul>
            <p>
              O resultado é limitado entre 0 e 100 e classificado em 5 faixas:{" "}
              <strong className="text-[var(--color-text)]">Compra Forte</strong> (≥80),{" "}
              <strong className="text-[var(--color-text)]">Compra</strong> (≥60),{" "}
              <strong className="text-[var(--color-text)]">Neutro</strong> (≥40),{" "}
              <strong className="text-[var(--color-text)]">Venda</strong> (≥20) e{" "}
              <strong className="text-[var(--color-text)]">Venda Forte</strong> (abaixo de 20).
            </p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card title="Preço">
          <div className="num-mono text-2xl font-semibold text-[var(--color-text)]">
            {token ? formatPrice(token.price, currency) : "-"}
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
                {lastBb ? formatPrice(lastBb.upper, currency) : "-"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--color-text-dim)]">Inferior</div>
              <div className="num-mono text-lg font-semibold text-[var(--color-up)]">
                {lastBb ? formatPrice(lastBb.lower, currency) : "-"}
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
