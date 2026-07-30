import { useState } from "react";
import { mockCandles } from "../lib/mock";
import { runBacktest, type BacktestMode, type BacktestResult } from "../lib/backtest";
import { BTC_TOKEN_ID, fetchDailyCandles } from "../lib/backtestData";
import type { MarketToken } from "../types";

export interface BacktestSummary {
  tokenId: string;
  symbol: string;
  result: BacktestResult;
  isDemo: boolean;
}

interface BatchState {
  running: boolean;
  progress: { done: number; total: number };
  summaries: BacktestSummary[];
}

const IDLE_STATE: BatchState = { running: false, progress: { done: 0, total: 0 }, summaries: [] };

/**
 * Runs the backtest across every given token, one at a time — deliberately
 * sequential (not Promise.all) so a whole watchlist doesn't fire a burst of
 * simultaneous requests at CoinGecko's rate limit, same caution as the rest
 * of the app's fetch hooks. BTC's own candles are fetched once and reused
 * as the relative-strength baseline for every token, instead of once each.
 */
export function useBacktestAll() {
  const [state, setState] = useState<BatchState>(IDLE_STATE);

  async function runAll(tokens: MarketToken[], apiKey?: string, mode: BacktestMode = "any") {
    setState({ running: true, progress: { done: 0, total: tokens.length }, summaries: [] });

    let btcCandles;
    try {
      btcCandles = await fetchDailyCandles(BTC_TOKEN_ID, apiKey);
    } catch {
      btcCandles = mockCandles(BTC_TOKEN_ID, "1d");
    }

    const summaries: BacktestSummary[] = [];
    for (const token of tokens) {
      let candles;
      let isDemo = false;
      try {
        candles = token.id === BTC_TOKEN_ID ? btcCandles : await fetchDailyCandles(token.id, apiKey);
      } catch {
        candles = mockCandles(token.id, "1d");
        isDemo = true;
      }
      const result = runBacktest(candles, token.id === BTC_TOKEN_ID ? null : btcCandles, mode);
      summaries.push({ tokenId: token.id, symbol: token.symbol, result, isDemo });
      setState((s) => ({ ...s, progress: { done: summaries.length, total: tokens.length }, summaries: [...summaries] }));
    }

    setState((s) => ({ ...s, running: false }));
  }

  return { ...state, runAll };
}
