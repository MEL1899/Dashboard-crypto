/**
 * A/B: which exit rule actually earns more?
 *
 * Four variants of the same signal, differing only in what closes a trade:
 * the opposite signal or not, with a trailing stop or without. Each is
 * scored against a random-entry baseline running under the same exit rule,
 * so the comparison isolates the exit and not the entry.
 *
 * This exists because synthetic data could not settle it. On a smooth
 * synthetic series the trailing stop clearly improved reward-to-risk
 * (0.42 -> 1.20) and cut the break-even win rate (71% -> 46%), yet lowered
 * raw return (+17.4% -> +10.1%). A sine wave is not a market: it lacks the
 * fat tails that are exactly where a trailing stop earns its keep. Only
 * real candles can decide.
 *
 * Needs network access to api.binance.com. No key required.
 *
 *   npm run ab:exit
 *   npm run ab:exit -- BTCUSDT,ETHUSDT,SOLUSDT 4h
 */

import {
  runBacktest,
  runRandomBaseline,
  type BacktestResult,
  type BacktestTimeframe,
  type ExitPolicy,
  type TrailingStopConfig,
} from "../src/lib/backtest";
import type { Candle } from "../src/types";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"];
const TRAIL: TrailingStopConfig = { activationR: 1, trailFactor: 1 };

const VARIANTS: { label: string; policy: ExitPolicy; trail: TrailingStopConfig | null }[] = [
  { label: "flip, sem trail", policy: "flipOnSignal", trail: null },
  { label: "flip + trail", policy: "flipOnSignal", trail: TRAIL },
  { label: "stop/alvo, sem trail", policy: "stopAndTargetOnly", trail: null },
  { label: "stop/alvo + trail", policy: "stopAndTargetOnly", trail: TRAIL },
];

async function fetchCandles(symbol: string, interval: BacktestTimeframe): Promise<Candle[]> {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", "1000");
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

function rewardRisk(r: BacktestResult): number | null {
  const wins = r.trades.filter((t) => t.returnPct > 0);
  const losses = r.trades.filter((t) => t.returnPct <= 0);
  if (wins.length === 0 || losses.length === 0) return null;
  const avgWin = wins.reduce((s, t) => s + t.returnPct, 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0) / losses.length);
  return avgWin / avgLoss;
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

async function main() {
  const symbols = (process.argv[2] ?? DEFAULT_SYMBOLS.join(",")).split(",").map((s) => s.trim());
  const timeframe = (process.argv[3] ?? "1d") as BacktestTimeframe;

  console.log(`A/B de regra de saída — ${symbols.join(", ")} @ ${timeframe}\n`);

  const totals = new Map<string, { edge: number[]; ret: number[]; trades: number; rr: number[] }>();
  for (const v of VARIANTS) totals.set(v.label, { edge: [], ret: [], trades: 0, rr: [] });
  let tested = 0;

  for (const symbol of symbols) {
    let candles: Candle[];
    try {
      candles = await fetchCandles(symbol, timeframe);
    } catch (err) {
      console.log(`${symbol}: falhou (${(err as Error).message}) — pulando\n`);
      continue;
    }

    tested++;
    console.log(`### ${symbol} (${candles.length} velas)`);
    console.log(
      ["variante".padEnd(22), "trades".padStart(7), "retorno".padStart(9), "acaso".padStart(9), "edge".padStart(9), "R:R".padStart(6), "acerto/mín".padStart(11)].join(" "),
    );

    for (const { label, policy, trail } of VARIANTS) {
      const result = runBacktest(candles, null, "any", timeframe, policy, trail);
      const frequency =
        result.equityCurve.length > 0 ? result.trades.length / result.equityCurve.length : 0;
      // The control must share the exit rule, or it stops being a control
      // for the signal and becomes a control for the exit.
      const baseline = runRandomBaseline(candles, frequency, `${symbol}:${label}`, timeframe, policy);
      const edge = result.strategyReturnPct - baseline.strategyReturnPct;
      const rr = rewardRisk(result);

      const acc = totals.get(label)!;
      acc.edge.push(edge);
      acc.ret.push(result.strategyReturnPct);
      acc.trades += result.trades.length;
      if (rr !== null) acc.rr.push(rr);

      console.log(
        [
          label.padEnd(22),
          String(result.trades.length).padStart(7),
          pct(result.strategyReturnPct).padStart(9),
          pct(baseline.strategyReturnPct).padStart(9),
          pct(edge).padStart(9),
          (rr === null ? "-" : rr.toFixed(2)).padStart(6),
          `${result.winRate.toFixed(0)}%/${result.breakevenWinRate.toFixed(0)}%`.padStart(11),
        ].join(" "),
      );
    }
    console.log();
  }

  if (tested === 0) {
    // Without this, an empty run still prints a confident-looking "+0.0%"
    // summary built from no data at all.
    console.log("Nenhum ativo pôde ser testado — verifique a rede e os símbolos informados.");
    process.exitCode = 1;
    return;
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  console.log("RESUMO (média entre ativos)");
  console.log(["variante".padEnd(22), "edge".padStart(9), "retorno".padStart(9), "R:R".padStart(6), "trades".padStart(7)].join(" "));
  const ranked = VARIANTS.map((v) => ({ label: v.label, ...totals.get(v.label)! })).sort(
    (a, b) => avg(b.edge) - avg(a.edge),
  );
  for (const r of ranked) {
    console.log(
      [r.label.padEnd(22), pct(avg(r.edge)).padStart(9), pct(avg(r.ret)).padStart(9), (r.rr.length ? avg(r.rr).toFixed(2) : "-").padStart(6), String(r.trades).padStart(7)].join(" "),
    );
  }

  const best = ranked[0];
  console.log(`\n  Melhor por edge: ${best.label} (${pct(avg(best.edge))})`);

  if (avg(best.edge) <= 0) {
    console.log(
      "\n  ATENÇÃO: nenhuma variante superou entradas aleatórias. A melhor aqui é a menos\n" +
        "  ruim, não uma estratégia validada — a regra de saída não conserta um sinal sem edge.",
    );
  }
  if (best.trades < 100) {
    console.log(
      `\n  ATENÇÃO: só ${best.trades} trades na melhor variante. Amostra pequena — pode ser ruído.`,
    );
  }
}

main().catch((err) => {
  console.error(`\nFalhou: ${(err as Error).message}`);
  process.exitCode = 1;
});
