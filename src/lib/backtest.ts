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

/** Why a trade closed: "stop"/"target" fired intraday off the position's own
 * SL/TP levels, "signal" means the opposite signal flipped the position
 * first, "end" means it was still open when the simulated window ran out. */
export type ExitReason = "stop" | "target" | "signal" | "end";

export interface BacktestTrade {
  type: "long" | "short";
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  returnPct: number;
  exitReason: ExitReason;
  /** Running strategy equity right after this trade closed, on the same
   * "started at 100" basis as the equity curve — e.g. 100 → 111 reads as
   * "started with 100% of the stake, ended with 111%". */
  equityAfter: number;
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

// Support/resistance is read off the lowest low / highest high of the last
// 20 daily candles (a Donchian-style channel) as of entry day — simple,
// causal (never looks past "today"), and close enough to how a discretionary
// trader would eyeball recent structure.
const SR_LOOKBACK = 20;
// A stop derived straight from support/resistance can be absurdly close
// (whipsaw risk) or absurdly far (barely a stop at all) depending on recent
// structure, so it's clamped into a sane 3%-15% band around entry.
const MIN_STOP_PCT = 3;
const MAX_STOP_PCT = 15;
// If the nearest resistance/support is closer than this multiple of the
// stop distance, the target is extended to it instead — no point risking
// more than you stand to gain.
const MIN_REWARD_RISK_RATIO = 2;
// Only a fraction of equity is committed to any single trade; the rest sits
// out, so one stopped-out trade can only ever cost a bounded slice of the
// account instead of being able to compound into a full wipeout.
export const POSITION_SIZE_PCT = 50;

/** "buy" opens/keeps a long, "sell" opens/keeps a short, "hold" leaves
 * whatever position (long, short, or flat) untouched. */
type SignalAction = "buy" | "sell" | "hold";
/** Decides what to do given every candle up to and including "today" (the
 * last element of `window`) — never anything past it, so a signal function
 * can't accidentally peek into the future. */
type SignalFn = (window: Candle[]) => SignalAction;

interface OpenPosition {
  type: "long" | "short";
  entryTime: number;
  entryPrice: number;
  stopPrice: number;
  takeProfitPrice: number;
}

/** % return of one position at a given price — long profits as price rises,
 * short profits as price falls. No leverage, no fees/slippage modeled. */
function positionReturnPct(position: OpenPosition, price: number): number {
  return position.type === "long"
    ? ((price - position.entryPrice) / position.entryPrice) * 100
    : ((position.entryPrice - price) / position.entryPrice) * 100;
}

/** Equity multiplier for one position's return, applied only to the
 * allocated slice of equity (see POSITION_SIZE_PCT) and floored at 0 — an
 * unleveraged position can lose its full allocation but (in this simplified
 * model, no margin calls) never more than that. */
function equityFactor(returnPct: number, allocationFraction: number): number {
  return Math.max(0, 1 - allocationFraction + allocationFraction * (1 + returnPct / 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Lowest low / highest high over the last SR_LOOKBACK candles of `window`
 * (window already ends at "today", so this never looks ahead). */
function supportResistance(window: Candle[]): { support: number; resistance: number } {
  const slice = window.slice(-SR_LOOKBACK);
  let support = Infinity;
  let resistance = -Infinity;
  for (const candle of slice) {
    if (candle.low < support) support = candle.low;
    if (candle.high > resistance) resistance = candle.high;
  }
  return { support, resistance };
}

/** Places a stop just past the nearest support/resistance (clamped to a
 * sane distance) and a target at the next support/resistance level, or
 * further out if that level is too close to be worth the risk. */
function computeStopAndTarget(
  type: "long" | "short",
  entryPrice: number,
  window: Candle[],
): { stopPrice: number; takeProfitPrice: number } {
  const { support, resistance } = supportResistance(window);
  const minStopDistance = (entryPrice * MIN_STOP_PCT) / 100;
  const maxStopDistance = (entryPrice * MAX_STOP_PCT) / 100;

  if (type === "long") {
    const rawStopDistance = entryPrice - support;
    const stopDistance = clamp(rawStopDistance > 0 ? rawStopDistance : minStopDistance, minStopDistance, maxStopDistance);
    const rawTargetDistance = resistance - entryPrice;
    const targetDistance = Math.max(rawTargetDistance > 0 ? rawTargetDistance : 0, stopDistance * MIN_REWARD_RISK_RATIO);
    return { stopPrice: entryPrice - stopDistance, takeProfitPrice: entryPrice + targetDistance };
  }

  const rawStopDistance = resistance - entryPrice;
  const stopDistance = clamp(rawStopDistance > 0 ? rawStopDistance : minStopDistance, minStopDistance, maxStopDistance);
  const rawTargetDistance = entryPrice - support;
  const targetDistance = Math.max(rawTargetDistance > 0 ? rawTargetDistance : 0, stopDistance * MIN_REWARD_RISK_RATIO);
  return { stopPrice: entryPrice + stopDistance, takeProfitPrice: entryPrice - targetDistance };
}

/**
 * Shared trade-simulation engine, long AND short: on a "buy" signal it
 * opens a long if flat, or flips a short straight into a long; a "sell"
 * signal does the mirror image (open/flip to short). "hold" leaves
 * whatever's open alone. Every entry gets a stop-loss and take-profit
 * derived from recent support/resistance, checked against each subsequent
 * day's own high/low before that day's signal is even evaluated — so a
 * position can exit on a bad day without waiting for the signal to catch
 * up. Only a fraction of equity (POSITION_SIZE_PCT) is ever at risk in one
 * trade. Tracks equity/drawdown/buy-and-hold alongside it. Both
 * runBacktest (the full score) and runRsiOnlyBacktest (RSI alone) are just
 * this loop with a different `signal`.
 */
function simulate(candles: Candle[], signal: SignalFn): BacktestResult {
  if (candles.length <= WARMUP_INDEX) return EMPTY_RESULT;

  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestPoint[] = [];

  let equity = 100;
  // Deliberately assigned only with direct, inline `position = ...`
  // statements in the loop below (never inside a nested function) — nested
  // functions that write to it are literally not visible to TypeScript's
  // control-flow analysis, which then can't ever prove it non-null again.
  let position: OpenPosition | null = null;
  const startPrice = candles[WARMUP_INDEX].close;
  const allocationFraction = POSITION_SIZE_PCT / 100;

  // Books a closed trade's equity impact and record; does NOT touch
  // `position` itself, so every call site clears it inline right after.
  function recordTrade(closed: OpenPosition, exitTime: number, exitPrice: number, exitReason: ExitReason) {
    const returnPct = positionReturnPct(closed, exitPrice);
    equity *= equityFactor(returnPct, allocationFraction);
    trades.push({
      type: closed.type,
      entryTime: closed.entryTime,
      entryPrice: closed.entryPrice,
      exitTime,
      exitPrice,
      returnPct,
      exitReason,
      equityAfter: equity,
    });
  }

  for (let i = WARMUP_INDEX; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const today = window[window.length - 1];
    const lastClose = today.close;
    const time = today.time;

    // A position opened on a previous day gets checked against today's own
    // high/low first, before today's signal is even evaluated — this lets
    // a stop/target fire on a day the signal itself never flips. If both
    // levels fall inside today's range, the stop is assumed to hit first
    // (the conservative assumption, since intraday order is unknown).
    if (position) {
      const stopped = position.type === "long" ? today.low <= position.stopPrice : today.high >= position.stopPrice;
      const targetHit =
        position.type === "long" ? today.high >= position.takeProfitPrice : today.low <= position.takeProfitPrice;
      if (stopped) {
        recordTrade(position, time, position.stopPrice, "stop");
        position = null;
      } else if (targetHit) {
        recordTrade(position, time, position.takeProfitPrice, "target");
        position = null;
      }
    }

    const action = signal(window);
    if (action === "buy" && position?.type !== "long") {
      if (position) recordTrade(position, time, lastClose, "signal");
      const { stopPrice, takeProfitPrice } = computeStopAndTarget("long", lastClose, window);
      position = { type: "long", entryTime: time, entryPrice: lastClose, stopPrice, takeProfitPrice };
    } else if (action === "sell" && position?.type !== "short") {
      if (position) recordTrade(position, time, lastClose, "signal");
      const { stopPrice, takeProfitPrice } = computeStopAndTarget("short", lastClose, window);
      position = { type: "short", entryTime: time, entryPrice: lastClose, stopPrice, takeProfitPrice };
    }

    equityCurve.push({
      time,
      equity: position
        ? equity * equityFactor(positionReturnPct(position, lastClose), allocationFraction)
        : equity,
      buyHoldEquity: (lastClose / startPrice) * 100,
    });
  }

  // Still positioned at the end of the window — close it out for a clean
  // final number instead of leaving it as an unrealized, open position.
  if (position) {
    const last = candles[candles.length - 1];
    recordTrade(position, last.time, last.close, "end");
    position = null;
  }

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
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
 * Simulates the opportunity score's Compra/Venda levels as a swing-trade
 * rule against real historical daily candles, long AND short: the first
 * day the score reads Compra/Compra Forte it opens (or flips into) a long;
 * the first day it reads Venda/Venda Forte it opens (or flips into) a
 * short — so the strategy can profit from a falling market too, not just
 * sit in cash while the score says sell. Each day's score is computed only
 * from candles up to and including that day — never a peek into the
 * future.
 *
 * This intentionally simplifies the live app's 5-timeframe confluence down
 * to a single daily timeframe: getting deep 1h/4h/1w/1M history for the
 * same historical window isn't practical from these free APIs, so a
 * faithful multi-timeframe backtest isn't possible here. No fees, slippage,
 * or leverage are modeled either. Treat the result as a directional check
 * on whether the underlying signal has any edge at all, not a precise
 * replay of the live score, and remember past performance doesn't
 * guarantee future results.
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
 * A much simpler baseline strategy than the full score: goes long (or
 * flips into a long) the first day RSI(period) drops to/below 30, goes
 * short (or flips into a short) the first day it rises to/above 70 — same
 * long/short capability as runBacktest. Useful as a comparison point: if
 * the full score doesn't clearly beat plain RSI, the extra indicators
 * (MACD, Bollinger, trend, relative strength) aren't earning their
 * complexity.
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
