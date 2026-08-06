import type { Candle } from "../types";
import {
  bbSignal,
  calcBollingerBands,
  calcMACD,
  calcRSI,
  calcSMA,
  isVolumeSpike,
  macdSignal,
  relativeStrengthSignal,
  trendSignal,
} from "./indicators";
import { computeOpportunityScore } from "./opportunityScore";
import type { ScoreWeightConfig } from "./score/config";
import { MAX_RISK_PER_TRADE_PCT, MIN_RISK_PER_TRADE_PCT } from "./score/riskManagement";
import { classifyScore as classifySignalScore, computeSignalScore } from "./score/signalScore";

/** Why a trade closed: "stop"/"target" fired intraday off the position's own
 * SL/TP levels, "signal" means the opposite signal flipped the position
 * first, "end" means it was still open when the simulated window ran out. */
export type ExitReason = "stop" | "trail" | "target" | "signal" | "end";

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
  /** Average net return per trade, in % of the traded position. The single
   * most honest summary of whether the rule has an edge: positive means
   * each trade is worth taking on average, negative means every extra
   * trade destroys money no matter how good the win rate looks. */
  expectancyPct: number;
  /** Win rate this strategy would need just to break even, given the
   * average size of its own wins vs losses. Compare against `winRate`:
   * below it = losing by construction. */
  breakevenWinRate: number;
  /** Total round-trip cost (fees + slippage) charged across all trades, in
   * % of the traded position — how much of the result the exchange ate. */
  totalCostPct: number;
  /** Signals declined for offering too little reward for their risk. Always
   * 0 unless the reward-to-risk entry filter is on. Makes a thin run
   * legible: few trades because the filter rejected most setups is a very
   * different story from few trades because the signal rarely fired. */
  rejectedEntries: number;
}

const EMPTY_RESULT: BacktestResult = {
  trades: [],
  equityCurve: [],
  strategyReturnPct: 0,
  buyHoldReturnPct: 0,
  winRate: 0,
  maxDrawdownPct: 0,
  expectancyPct: 0,
  breakevenWinRate: 0,
  totalCostPct: 0,
  rejectedEntries: 0,
};

/** Candle granularity the backtest can run on — a subset of the app's full
 * Timeframe type, since a swing-trade backtest over 1w/1M candles wouldn't
 * produce enough trades to mean anything. */
export type BacktestTimeframe = "1h" | "4h" | "1d";

const RELATIVE_STRENGTH_WINDOW = 20;
// Needs enough candles for every indicator to produce a real read — the
// binding constraint is the trend filter's 50-period SMA. Expressed in
// candles (bars), not calendar time, same as real indicator periods — 50
// candles is ~2 days on 1h, ~8 days on 4h, ~50 days on 1d.
const WARMUP_INDEX = 50;

// Support/resistance is read off the lowest low / highest high of the last
// 20 candles (a Donchian-style channel) as of entry day — simple, causal
// (never looks past "today"), and close enough to how a discretionary
// trader would eyeball recent structure. Also in candles, not calendar
// time, for the same reason as WARMUP_INDEX.
const SR_LOOKBACK = 20;
// A stop derived straight from support/resistance can be absurdly close
// (whipsaw risk) or absurdly far (barely a stop at all) depending on recent
// structure, so it's clamped into a sane band around entry — sized per
// timeframe, since a 3% move is a routine daily swing but a huge move on an
// hourly candle. Scaled roughly by sqrt(time) from the 1d bounds (standard
// volatility-scaling rule of thumb): 4h is ~1/6 of a day, 1h is ~1/24.
const STOP_BOUNDS_PCT: Record<BacktestTimeframe, { min: number; max: number }> = {
  "1d": { min: 3, max: 15 },
  "4h": { min: 1.5, max: 7 },
  "1h": { min: 0.75, max: 3.5 },
};
// If the nearest resistance/support is closer than this multiple of the
// stop distance, the target is extended to it instead — no point risking
// more than you stand to gain.
const MIN_REWARD_RISK_RATIO = 2;
/**
 * Risk per trade, as a % of equity — the doc's rule (section 4), and the
 * same band the risk panel shows the user.
 *
 * Position size is DERIVED from this and the stop distance rather than
 * being a fixed slice of the account: a 3%-away stop gets a third of
 * equity, a 15%-away stop gets a fifteenth, and either way exactly this
 * much is at stake. That is the whole point of the 1-2% guideline, and a
 * fixed allocation quietly breaks it — at 50% allocation a 15% stop costs
 * 7.5% of the account, nearly four times the recommended maximum, so the
 * backtest was measuring a far more aggressive strategy than the product
 * tells the user to run.
 *
 * The band itself lives in score/riskManagement.ts so the panel and the
 * simulation can never drift apart.
 */
export const DEFAULT_RISK_PER_TRADE_PCT = MIN_RISK_PER_TRADE_PCT;

/**
 * What is allowed to close an open position.
 *
 * - "flipOnSignal": the opposite signal closes at market and reverses.
 * - "stopAndTargetOnly": only the stop, the take-profit, or the end of the
 *   window. The signal can open a position but never closes one.
 *
 * Both are currently defective, in opposite directions, and neither should
 * be trusted until the target-placement problem below is resolved.
 *
 * "flipOnSignal" cuts winners short. Measured on real BTC daily candles, 7
 * of 9 trades exited on the opposite signal and the take-profit never fired
 * once — winners closed at whatever price the signal happened to turn at
 * while losers ran to the full stop. The break-even win rate came out at
 * 60% instead of the 33% a 1:2 stop/target implies: the system advertised
 * one risk-reward and delivered another.
 *
 * "stopAndTargetOnly" was written to fix that and instead degenerates. On a
 * 300-candle synthetic series it produced just 2 trades, because the target
 * is placed at 2x the stop distance (computeStopAndTarget takes the MAX of
 * "distance to resistance" and "2x stop"), and the stop itself comes from a
 * 20-period Donchian channel that can be 13% wide. A target 26% away is
 * simply not reachable in one leg, so positions open and then sit until the
 * window ends. That is buy-and-hold wearing a costume, not a strategy.
 *
 * The shared root cause is target placement, not the exit rule: a minimum
 * reward-to-risk enforced by pushing the target further out produces
 * targets that never pay. The textbook alternative is the reverse — put the
 * target at the real resistance level and simply decline entries whose
 * resulting reward-to-risk is below the minimum. That is an entry filter,
 * a bigger behavioural change, and it needs measuring on real data before
 * being chosen.
 *
 * Default stays "flipOnSignal" deliberately: it is the variant that has an
 * actual measurement behind it, and swapping in an unmeasured default that
 * trades twice in a year would be a silent regression.
 */
export type ExitPolicy = "stopAndTargetOnly" | "flipOnSignal";

export const DEFAULT_EXIT_POLICY: ExitPolicy = "flipOnSignal";

/**
 * Trailing stop: once a trade has moved far enough in your favour, the stop
 * follows the price instead of staying where it started, so a winner can
 * keep running while its downside keeps shrinking.
 *
 * This is what makes an exit rule work without relying on a distant target.
 * With `activationR: 1` and `trailFactor: 1` the stop reaches break-even
 * exactly when the trade is up 1R, and rises past it from there — the
 * "stop positivo" that turns a good trade into one that can no longer lose.
 *
 * The stop only ever tightens, never loosens: giving a trade back room it
 * already earned is how a winner becomes a loser.
 */
export interface TrailingStopConfig {
  /** Favourable movement, in multiples of the initial stop distance (R),
   * required before the stop starts moving at all. */
  activationR: number;
  /** Once active, the stop trails this many R behind the best price seen. */
  trailFactor: number;
}

export const DEFAULT_TRAILING_STOP: TrailingStopConfig = { activationR: 1, trailFactor: 1 };

// Real trading isn't free, and pretending it is flatters short-horizon
// strategies enormously: a rule that trades every other candle can look
// profitable gross and still bleed to death on fees. Charged per leg, so a
// full round trip costs twice this.
//   - Binance spot taker is 0.1%; a market order that has to cross the
//     spread and walk the book costs more on top, hence the slippage term.
//   - Both are deliberately on the pessimistic side. A backtest that
//     survives pessimistic costs is worth something; one that only works
//     at zero cost is a chart, not a strategy.
export const FEE_PCT_PER_LEG = 0.1;
export const SLIPPAGE_PCT_PER_LEG = 0.05;
/** Full round-trip cost of one trade (entry leg + exit leg). */
export const ROUND_TRIP_COST_PCT = (FEE_PCT_PER_LEG + SLIPPAGE_PCT_PER_LEG) * 2;

/** "buy" opens/keeps a long, "sell" opens/keeps a short, "hold" leaves
 * whatever position (long, short, or flat) untouched. */
type SignalAction = "buy" | "sell" | "hold";

/**
 * Time series that can't be derived from OHLCV — Fear & Greed, MVRV,
 * funding rate — keyed by metric id, each sorted ascending by time. They
 * update on their own cadence (Fear & Greed is daily, funding every 8h),
 * so they're aligned onto the candle timeline rather than assumed to match
 * it one-for-one.
 */
export interface ExternalSeriesInput {
  [metricId: string]: { time: number; value: number }[];
}

/** What a signal function gets to see on a given candle. */
export interface SignalContext {
  /** Every candle up to and including "today" — never anything past it. */
  window: Candle[];
  /** Each external series' most recent value at or before this candle's
   * timestamp, or null if the series hadn't started yet. */
  external: Record<string, number | null>;
}

/** Decides what to do from the current context — which by construction
 * contains nothing dated after the current candle, so a signal function
 * can't accidentally peek into the future. */
type SignalFn = (ctx: SignalContext) => SignalAction;

/**
 * Projects each external series onto the candle timeline: for candle i, the
 * last series value dated at or before candles[i].time.
 *
 * "At or before" is the whole no-lookahead guarantee for external data —
 * a Fear & Greed reading published on the 5th must never be visible to the
 * 4th's decision. Uses one forward-moving pointer per series rather than a
 * search per candle, so aligning is linear in the total number of points
 * instead of quadratic.
 */
export function alignExternalSeries(
  candles: Candle[],
  series: ExternalSeriesInput,
): Record<string, number | null>[] {
  const keys = Object.keys(series);
  const sorted: Record<string, { time: number; value: number }[]> = {};
  for (const key of keys) sorted[key] = [...series[key]].sort((a, b) => a.time - b.time);

  const cursors: Record<string, number> = {};
  for (const key of keys) cursors[key] = 0;

  return candles.map((candle) => {
    const row: Record<string, number | null> = {};
    for (const key of keys) {
      const points = sorted[key];
      while (cursors[key] < points.length && points[cursors[key]].time <= candle.time) {
        cursors[key]++;
      }
      // cursors[key] now sits one past the last usable point.
      row[key] = cursors[key] > 0 ? points[cursors[key] - 1].value : null;
    }
    return row;
  });
}

interface OpenPosition {
  type: "long" | "short";
  entryTime: number;
  entryPrice: number;
  /** Moves as the trailing stop tightens; never loosens. */
  stopPrice: number;
  takeProfitPrice: number;
  /** Distance from entry to the ORIGINAL stop — one "R", the unit the
   * trailing rule is expressed in. Kept separate because stopPrice moves. */
  initialRisk: number;
  /** Fraction of equity committed, fixed at entry from the stop distance.
   * Never re-sized mid-trade: the trailing stop moves the exit, not the
   * bet you already placed. */
  allocationFraction: number;
  /** Best price seen in the trade's favour since entry. */
  bestPrice: number;
  /** True once the trailing stop has moved at least once, so a resulting
   * exit can be reported as "trail" rather than "stop". */
  trailing: boolean;
}

/**
 * The stop's new location given the best price reached so far, or null if
 * it shouldn't move yet. Returns a tightened stop only — the caller keeps
 * the old one whenever this would give room back.
 *
 * The cost buffer is what makes the "stop positivo" genuinely positive: a
 * stop exactly at the entry price still loses the round-trip fee, so
 * break-even is placed just past it.
 */
/**
 * Fraction of equity to commit so that being stopped out costs exactly
 * `riskPerTradePct` of the account — the doc's position-sizing rule, worked
 * backwards from where "wrong" sits.
 *
 * Capped at 1: a stop closer than the risk budget would imply borrowing,
 * and nothing here models leverage. When the cap binds, the trade simply
 * risks less than budgeted, which is the safe direction to err.
 */
function allocationForRisk(entryPrice: number, stopPrice: number, riskPerTradePct: number): number {
  const stopDistancePct = (Math.abs(entryPrice - stopPrice) / entryPrice) * 100;
  if (stopDistancePct <= 0) return 0;
  return Math.min(1, riskPerTradePct / stopDistancePct);
}

function trailingStopPrice(position: OpenPosition, trail: TrailingStopConfig): number | null {
  const { entryPrice, initialRisk, bestPrice, type } = position;
  if (initialRisk <= 0) return null;

  const progressR = type === "long" ? (bestPrice - entryPrice) / initialRisk : (entryPrice - bestPrice) / initialRisk;
  if (progressR < trail.activationR) return null;

  const costBuffer = entryPrice * (ROUND_TRIP_COST_PCT / 100);
  const candidate =
    type === "long"
      ? Math.max(bestPrice - trail.trailFactor * initialRisk, entryPrice + costBuffer)
      : Math.min(bestPrice + trail.trailFactor * initialRisk, entryPrice - costBuffer);

  // Tighten only.
  if (type === "long") return candidate > position.stopPrice ? candidate : null;
  return candidate < position.stopPrice ? candidate : null;
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
 * sane, timeframe-appropriate distance) and a target at the next
 * support/resistance level, or further out if that level is too close to
 * be worth the risk. */
function computeStopAndTarget(
  type: "long" | "short",
  entryPrice: number,
  window: Candle[],
  timeframe: BacktestTimeframe,
  /**
   * When true the target is placed at the real support/resistance level and
   * the setup is REJECTED (null) if that level is closer than
   * MIN_REWARD_RISK_RATIO times the stop. When false the legacy behaviour
   * applies: the target is stretched to whichever is further, the level or
   * the ratio, and no setup is ever rejected.
   *
   * OFF BY DEFAULT, and measurement is why. This filter was written to fix
   * the unreachable-target problem and measured far worse than what it
   * replaced: on a 600-candle synthetic series it rejected 245 of ~259
   * signals and the 14 that passed produced a 0% win rate and -19.9%,
   * against +17.4% for the stretched target.
   *
   * The mechanism is worth understanding before anyone tries this again.
   * Requiring reward >= 2x risk is easiest to satisfy when the risk is
   * SMALL, so the filter systematically selects the setups with the
   * tightest stops — and after the [3%, 15%] clamp, a "tight" stop is one
   * sitting 3% away, which ordinary noise takes out almost immediately.
   * An unguarded reward-to-risk filter is not a quality filter; it is a
   * tight-stop filter, and tight stops are the ones noise kills.
   */
  requireMinRewardRisk = false,
): { stopPrice: number; takeProfitPrice: number } | null {
  const { support, resistance } = supportResistance(window);
  const bounds = STOP_BOUNDS_PCT[timeframe];
  const minStopDistance = (entryPrice * bounds.min) / 100;
  const maxStopDistance = (entryPrice * bounds.max) / 100;

  const towardStop = type === "long" ? entryPrice - support : resistance - entryPrice;
  const towardTarget = type === "long" ? resistance - entryPrice : entryPrice - support;

  const stopDistance = clamp(towardStop > 0 ? towardStop : minStopDistance, minStopDistance, maxStopDistance);

  let targetDistance: number;
  if (requireMinRewardRisk) {
    // Target the level that actually exists. If price would have to travel
    // further to pay than it risks losing by the required multiple, this
    // simply isn't a setup worth taking — decline it rather than moving the
    // goalposts to a price the market never reaches.
    if (towardTarget <= 0) return null;
    if (towardTarget < stopDistance * MIN_REWARD_RISK_RATIO) return null;
    targetDistance = towardTarget;
  } else {
    targetDistance = Math.max(towardTarget > 0 ? towardTarget : 0, stopDistance * MIN_REWARD_RISK_RATIO);
  }

  return type === "long"
    ? { stopPrice: entryPrice - stopDistance, takeProfitPrice: entryPrice + targetDistance }
    : { stopPrice: entryPrice + stopDistance, takeProfitPrice: entryPrice - targetDistance };
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
function simulate(
  candles: Candle[],
  signal: SignalFn,
  timeframe: BacktestTimeframe,
  external: ExternalSeriesInput = {},
  exitPolicy: ExitPolicy = DEFAULT_EXIT_POLICY,
  /** null disables trailing entirely (the original fixed-stop behaviour). */
  trailingStop: TrailingStopConfig | null = null,
  /** Turns the minimum reward-to-risk into an entry filter instead of a
   * target stretcher — see computeStopAndTarget. */
  requireMinRewardRisk = false,
  /** % of equity risked per trade; clamped to the 1-2% band. */
  riskPerTradePct: number = DEFAULT_RISK_PER_TRADE_PCT,
): BacktestResult {
  if (candles.length <= WARMUP_INDEX) return EMPTY_RESULT;

  // How many signals were declined for offering too little reward for their
  // risk. Reported so a run that barely trades is legible as "the filter is
  // too strict" rather than "the signal never fired".
  let rejectedEntries = 0;

  const alignedExternal = alignExternalSeries(candles, external);

  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestPoint[] = [];

  let equity = 100;
  // Deliberately assigned only with direct, inline `position = ...`
  // statements in the loop below (never inside a nested function) — nested
  // functions that write to it are literally not visible to TypeScript's
  // control-flow analysis, which then can't ever prove it non-null again.
  let position: OpenPosition | null = null;
  const startPrice = candles[WARMUP_INDEX].close;
  const riskPct = clamp(riskPerTradePct, MIN_RISK_PER_TRADE_PCT, MAX_RISK_PER_TRADE_PCT);

  // Books a closed trade's equity impact and record; does NOT touch
  // `position` itself, so every call site clears it inline right after.
  // returnPct is net of the full round-trip cost, so every number the UI
  // shows downstream (per-trade return, equity, win rate, expectancy) is
  // already what the account would actually have seen.
  function recordTrade(closed: OpenPosition, exitTime: number, exitPrice: number, exitReason: ExitReason) {
    const returnPct = positionReturnPct(closed, exitPrice) - ROUND_TRIP_COST_PCT;
    equity *= equityFactor(returnPct, closed.allocationFraction);
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
        // A stop that has already trailed is reported separately: exiting
        // at a stop dragged into profit is a different outcome from being
        // stopped out at the original risk, and lumping them together
        // would hide the trailing rule's whole contribution.
        recordTrade(position, time, position.stopPrice, position.trailing ? "trail" : "stop");
        position = null;
      } else if (targetHit) {
        recordTrade(position, time, position.takeProfitPrice, "target");
        position = null;
      }
    }

    // Only now — after this candle's stop check used the level the position
    // came in with — does the trail move, taking effect from the next
    // candle on. Updating it first would quietly assume the favourable
    // extreme happened before the adverse one within the same bar.
    if (position && trailingStop) {
      position.bestPrice =
        position.type === "long" ? Math.max(position.bestPrice, today.high) : Math.min(position.bestPrice, today.low);
      const tightened = trailingStopPrice(position, trailingStop);
      if (tightened !== null) {
        position.stopPrice = tightened;
        position.trailing = true;
      }
    }

    const action = signal({ window, external: alignedExternal[i] });

    // Under "stopAndTargetOnly" an open position is left alone no matter
    // what the signal says — only the stop, the target or the end of the
    // window can close it. Under "flipOnSignal" the opposite signal closes
    // it at market and reverses. See ExitPolicy for why the default moved.
    // These locals are annotated, and `side` is derived from the signal
    // rather than from the open position, purely to keep TypeScript's
    // control-flow analysis out of a cycle: `position` is reassigned a few
    // lines down, so any expression that both reads it and feeds that
    // assignment makes its type unresolvable (TS7022 / never).
    const current: OpenPosition | null = position;
    const signalMayClose: boolean = exitPolicy === "flipOnSignal";
    const canAct: boolean = current === null || signalMayClose;
    const side: "long" | "short" | null =
      action === "buy" ? "long" : action === "sell" ? "short" : null;

    if (side !== null && canAct && current?.type !== side) {
      const levels = computeStopAndTarget(side, lastClose, window, timeframe, requireMinRewardRisk);
      // A rejected setup leaves any existing position exactly as it was:
      // declining a new trade is not a reason to abandon a live one.
      if (levels) {
        if (current) recordTrade(current, time, lastClose, "signal");
        const { stopPrice, takeProfitPrice } = levels;
        // Annotated rather than inferred: letting TypeScript derive this
        // literal's type from `position` is what closes the cycle that
        // collapses `position` to never.
        const opened: OpenPosition = {
          type: side,
          entryTime: time,
          entryPrice: lastClose,
          stopPrice,
          takeProfitPrice,
          initialRisk: side === "long" ? lastClose - stopPrice : stopPrice - lastClose,
          allocationFraction: allocationForRisk(lastClose, stopPrice, riskPct),
          bestPrice: lastClose,
          trailing: false,
        };
        position = opened;
      } else {
        rejectedEntries++;
      }
    }

    equityCurve.push({
      time,
      equity: position
        ? equity * equityFactor(positionReturnPct(position, lastClose), position.allocationFraction)
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

  const winners = trades.filter((t) => t.returnPct > 0);
  const losers = trades.filter((t) => t.returnPct <= 0);
  const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.returnPct, 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, t) => s + t.returnPct, 0) / losers.length) : 0;
  // Solve P·avgWin = (1−P)·avgLoss for P — the win rate at which wins
  // exactly pay for losses. With no losers yet there's nothing to break
  // even against, so the requirement is 0.
  const breakevenWinRate = avgWin + avgLoss > 0 ? (avgLoss / (avgWin + avgLoss)) * 100 : 0;

  return {
    trades,
    equityCurve,
    strategyReturnPct: equity - 100,
    buyHoldReturnPct: ((candles[candles.length - 1].close - startPrice) / startPrice) * 100,
    winRate: trades.length > 0 ? (winners.length / trades.length) * 100 : 0,
    maxDrawdownPct,
    expectancyPct: trades.length > 0 ? trades.reduce((s, t) => s + t.returnPct, 0) / trades.length : 0,
    breakevenWinRate,
    totalCostPct: trades.length * ROUND_TRIP_COST_PCT,
    rejectedEntries,
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
 * to a single chosen timeframe (1h/4h/1d) at a time: a faithful
 * multi-timeframe confluence backtest isn't practical from these free
 * APIs. No fees or slippage are modeled either. Treat the result as a
 * directional check on whether the underlying signal has any edge at all,
 * not a precise replay of the live score, and remember past performance
 * doesn't guarantee future results.
 */
export function runBacktest(
  candles: Candle[],
  btcCandles: Candle[] | null,
  mode: BacktestMode = "any",
  timeframe: BacktestTimeframe = "1d",
  exitPolicy: ExitPolicy = DEFAULT_EXIT_POLICY,
  trailingStop: TrailingStopConfig | null = null,
  requireMinRewardRisk = false,
): BacktestResult {
  return simulate(
    candles,
    ({ window }) => {
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
    },
    timeframe,
    {},
    exitPolicy,
    trailingStop,
    requireMinRewardRisk,
  );
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
export function runRsiOnlyBacktest(
  candles: Candle[],
  rsiPeriod: number,
  timeframe: BacktestTimeframe = "1d",
  exitPolicy: ExitPolicy = DEFAULT_EXIT_POLICY,
): BacktestResult {
  return simulate(
    candles,
    ({ window }) => {
      const rsiSeries = calcRSI(window, rsiPeriod);
      if (rsiSeries.length === 0) return "hold";
      const rsi = rsiSeries[rsiSeries.length - 1].value;
      if (rsi <= RSI_OVERSOLD) return "buy";
      if (rsi >= RSI_OVERBOUGHT) return "sell";
      return "hold";
    },
    timeframe,
    {},
    exitPolicy,
  );
}

/** Small deterministic PRNG so a baseline run is reproducible — the same
 * token and window always draw the same coin flips, otherwise the
 * comparison would shift every time the page re-rendered. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * The control group: coin-flip entries, with the exact same stop-loss,
 * take-profit, position sizing and costs as the real strategies. It knows
 * nothing about price — so whatever return it produces is what this
 * market, over this window, hands out for free to someone with good risk
 * management and zero predictive skill.
 *
 * This is the honest yardstick, and a far harsher one than buy & hold: a
 * signal that can't beat random entries has no demonstrated edge, and any
 * profit it shows is the risk management working, not the indicators. Note
 * that with a 1:2 risk-reward the coin flip is expected to land near
 * break-even *before* costs (the odds of touching +2R before −1R in a
 * driftless market are about 1/3, exactly the break-even win rate), so
 * after fees the baseline should print a small loss. A strategy needs to
 * clear that bar, not just clear zero.
 *
 * `tradeFrequency` should be the real strategy's own trades-per-candle
 * rate, so the baseline pays a comparable amount of cost — a coin flip
 * that trades 10x less often would win on fees alone and prove nothing.
 */
export function runRandomBaseline(
  candles: Candle[],
  tradeFrequency: number,
  seed: string,
  timeframe: BacktestTimeframe = "1d",
  /** Must match the strategy being compared against: a control group that
   * exits differently isn't a control for the signal, it's a control for
   * the exit rule. */
  exitPolicy: ExitPolicy = DEFAULT_EXIT_POLICY,
): BacktestResult {
  const rng = mulberry32(seedFromString(seed));
  return simulate(
    candles,
    () => {
      if (rng() > tradeFrequency) return "hold";
      return rng() < 0.5 ? "buy" : "sell";
    },
    timeframe,
    {},
    exitPolicy,
  );
}

/** Bollinger %b: 0 = price at the lower band, 1 = at the upper. */
function percentB(price: number, band: { upper: number; lower: number }): number | null {
  const width = band.upper - band.lower;
  if (width <= 0) return null;
  return (price - band.lower) / width;
}

/**
 * Backtests the layered opportunity score (lib/score) rather than the older
 * inline one, so the new formula can be measured against the same random
 * baseline that the old score failed.
 *
 * Two honest limitations, both structural rather than bugs:
 *
 *  - Only ONE timeframe's RSI is available, because the backtest replays a
 *    single candle series. The multi-timeframe blend the live score uses
 *    can't be reproduced here; the run's own timeframe fills its slot and
 *    combineRsi renormalizes over what's present.
 *  - On-chain metrics only participate if the caller supplies their history
 *    in `external`. Without it the on-chain group drops out entirely and
 *    the score is built from technical + sentiment, with `coverage`
 *    reporting how much of the formula actually ran.
 */
export function runScoreBacktest(
  candles: Candle[],
  options: {
    timeframe?: BacktestTimeframe;
    mode?: BacktestMode;
    /** Histories keyed by score metric id: "fearGreed", "mvrvZScore", … */
    external?: ExternalSeriesInput;
    /** Swaps the weight/direction config — used by the direction A/B. */
    config?: ScoreWeightConfig;
    exitPolicy?: ExitPolicy;
    trailingStop?: TrailingStopConfig | null;
    requireMinRewardRisk?: boolean;
  } = {},
): BacktestResult {
  const {
    timeframe = "1d",
    mode = "any",
    external = {},
    config,
    exitPolicy = DEFAULT_EXIT_POLICY,
    trailingStop = null,
    requireMinRewardRisk = false,
  } = options;

  return simulate(
    candles,
    ({ window, external: ext }) => {
      const i = window.length - 1;
      const lastClose = window[i].close;

      const rsiSeries = calcRSI(window);
      const rsiValue = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : null;

      const bbSeries = calcBollingerBands(window);
      const lastBb = bbSeries[bbSeries.length - 1];

      const macdSeries = calcMACD(window);
      const lastMacd = macdSeries[macdSeries.length - 1];

      // Long-EMA proxy: the 50-period SMA the trend filter already uses,
      // expressed as the price's distance from it in %.
      const smaSeries = calcSMA(window, 50);
      const lastSma = smaSeries[smaSeries.length - 1];

      const { score } = computeSignalScore(
        {
          rsi: {
            "1h": timeframe === "1h" ? rsiValue : null,
            "4h": timeframe === "4h" ? rsiValue : null,
            "1d": timeframe === "1d" ? rsiValue : null,
          },
          bollingerPercentB: lastBb ? percentB(lastClose, lastBb) : null,
          macdHistogram: lastMacd ? (lastMacd.histogram / lastClose) * 100 : null,
          emaDistance: lastSma ? ((lastClose - lastSma.value) / lastSma.value) * 100 : null,
          mvrvZScore: ext.mvrvZScore,
          fundingRate: ext.fundingRate,
          exchangeNetflow: ext.exchangeNetflow,
          fearGreed: ext.fearGreed,
        },
        "unknown",
        config,
      );

      const level = classifySignalScore(score);
      const isBuy = mode === "strongOnly" ? level === "strongBuy" : level === "buy" || level === "strongBuy";
      const isSell = mode === "strongOnly" ? level === "strongSell" : level === "sell" || level === "strongSell";

      if (isBuy) return "buy";
      if (isSell) return "sell";
      return "hold";
    },
    timeframe,
    external,
    exitPolicy,
    trailingStop,
    requireMinRewardRisk,
  );
}
