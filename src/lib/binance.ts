import type { Candle, Timeframe } from "../types";

const BASE = "https://api.binance.com";
/** Perpetuals live on a separate host from spot. */
const FUTURES_BASE = "https://fapi.binance.com";
/** Funding settles every 8 hours. */
const FUNDING_WINDOWS_PER_DAY = 3;

export class BinanceDataError extends Error {}

/**
 * CoinGecko id -> Binance spot USDT pair, for the tokens we're confident
 * about (long-established pairs). This is the ground-truth price source:
 * whenever a token has a mapping here, its price/ticker/chart all come from
 * this single exchange feed instead of mixing sources that can disagree.
 */
export const BINANCE_SPOT_SYMBOL: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  solana: "SOLUSDT",
  binancecoin: "BNBUSDT",
  ripple: "XRPUSDT",
  cardano: "ADAUSDT",
  dogecoin: "DOGEUSDT",
  "polygon-ecosystem-token": "POLUSDT",
  chainlink: "LINKUSDT",
  "avalanche-2": "AVAXUSDT",
  tron: "TRXUSDT",
  litecoin: "LTCUSDT",
  polkadot: "DOTUSDT",
  uniswap: "UNIUSDT",
  near: "NEARUSDT",
  "shiba-inu": "SHIBUSDT",
  cosmos: "ATOMUSDT",
  stellar: "XLMUSDT",
  filecoin: "FILUSDT",
  sui: "SUIUSDT",
  // hyperliquid intentionally NOT mapped: unverified whether "HYPEUSDT" is
  // actually a real Binance pair, and an invalid symbol here means every
  // candle/RSI fetch for it silently fails and falls back to mock — worse
  // than just routing it through the CoinGecko path, which is confirmed
  // working (its price already tracks real quotes closely). Re-add only
  // once confirmed against Binance's actual symbol list.
};

export function symbolForToken(tokenId: string): string | null {
  return BINANCE_SPOT_SYMBOL[tokenId] ?? null;
}

async function getJson<T>(url: URL): Promise<T> {
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new BinanceDataError(`Binance ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const TIMEFRAME_LIMIT: Record<Timeframe, number> = {
  "1h": 168, // ~7 days
  "4h": 180, // ~30 days
  "1d": 180, // ~6 months
  "1w": 260, // ~5 years
  "1M": 120, // ~10 years
};

// [openTime, open, high, low, close, volume, closeTime, ...]
type KlineRow = [number, string, string, string, string, string, ...unknown[]];

/** Real native candles at the exact requested granularity — no client-side
 * bucketing needed. `limitOverride` lets a caller ask for more history than
 * the live chart needs (e.g. the backtest tab) — Binance allows up to 1000
 * candles per request regardless of interval. */
export async function fetchKlines(
  symbol: string,
  timeframe: Timeframe,
  limitOverride?: number,
): Promise<Candle[]> {
  const url = new URL(`${BASE}/api/v3/klines`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", timeframe);
  url.searchParams.set("limit", String(limitOverride ?? TIMEFRAME_LIMIT[timeframe]));

  const rows = await getJson<KlineRow[]>(url);
  return rows.map((r) => ({
    time: Math.floor(r[0] / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

export interface SpotTicker {
  price: number;
  change24h: number;
  volume24h: number;
}

interface Ticker24hRow {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

/**
 * Perpetual funding rate, as a % PER DAY.
 *
 * The API reports the rate for a single 8-hour funding window, so it is
 * multiplied by three to express a daily cost — which is the unit the
 * score's clip range (+/-0.05%) is written in. Reporting the raw 8h figure
 * against a daily range would understate crowding by a factor of three.
 *
 * Lives on the futures host, which is a different base URL from spot but
 * equally public and key-free. Only tokens with a Binance mapping have a
 * perpetual; everything else returns null and drops out of the score.
 */
export async function fetchFundingRateDailyPct(symbol: string): Promise<number | null> {
  const url = new URL(`${FUTURES_BASE}/fapi/v1/premiumIndex`);
  url.searchParams.set("symbol", symbol);

  try {
    const row = await getJson<{ lastFundingRate?: string }>(url);
    const perWindow = Number(row.lastFundingRate);
    if (!Number.isFinite(perWindow)) return null;
    return perWindow * FUNDING_WINDOWS_PER_DAY * 100;
  } catch {
    // A token can be listed on spot without a perpetual, which is a 400
    // here rather than an outage — not worth surfacing as an error.
    return null;
  }
}

export interface FundingPoint {
  /** Unix seconds — the moment the funding was settled, so it is known
   * from that instant onward and never before. */
  time: number;
  /** % per day, the same unit the score's clip range is written in. */
  value: number;
}

/**
 * Historical funding, oldest first, as % per day.
 *
 * Exists so the backtest can include the on-chain group at all. Without it
 * the group had no metric, dropped out entirely, and the backtest silently
 * measured a two-group score while the app displayed a three-group one —
 * a 12-point gap on the same candles.
 *
 * Binance caps a single call at 1000 records; at one settlement every 8
 * hours that is roughly 333 days, which covers a daily backtest and
 * overshoots the shorter timeframes. Paginating further is possible but
 * not worth it until the histories elsewhere are longer too.
 */
export async function fetchFundingRateHistory(symbol: string, limit = 1000): Promise<FundingPoint[]> {
  const url = new URL(`${FUTURES_BASE}/fapi/v1/fundingRate`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", String(Math.min(limit, 1000)));

  const rows = await getJson<{ fundingTime?: number; fundingRate?: string }[]>(url);
  return rows
    .map((row) => ({
      time: Math.floor(Number(row.fundingTime) / 1000),
      value: Number(row.fundingRate) * FUNDING_WINDOWS_PER_DAY * 100,
    }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time);
}

/** Batched live ticker for however many symbols we need in one call. */
export async function fetchTickers(symbols: string[]): Promise<Record<string, SpotTicker>> {
  if (symbols.length === 0) return {};

  const url = new URL(`${BASE}/api/v3/ticker/24hr`);
  url.searchParams.set("symbols", JSON.stringify(symbols));

  const rows = await getJson<Ticker24hRow[]>(url);
  const out: Record<string, SpotTicker> = {};
  for (const row of rows) {
    out[row.symbol] = {
      price: Number(row.lastPrice),
      change24h: Number(row.priceChangePercent ?? 0),
      volume24h: Number(row.quoteVolume),
    };
  }
  return out;
}
