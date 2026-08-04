/**
 * A/B: is the Fear & Greed Index better read directly (greed = bullish) or
 * inverted (greed = warning)?
 *
 * Runs the layered score twice over the same candles — the two arms differ
 * in exactly one bit, the `fearGreed` metric's direction — and scores each
 * against the random-entry baseline that the old score failed. The decision
 * belongs to these numbers, not to the reasoning in config.ts.
 *
 * Needs real network access to api.binance.com and api.alternative.me.
 * Neither requires a key.
 *
 *   npx vite-node scripts/fng-direction-ab.ts
 *   npx vite-node scripts/fng-direction-ab.ts BTCUSDT,ETHUSDT,SOLUSDT 1d
 */

import { runRandomBaseline, runScoreBacktest, type BacktestTimeframe } from "../src/lib/backtest";
import { configForRegime, withMetricDirection, type MetricDirection } from "../src/lib/score/config";
import type { BacktestResult, ExternalSeriesInput } from "../src/lib/backtest";
import type { Candle } from "../src/types";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"];
const BINANCE_MAX_CANDLES = 1000;

async function fetchCandles(symbol: string, interval: BacktestTimeframe): Promise<Candle[]> {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(BINANCE_MAX_CANDLES));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${symbol} ${res.status}: ${res.statusText}`);
  const rows = (await res.json()) as unknown[][];
  return rows.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

/** Full published history since Feb 2018 — limit=0 means "everything". */
async function fetchFearGreedHistory(): Promise<{ time: number; value: number }[]> {
  const res = await fetch("https://api.alternative.me/fng/?limit=0&format=json");
  if (!res.ok) throw new Error(`Fear & Greed ${res.status}: ${res.statusText}`);
  const body = (await res.json()) as { data?: { timestamp: string; value: string }[] };
  const rows = body.data ?? [];
  if (rows.length === 0) throw new Error("Fear & Greed returned an empty history");
  return rows
    .map((r) => ({ time: Number(r.timestamp), value: Number(r.value) }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time);
}

interface Arm {
  label: string;
  result: BacktestResult;
  baseline: BacktestResult;
}

function runArm(
  label: string,
  direction: MetricDirection,
  candles: Candle[],
  external: ExternalSeriesInput,
  timeframe: BacktestTimeframe,
  seed: string,
): Arm {
  const config = withMetricDirection(configForRegime(), "fearGreed", direction);
  const result = runScoreBacktest(candles, { timeframe, external, config });
  // Baseline trades at the arm's own frequency so the two pay comparable
  // costs — a coin flip that trades less would win on fees alone.
  const frequency = result.equityCurve.length > 0 ? result.trades.length / result.equityCurve.length : 0;
  const baseline = runRandomBaseline(candles, frequency, seed, timeframe);
  return { label, result, baseline };
}

function pct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function summarize(symbol: string, arm: Arm): string {
  const { result, baseline } = arm;
  const edge = result.strategyReturnPct - baseline.strategyReturnPct;
  return [
    symbol.padEnd(10),
    arm.label.padEnd(10),
    pct(result.strategyReturnPct).padStart(9),
    pct(baseline.strategyReturnPct).padStart(9),
    pct(edge).padStart(9),
    String(result.trades.length).padStart(7),
    `${result.winRate.toFixed(0)}%/${result.breakevenWinRate.toFixed(0)}%`.padStart(10),
    pct(result.expectancyPct).padStart(9),
  ].join(" ");
}

async function main() {
  const symbols = (process.argv[2] ?? DEFAULT_SYMBOLS.join(",")).split(",").map((s) => s.trim());
  const timeframe = (process.argv[3] ?? "1d") as BacktestTimeframe;

  console.log(`Fear & Greed direction A/B — ${symbols.join(", ")} @ ${timeframe}\n`);

  const fng = await fetchFearGreedHistory();
  const firstDay = new Date(fng[0].time * 1000).toISOString().slice(0, 10);
  const lastDay = new Date(fng[fng.length - 1].time * 1000).toISOString().slice(0, 10);
  console.log(`Fear & Greed: ${fng.length} leituras, ${firstDay} a ${lastDay}\n`);

  const external: ExternalSeriesInput = { fearGreed: fng };
  const arms: { symbol: string; direct: Arm; inverted: Arm }[] = [];

  for (const symbol of symbols) {
    let candles: Candle[];
    try {
      candles = await fetchCandles(symbol, timeframe);
    } catch (err) {
      console.log(`${symbol}: falhou (${(err as Error).message}) — pulando`);
      continue;
    }
    const overlap = candles.filter((c) => c.time >= fng[0].time).length;
    if (overlap < 100) {
      console.log(`${symbol}: só ${overlap} velas cobertas pelo histórico do F&G — pulando`);
      continue;
    }
    arms.push({
      symbol,
      direct: runArm("direto", "direct", candles, external, timeframe, `${symbol}:direct`),
      inverted: runArm("invertido", "inverted", candles, external, timeframe, `${symbol}:inverted`),
    });
  }

  if (arms.length === 0) {
    console.log("\nNenhum ativo pôde ser testado.");
    process.exitCode = 1;
    return;
  }

  console.log(
    ["Ativo".padEnd(10), "Direção".padEnd(10), "Estrat.".padStart(9), "Acaso".padStart(9), "Edge".padStart(9), "Trades".padStart(7), "Acerto/mín".padStart(10), "Exp/trade".padStart(9)].join(" "),
  );
  console.log("-".repeat(80));
  for (const { symbol, direct, inverted } of arms) {
    console.log(summarize(symbol, direct));
    console.log(summarize(symbol, inverted));
    console.log("-".repeat(80));
  }

  const edgeOf = (arm: Arm) => arm.result.strategyReturnPct - arm.baseline.strategyReturnPct;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const directEdge = avg(arms.map((a) => edgeOf(a.direct)));
  const invertedEdge = avg(arms.map((a) => edgeOf(a.inverted)));
  const directWins = arms.filter((a) => edgeOf(a.direct) > 0).length;
  const invertedWins = arms.filter((a) => edgeOf(a.inverted) > 0).length;

  console.log("\nVEREDITO");
  console.log(`  direto:    edge médio ${pct(directEdge)}, bateu o acaso em ${directWins}/${arms.length}`);
  console.log(`  invertido: edge médio ${pct(invertedEdge)}, bateu o acaso em ${invertedWins}/${arms.length}`);

  const better = invertedEdge > directEdge ? "invertido" : "direto";
  const margin = Math.abs(invertedEdge - directEdge);
  console.log(`\n  Melhor: ${better} (por ${margin.toFixed(2)} p.p.)`);

  if (Math.max(directEdge, invertedEdge) <= 0) {
    console.log(
      "\n  ATENÇÃO: nenhuma das duas direções superou entradas aleatórias. Escolher a 'melhor'\n" +
        "  entre duas versões sem edge é escolher a menos ruim, não uma estratégia validada.",
    );
  }
  const totalTrades = arms.reduce((sum, a) => sum + a.result.trades.length, 0);
  if (totalTrades < 100) {
    console.log(
      `\n  ATENÇÃO: só ${totalTrades} trades no total. Amostra pequena — a diferença acima\n` +
        "  pode ser ruído. Rode com mais ativos ou uma janela maior antes de decidir.",
    );
  }
}

main().catch((err) => {
  console.error(`\nFalhou: ${(err as Error).message}`);
  process.exitCode = 1;
});
