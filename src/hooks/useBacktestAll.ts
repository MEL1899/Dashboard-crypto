import { useState } from "react";
import { mockCandles } from "../lib/mock";
import {
  RSI_SERIES_ID,
  rsiSeriesFor,
  runRandomBaseline,
  runScoreBacktest,
  type BacktestMode,
  type BacktestResult,
  type BacktestTimeframe,
  type ExitPolicy,
  type ExternalSeriesInput,
} from "../lib/backtest";
import { BTC_TOKEN_ID, fetchBacktestCandles } from "../lib/backtestData";
import { fetchFundingRateHistory, symbolForToken } from "../lib/binance";
import { fetchFearGreedHistory } from "../lib/fearGreed";
import type { Candle, MarketToken } from "../types";

export interface BacktestSummary {
  tokenId: string;
  symbol: string;
  result: BacktestResult;
  /** Coin-flip entries over the same candles with identical risk
   * management — the control group the strategy has to beat to have shown
   * any edge at all. */
  baseline: BacktestResult;
  isDemo: boolean;
  /** Which of the score's inputs the run actually had, so the panel can say
   * whether it tested the same formula the Mercado tab displays. */
  inputs: RunInputs;
}

/** What was available to this particular run. A backtest missing funding or
 * Fear & Greed is testing a smaller score than the app shows, and the user
 * should not have to guess which. */
export interface RunInputs {
  fearGreed: boolean;
  fundingRate: boolean;
  /** Timeframes whose RSI fed the multi-timeframe blend. */
  rsiTimeframes: BacktestTimeframe[];
}

/** Runs the control group at the strategy's own trade frequency, so the
 * two pay comparable costs and the comparison is about signal quality
 * rather than about who traded less. */
export function baselineFor(
  result: BacktestResult,
  candles: Candle[],
  seed: string,
  timeframe: BacktestTimeframe,
  /** Must match the run being compared against — a control that exits by a
   * different rule is a control for the exit, not for the signal. Forwarded
   * explicitly rather than left to a shared default, which would have gone
   * quietly wrong the first time the UI exposed the choice. */
  exitPolicy?: ExitPolicy,
): BacktestResult {
  const tradeFrequency = result.equityCurve.length > 0 ? result.trades.length / result.equityCurve.length : 0;
  return runRandomBaseline(candles, tradeFrequency, seed, timeframe, exitPolicy);
}

interface BatchState {
  running: boolean;
  progress: { done: number; total: number };
  summaries: BacktestSummary[];
}

const IDLE_STATE: BatchState = { running: false, progress: { done: 0, total: 0 }, summaries: [] };

/** The other two timeframes the live score blends RSI across, for a run on
 * a given one. Fetched so the backtest reproduces the same blend instead of
 * testing a single-timeframe variant of the score. */
const OTHER_RSI_TIMEFRAMES: Record<BacktestTimeframe, BacktestTimeframe[]> = {
  "1d": ["1h", "4h"],
  "4h": ["1h", "1d"],
  "1h": ["4h", "1d"],
};

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
    let fearGreed: ExternalSeriesInput["fearGreed"] | null = null;
    try {
      fearGreed = await fetchFearGreedHistory();
    } catch {
      fearGreed = null;
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

      const external: ExternalSeriesInput = {};
      if (fearGreed) external.fearGreed = fearGreed;

      // Per-asset, unlike Fear & Greed — funding is a property of this
      // token's own perpetual. Only tokens with a Binance mapping have one.
      const symbol = symbolForToken(token.id);
      if (symbol && !isDemo) {
        try {
          const funding = await fetchFundingRateHistory(symbol);
          if (funding.length > 0) external.fundingRate = funding;
        } catch {
          // A spot listing without a perpetual is a 400 here, not an
          // outage — the metric just drops out, as designed.
        }
      }

      // The other two timeframes' RSI, so the blend matches the live score.
      const rsiTimeframes: BacktestTimeframe[] = [timeframe];
      for (const other of OTHER_RSI_TIMEFRAMES[timeframe]) {
        try {
          const otherCandles = await fetchBacktestCandles(token.id, other, apiKey, windowDays);
          const series = rsiSeriesFor(otherCandles, other);
          if (series.length > 0) {
            external[RSI_SERIES_ID[other]] = series;
            rsiTimeframes.push(other);
          }
        } catch {
          // Missing a timeframe just narrows the blend; combineRsi
          // renormalizes over whichever ones arrived.
        }
      }

      const result = runScoreBacktest(candles, { timeframe, mode, external });
      const baseline = baselineFor(result, candles, `${token.id}:${timeframe}:score`, timeframe);
      summaries.push({
        tokenId: token.id,
        symbol: token.symbol,
        result,
        baseline,
        isDemo,
        inputs: {
          fearGreed: external.fearGreed !== undefined,
          fundingRate: external.fundingRate !== undefined,
          rsiTimeframes,
        },
      });
      setState((s) => ({ ...s, progress: { done: summaries.length, total: tokens.length }, summaries: [...summaries] }));
    }

    setState((s) => ({ ...s, running: false }));
  }

  return { ...state, runAll };
}
