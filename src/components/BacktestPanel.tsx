import { useState } from "react";
import clsx from "clsx";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Play } from "lucide-react";
import type { MarketToken } from "../types";
import type { Currency } from "../lib/currency";
import { useBacktest } from "../hooks/useBacktest";
import { Card, Spinner, formatPrice } from "./common";

interface BacktestPanelProps {
  tokens: MarketToken[];
  apiKey?: string;
  currency: Currency;
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="text-xs text-[var(--color-text-dim)]">{label}</div>
      <div
        className={clsx(
          "num-mono mt-1 text-xl font-semibold",
          tone === "up" && "text-[var(--color-up)]",
          tone === "down" && "text-[var(--color-down)]",
          (!tone || tone === "neutral") && "text-[var(--color-text)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function BacktestPanel({ tokens, apiKey, currency }: BacktestPanelProps) {
  const [tokenId, setTokenId] = useState(tokens[0]?.id ?? "");
  const backtest = useBacktest();

  function handleRun() {
    if (!tokenId) return;
    backtest.run(tokenId, apiKey);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Backtest — Score de Oportunidade">
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-dim)]">
          Simula o score como uma regra simples de swing trade: compra no primeiro dia em que
          o score lê Compra/Compra Forte estando de fora, vende no primeiro dia em que lê
          Venda/Venda Forte estando posicionado. Usa só o timeframe diário — não a confluência
          completa de 5 timeframes do app, que exigiria histórico intradiário mais profundo do
          que as APIs gratuitas oferecem. Trate como um teste de direção do sinal, não uma
          réplica exata do score ao vivo, e lembre que desempenho passado não garante resultado
          futuro.
        </p>

        {tokens.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            Adicione moedas à watchlist na aba Mercado para poder rodar um backtest.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.symbol} — {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleRun}
              disabled={backtest.loading}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {backtest.loading ? <Spinner /> : <Play size={14} />}
              Rodar backtest
            </button>
          </div>
        )}
      </Card>

      {backtest.isDemo && backtest.result && (
        <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
          Modo demonstração: não foi possível carregar histórico real agora
          {backtest.error ? ` (${backtest.error})` : ""}. Exibindo candles simulados.
        </div>
      )}

      {backtest.result && backtest.result.equityCurve.length === 0 && (
        <p className="text-sm text-[var(--color-text-dim)]">
          Histórico insuficiente pra esse token — tenta outro com mais candles diários
          disponíveis.
        </p>
      )}

      {backtest.result && backtest.result.equityCurve.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile
              label="Retorno da estratégia"
              value={`${backtest.result.strategyReturnPct >= 0 ? "+" : ""}${backtest.result.strategyReturnPct.toFixed(1)}%`}
              tone={backtest.result.strategyReturnPct >= 0 ? "up" : "down"}
            />
            <StatTile
              label="Buy & Hold"
              value={`${backtest.result.buyHoldReturnPct >= 0 ? "+" : ""}${backtest.result.buyHoldReturnPct.toFixed(1)}%`}
              tone={backtest.result.buyHoldReturnPct >= 0 ? "up" : "down"}
            />
            <StatTile label="Nº de trades" value={String(backtest.result.trades.length)} />
            <StatTile label="Taxa de acerto" value={`${backtest.result.winRate.toFixed(0)}%`} />
            <StatTile
              label="Maior drawdown"
              value={`-${backtest.result.maxDrawdownPct.toFixed(1)}%`}
              tone="down"
            />
          </div>

          <Card title="Curva de capital (base 100)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={backtest.result.equityCurve}>
                  <CartesianGrid stroke="#1c1f2a" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(v) =>
                      new Date(Number(v) * 1000).toLocaleDateString("pt-BR", {
                        month: "short",
                        day: "2-digit",
                      })
                    }
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: "#191c26",
                      border: "1px solid #262a38",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => new Date(Number(v) * 1000).toLocaleDateString("pt-BR")}
                    formatter={(v, name) => [
                      Number(v).toFixed(1),
                      name === "equity" ? "Estratégia" : "Buy & Hold",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="buyHoldEquity"
                    stroke="#8b93a7"
                    fill="#8b93a733"
                    strokeWidth={1.5}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#7c6cff" fill="#7c6cff33" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`Trades (${backtest.result.trades.length})`}>
            {backtest.result.trades.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">
                Nenhum trade — o score não cruzou pra Compra/Venda nesse período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--color-text-dim)]">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Entrada</th>
                      <th className="py-1.5 pr-3 font-medium">Saída</th>
                      <th className="py-1.5 pr-3 font-medium">Preço entrada</th>
                      <th className="py-1.5 pr-3 font-medium">Preço saída</th>
                      <th className="py-1.5 pr-3 font-medium">Retorno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.result.trades.map((t) => (
                      <tr key={t.entryTime} className="border-t border-[var(--color-border)]">
                        <td className="py-1.5 pr-3">
                          {new Date(t.entryTime * 1000).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-1.5 pr-3">
                          {new Date(t.exitTime * 1000).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="num-mono py-1.5 pr-3">{formatPrice(t.entryPrice, currency)}</td>
                        <td className="num-mono py-1.5 pr-3">{formatPrice(t.exitPrice, currency)}</td>
                        <td
                          className={clsx(
                            "num-mono py-1.5 pr-3 font-medium",
                            t.returnPct >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
                          )}
                        >
                          {t.returnPct >= 0 ? "+" : ""}
                          {t.returnPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
