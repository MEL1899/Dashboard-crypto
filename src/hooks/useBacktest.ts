import { useState } from "react";
import { mockCandles } from "../lib/mock";
import { runBacktest, type BacktestMode, type BacktestResult } from "../lib/backtest";
import { BTC_TOKEN_ID, fetchDailyCandles } from "../lib/backtestData";

interface BacktestState {
  loading: boolean;
  error: string | null;
  isDemo: boolean;
  result: BacktestResult | null;
}

const IDLE_STATE: BacktestState = { loading: false, error: null, isDemo: false, result: null };

/**
 * Runs on demand (not on a timer/mount, since it's a heavier one-off
 * simulation) — fetches daily candles for the chosen token plus BTC (for
 * the relative-strength signal), then hands them to lib/backtest.ts.
 */
export function useBacktest() {
  const [state, setState] = useState<BacktestState>(IDLE_STATE);

  async function run(tokenId: string, apiKey?: string, mode: BacktestMode = "any", windowDays?: number) {
    setState({ loading: true, error: null, isDemo: false, result: null });
    try {
      const [candles, btcCandles] = await Promise.all([
        fetchDailyCandles(tokenId, apiKey, windowDays),
        tokenId === BTC_TOKEN_ID ? Promise.resolve(null) : fetchDailyCandles(BTC_TOKEN_ID, apiKey, windowDays),
      ]);
      setState({ loading: false, error: null, isDemo: false, result: runBacktest(candles, btcCandles, mode) });
    } catch (err) {
      // Same resilience pattern as the rest of the app: fall back to the
      // deterministic mock so the feature still demonstrates itself
      // instead of just failing.
      const candles = mockCandles(tokenId, "1d");
      const btcCandles = tokenId === BTC_TOKEN_ID ? null : mockCandles(BTC_TOKEN_ID, "1d");
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to run backtest",
        isDemo: true,
        result: runBacktest(candles, btcCandles, mode),
      });
    }
  }

  return { ...state, run };
}
