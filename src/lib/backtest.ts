import type { Candle } from "../types";
import {
  bbSignal,
  calcBollingerBands,
  calcMACD,
  calcRSI,
  isVolumeSpike,
  macdSignal,
  relativeStrengthSignal,
  trendSignal,
} from "./indicators";
import { computeOpportunityScore } from "./opportunityScore";

export interface BacktestTrade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  returnPct: number;
}

export interface BacktestPoint {
  time: number;
  /** Strategy equity, starting at 100 (i.e. 100 = break-even so far). */
  equity: number;
  /** A simple buy-and-hold of the same token over the same window, same
   * starting value, for comparison. */
  buyHoldEquity: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equityCurve: BacktestPoint[];
  strategyReturnPct: number;
  buyHoldReturnPct: number;
  /** 0-100, percentage of closed trades that were profitable. */
  winRate: number;
  maxDrawdownPct: number;
}

const EMPTY_RESULT: BacktestResult = {
  trades: [],
  equityCurve: [],
  strategyReturnPct: 0,
  buyHoldReturnPct: 0,
  winRate: 0,
  maxDrawdownPct: 0,
};

const RELATIVE_STRENGTH_WINDOW = 20;
// Needs enough daily candles for every indicator to produce a real read —
// the binding constraint is the trend filter's 50-period SMA.
const WARMUP_INDEX = 50;

type SignalAction = "buy" | "sell" | "hold";
/** Decides what to do given every candle up to and including "today" (the
 * last element of `window`) — never anything past it, so a signal function
 * can't accidentally peek into the future. */
type SignalFn = (window: Candle[]) => SignalAction;

/**
 * Shared trade-simulation engine: opens a position the first day `signal`
 * says "buy" while flat, closes it the first day it says "sell" while
 * holding, and tracks equity/drawdown/buy-and-hold alongside it. Both
 * runBacktest (the full score) and runRsiOnlyBacktest (RSI alone) are just
 * this loop with a different `signal`.
 */
function simulate(candles: Candle[], signal: SignalFn): BacktestResult {
  if (candles.length <= WARMUP_INDEX) return EMPTY_RESULT;

  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestPoint[] = [];

  let equity = 100;
  let position: { entryTime: number; entryPrice: number } | null = null;
  const startPrice = candles[WARMUP_INDEX].close;

  for (let i = WARMUP_INDEX; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const lastClose = window[window.length - 1].close;
    const action = signal(window);

    if (!position && action === "buy") {
      position = { entryTime: window[i].time, entryPrice: lastClose };
    } else if (position && action === "sell") {
      trades.push({
        entryTime: position.entryTime,
        entryPrice: position.entryPrice,
        exitTime: window[i].time,
        exitPrice: lastClose,
        returnPct: ((lastClose - position.entryPrice) / position.entryPrice) * 100,
      });
      equity *= lastClose / position.entryPrice;
      position = null;
    }

    equityCurve.push({
      time: window[i].time,
      equity: position ? equity * (lastClose / position.entryPrice) : equity,
      buyHoldEquity: (lastClose / startPrice) * 100,
    });
  }

  // Still holding at the end of the window — close it out for a clean
  // final number instead of leaving it as an unrealized, open position.
  if (position) {
    const last = candles[candles.length - 1];
    trades.push({
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime: last.time,
      exitPrice: last.close,
      returnPct: ((last.close - position.entryPrice) / position.entryPrice) * 100,
    });
    equity *= last.close / position.entryPrice;
  }

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = ((peak - point.equity) / peak) * 100;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  }

  const wins = trades.filter((t) => t.returnPct > 0).length;

  return {
    trades,
    equityCurve,
    strategyReturnPct: equity - 100,
    buyHoldReturnPct: ((candles[candles.length - 1].close - startPrice) / startPrice) * 100,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    maxDrawdownPct,
  };
}

/** "any" = trade on Compra/Compra Forte and Venda/Venda Forte (score
 * crossing 60/40) — the original, more active rule. "strongOnly" = trade
 * only on Compra Forte/Venda Forte (score crossing 80/20) — fewer, higher-
 * conviction trades. */
export type BacktestMode = "any" | "strongOnly";

/**
 * Simulates the opportunity score's Compra/Venda levels as a simple
 * swing-trade rule against real historical daily candles: go long the
 * first day the score reads Compra/Compra Forte (or just Compra Forte in
 * "strongOnly" mode) while flat, close out the first day it reads the
 * matching sell level while holding. Each day's score is computed only
 * from candles up to and including that day — never a peek into the
 * future.
 *
 * This intentionally simplifies the live app's 5-timeframe confluence down
 * to a single daily timeframe: getting deep 1h/4h/1w/1M history for the
 * same historical window isn't practical from these free APIs, so a
 * faithful multi-timeframe backtest isn't possible here. Treat the result
 * as a directional check on whether the underlying signal has any edge at
 * all, not a precise replay of the live score, and remember past
 * performance doesn't guarantee future results.
 */
export function runBacktest(
  candles: Candle[],
  btcCandles: Candle[] | null,
  mode: BacktestMode = "any",
): BacktestResult {
  return simulate(candles, (window) => {
    const i = window.length - 1;
    const lastClose = window[i].close;

    const rsiSeries = calcRSI(window);
    const bbSeries = calcBollingerBands(window);
    const lastBb = bbSeries[bbSeries.length - 1];

    const rsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : null;
    const bbPosition = lastBb ? bbSignal(lastClose, lastBb) : null;
    const macd = macdSignal(calcMACD(window));
    const volumeSpike = isVolumeSpike(window);
    const trend = trendSignal(window);

    let relativeStrength: ReturnType<typeof relativeStrengthSignal> = "inline";
    if (btcCandles && btcCandles.length > i) {
      const tokenWindow = window.slice(-RELATIVE_STRENGTH_WINDOW);
      const btcWindow = btcCandles.slice(0, i + 1).slice(-RELATIVE_STRENGTH_WINDOW);
      if (tokenWindow.length >= 2 && btcWindow.length >= 2) {
        relativeStrength = relativeStrengthSignal(tokenWindow, btcWindow);
      }
    }

    const { level } = computeOpportunityScore({ rsi, macd, bbPosition, volumeSpike, trend, relativeStrength });
    const isBuySignal = mode === "strongOnly" ? level === "strongBuy" : level === "buy" || level === "strongBuy";
    const isSellSignal = mode === "strongOnly" ? level === "strongSell" : level === "sell" || level === "strongSell";

    if (isBuySignal) return "buy";
    if (isSellSignal) return "sell";
    return "hold";
  });
}

const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;

/**
 * A much simpler baseline strategy than the full score: buy the first day
 * RSI(period) drops to/below 30 while flat, sell the first day it rises
 * to/above 70 while holding. Useful as a comparison point — if the full
 * score doesn't clearly beat plain RSI, the extra indicators (MACD,
 * Bollinger, trend, relative strength) aren't earning their complexity.
 */
export function runRsiOnlyBacktest(candles: Candle[], rsiPeriod: number): BacktestResult {
  return simulate(candles, (window) => {
    const rsiSeries = calcRSI(window, rsiPeriod);
    if (rsiSeries.length === 0) return "hold";
    const rsi = rsiSeries[rsiSeries.length - 1].value;
    if (rsi <= RSI_OVERSOLD) return "buy";
    if (rsi >= RSI_OVERBOUGHT) return "sell";
    return "hold";
  });
}
