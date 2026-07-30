import { useState } from "react";
import { mockCandles } from "../lib/mock";
import { runRsiOnlyBacktest, type BacktestResult, type BacktestTimeframe } from "../lib/backtest";
import { fetchBacktestCandles } from "../lib/backtestData";
import type { MarketToken } from "../types";

export interface RsiBacktestSummary {
  tokenId: string;
  symbol: string;
  result: BacktestResult;
  isDemo: boolean;
}

interface BatchState {
  running: boolean;
  progress: { done: number; total: number };
  summaries: RsiBacktestSummary[];
}

const IDLE_STATE: BatchState = { running: false, progress: { done: 0, total: 0 }, summaries: [] };

/**
 * Same shape as useBacktestAll, but for the plain-RSI baseline
 * (lib/backtest.ts's runRsiOnlyBacktest) at one chosen period, across the
 * whole watchlist — sequential fetches, same rate-limit caution as the
 * rest of the app.
 */
export function useRsiBacktestAll() {
  const [state, setState] = useState<BatchState>(IDLE_STATE);

  async function runAll(
    tokens: MarketToken[],
    rsiPeriod: number,
    apiKey?: string,
    windowDays?: number,
    timeframe: BacktestTimeframe = "1d",
  ) {
    setState({ running: true, progress: { done: 0, total: tokens.length }, summaries: [] });

    const summaries: RsiBacktestSummary[] = [];
    for (const token of tokens) {
      let candles;
      let isDemo = false;
      try {
        candles = await fetchBacktestCandles(token.id, timeframe, apiKey, windowDays);
      } catch {
        candles = mockCandles(token.id, timeframe);
        isDemo = true;
      }
      const result = runRsiOnlyBacktest(candles, rsiPeriod, timeframe);
      summaries.push({ tokenId: token.id, symbol: token.symbol, result, isDemo });
      setState((s) => ({ ...s, progress: { done: summaries.length, total: tokens.length }, summaries: [...summaries] }));
    }

    setState((s) => ({ ...s, running: false }));
  }

  return { ...state, runAll };
}
