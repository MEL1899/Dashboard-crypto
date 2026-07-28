import { useState, type FormEvent } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChainKey } from "../types";
import type { WalletSnapshot } from "../lib/etherscan";
import { CHAINS, isValidEvmAddress } from "../lib/chains";
import { useChainTvl } from "../hooks/useChainTvl";
import { Badge, Card, Spinner, formatNumber, formatUsd, shortenAddress, timeAgo } from "./common";

const PIE_COLORS = ["#7c6cff", "#22d3ee", "#22c55e", "#f59e0b", "#f43f5e", "#8b93a7"];

interface WalletPanelProps {
  address: string;
  chain: ChainKey;
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  snapshot: WalletSnapshot | null;
  onSubmit: (address: string, chain: ChainKey) => void;
}

export function WalletPanel({
  address,
  chain,
  loading,
  isDemo,
  error,
  snapshot,
  onSubmit,
}: WalletPanelProps) {
  const [addrInput, setAddrInput] = useState(address);
  const [chainInput, setChainInput] = useState<ChainKey>(chain);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEvmAddress(addrInput)) {
      setValidationError("Endereço EVM inválido (formato 0x... de 42 caracteres).");
      return;
    }
    setValidationError(null);
    onSubmit(addrInput.trim(), chainInput);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <input
            value={addrInput}
            onChange={(e) => setAddrInput(e.target.value)}
            placeholder="0x... endereço da carteira"
            className="min-w-[280px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <select
            value={chainInput}
            onChange={(e) => setChainInput(e.target.value as ChainKey)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            {Object.values(CHAINS).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Analisar
          </button>
        </form>
        {validationError && (
          <p className="mt-2 text-xs text-[var(--color-down)]">{validationError}</p>
        )}
      </Card>

      <ChainTvlCard chain={chainInput} />

      {loading && (
        <Card className="flex items-center justify-center py-10">
          <Spinner />
        </Card>
      )}

      {!loading && !snapshot && !validationError && (
        <Card className="py-8 text-center text-sm text-[var(--color-text-dim)]">
          Informe um endereço de carteira EVM para ver saldo, holdings e insights de trades.
        </Card>
      )}

      {!loading && snapshot && (
        <>
          {isDemo && error && (
            <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
              Modo demonstração: {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card title="Total de Tx">
              <div className="num-mono text-2xl font-semibold">{snapshot.insights.totalTx}</div>
            </Card>
            <Card title="Entradas / Saídas">
              <div className="num-mono text-2xl font-semibold">
                <span className="text-[var(--color-up)]">{snapshot.insights.buys}</span>
                {" / "}
                <span className="text-[var(--color-down)]">{snapshot.insights.sells}</span>
              </div>
            </Card>
            <Card title="Tokens Únicos">
              <div className="num-mono text-2xl font-semibold">{snapshot.insights.uniqueTokens}</div>
            </Card>
            <Card title={`Gas Gasto (${CHAINS[chain].nativeSymbol})`}>
              <div className="num-mono text-2xl font-semibold">
                {formatNumber(snapshot.insights.totalGasNative, 5)}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card title="Holdings (estimado)" className="lg:col-span-2">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={snapshot.holdings.slice(0, 6)}
                      dataKey="balance"
                      nameKey="symbol"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {snapshot.holdings.slice(0, 6).map((h, i) => (
                        <Cell key={h.contract} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#191c26",
                        border: "1px solid #262a38",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {snapshot.holdings.slice(0, 6).map((h, i) => (
                  <span key={h.contract} className="flex items-center gap-1 text-xs text-[var(--color-text-dim)]">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {h.symbol}
                  </span>
                ))}
              </div>
            </Card>

            <Card title="Atividade (30 dias)" className="lg:col-span-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snapshot.insights.activityByDay}>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#8b93a7", fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                      interval="preserveStartEnd"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#191c26",
                        border: "1px solid #262a38",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="#7c6cff" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {snapshot.insights.mostActiveAsset && (
                <p className="mt-2 text-xs text-[var(--color-text-dim)]">
                  Ativo mais movimentado: <Badge tone="accent">{snapshot.insights.mostActiveAsset}</Badge>
                </p>
              )}
            </Card>
          </div>

          <Card title="Transações Recentes">
            <div className="max-h-80 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="sticky top-0 bg-[var(--color-surface)] text-[var(--color-text-dim)]">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Hash</th>
                    <th className="py-1.5 pr-2 font-medium">Ativo</th>
                    <th className="py-1.5 pr-2 font-medium">Quantidade</th>
                    <th className="py-1.5 pr-2 font-medium">Direção</th>
                    <th className="py-1.5 pr-2 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.transactions.slice(0, 25).map((tx) => (
                    <tr key={tx.hash + tx.timestamp} className="border-t border-[var(--color-border)]">
                      <td className="py-1.5 pr-2 num-mono text-[var(--color-text-dim)]">
                        {shortenAddress(tx.hash)}
                      </td>
                      <td className="py-1.5 pr-2">{tx.asset}</td>
                      <td className="py-1.5 pr-2 num-mono">{formatNumber(tx.amount)}</td>
                      <td className="py-1.5 pr-2">
                        <Badge tone={tx.direction === "in" ? "up" : "down"}>
                          {tx.direction === "in" ? "Recebido" : "Enviado"}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-2 text-[var(--color-text-dim)]">
                        {timeAgo(tx.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ChainTvlCard({ chain }: { chain: ChainKey }) {
  const tvl = useChainTvl(chain);
  const last = tvl.data[tvl.data.length - 1];
  const first = tvl.data[0];
  const changePct = last && first ? ((last.value - first.value) / first.value) * 100 : null;

  return (
    <Card
      title={`TVL — ${CHAINS[chain].label} (DeFiLlama, 90d)`}
      action={
        last && (
          <div className="text-right">
            <div className="num-mono text-sm font-semibold text-[var(--color-text)]">
              {formatUsd(last.value)}
            </div>
            {changePct !== null && (
              <Badge tone={changePct >= 0 ? "up" : "down"}>
                {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}%
              </Badge>
            )}
          </div>
        )
      }
    >
      {tvl.loading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          {tvl.isDemo && (
            <p className="mb-2 text-xs text-[var(--color-text-dim)]">
              Modo demonstração (dados simulados) — {tvl.error}
            </p>
          )}
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tvl.data}>
                <CartesianGrid stroke="#1c1f2a" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  contentStyle={{
                    background: "#191c26",
                    border: "1px solid #262a38",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) =>
                    new Date(Number(v) * 1000).toLocaleDateString("pt-BR")
                  }
                  formatter={(v) => [formatUsd(Number(v)), "TVL"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#22d3ee"
                  fill="#22d3ee33"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
