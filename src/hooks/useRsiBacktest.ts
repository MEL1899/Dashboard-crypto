import { useState } from "react";
import { mockCandles } from "../lib/mock";
import { runRsiOnlyBacktest, type BacktestResult } from "../lib/backtest";
import { fetchDailyCandles } from "../lib/backtestData";

export interface RsiBacktestSummary {
  period: number;
  result: BacktestResult;
}

interface RsiBacktestState {
  loading: boolean;
  error: string | null;
  isDemo: boolean;
  summaries: RsiBacktestSummary[];
}

const IDLE_STATE: RsiBacktestState = { loading: false, error: null, isDemo: false, summaries: [] };

// The three classic RSI variants — short/standard/long lookback — so the
// comparison shows whether a faster or slower read works better as a pure
// signal, without the user having to pick a period blind.
const RSI_PERIODS = [7, 14, 21];

/**
 * Runs the same daily candles (fetched once) through runRsiOnlyBacktest at
 * a few different RSI periods — a baseline to check whether the full score
 * (RSI + MACD + Bollinger + trend + relative strength) actually earns its
 * extra complexity over plain RSI alone.
 */
export function useRsiBacktest() {
  const [state, setState] = useState<RsiBacktestState>(IDLE_STATE);

  async function run(tokenId: string, apiKey?: string) {
    setState({ loading: true, error: null, isDemo: false, summaries: [] });
    try {
      const candles = await fetchDailyCandles(tokenId, apiKey);
      setState({
        loading: false,
        error: null,
        isDemo: false,
        summaries: RSI_PERIODS.map((period) => ({ period, result: runRsiOnlyBacktest(candles, period) })),
      });
    } catch (err) {
      const candles = mockCandles(tokenId, "1d");
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to run RSI backtest",
        isDemo: true,
        summaries: RSI_PERIODS.map((period) => ({ period, result: runRsiOnlyBacktest(candles, period) })),
      });
    }
  }

  return { ...state, run };
}
