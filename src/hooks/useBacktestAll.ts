import { useState } from "react";
import { mockCandles } from "../lib/mock";
import {
  runBacktest,
  runRandomBaseline,
  runScoreBacktest,
  type BacktestMode,
  type BacktestResult,
  type BacktestTimeframe,
  type ExternalSeriesInput,
} from "../lib/backtest";
import { BTC_TOKEN_ID, fetchBacktestCandles } from "../lib/backtestData";
import { fetchFearGreedHistory } from "../lib/fearGreed";
import type { Candle, MarketToken } from "../types";

/**
 * Which score the run is testing.
 *
 * "layered" is lib/score — the formula the app actually displays. "legacy"
 * is the older inline score it replaced, kept selectable so the two can be
 * compared on the same candles rather than argued about.
 */
export type ScoreEngine = "layered" | "legacy";

export interface BacktestSummary {
  tokenId: string;
  symbol: string;
  result: BacktestResult;
  /** Coin-flip entries over the same candles with identical risk
   * management — the control group the strategy has to beat to have shown
   * any edge at all. */
  baseline: BacktestResult;
  isDemo: boolean;
}

/** Runs the control group at the strategy's own trade frequency, so the
 * two pay comparable costs and the comparison is about signal quality
 * rather than about who traded less. */
export function baselineFor(
  result: BacktestResult,
  candles: Candle[],
  seed: string,
  timeframe: BacktestTimeframe,
): BacktestResult {
  const tradeFrequency = result.equityCurve.length > 0 ? result.trades.length / result.equityCurve.length : 0;
  return runRandomBaseline(candles, tradeFrequency, seed, timeframe);
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

  async function runAll(
    tokens: MarketToken[],
    apiKey?: string,
    mode: BacktestMode = "any",
    windowDays?: number,
    timeframe: BacktestTimeframe = "1d",
    engine: ScoreEngine = "layered",
  ) {
    setState({ running: true, progress: { done: 0, total: tokens.length }, summaries: [] });

    let btcCandles;
    try {
      btcCandles = await fetchBacktestCandles(BTC_TOKEN_ID, timeframe, apiKey, windowDays);
    } catch {
      btcCandles = mockCandles(BTC_TOKEN_ID, timeframe);
    }

    // Fetched once for the whole run and shared by every token — it is a
    // market-wide series, not a per-asset one. Without it the layered
    // score's sentiment group drops out and only the technical group is
    // actually under test.
    let external: ExternalSeriesInput = {};
    if (engine === "layered") {
      try {
        external = { fearGreed: await fetchFearGreedHistory() };
      } catch {
        external = {};
      }
    }

    const summaries: BacktestSummary[] = [];
    for (const token of tokens) {
      let candles;
      let isDemo = false;
      try {
        candles =
          token.id === BTC_TOKEN_ID ? btcCandles : await fetchBacktestCandles(token.id, timeframe, apiKey, windowDays);
      } catch {
        candles = mockCandles(token.id, timeframe);
        isDemo = true;
      }
      const result =
        engine === "layered"
          ? runScoreBacktest(candles, { timeframe, mode, external })
          : runBacktest(candles, token.id === BTC_TOKEN_ID ? null : btcCandles, mode, timeframe);
      const baseline = baselineFor(result, candles, `${token.id}:${timeframe}:${engine}`, timeframe);
      summaries.push({ tokenId: token.id, symbol: token.symbol, result, baseline, isDemo });
      setState((s) => ({ ...s, progress: { done: summaries.length, total: tokens.length }, summaries: [...summaries] }));
    }

    setState((s) => ({ ...s, running: false }));
  }

  return { ...state, runAll };
}
