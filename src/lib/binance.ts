import type { Candle, Timeframe } from "../types";

const BASE = "https://api.binance.com";

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

/** Real native candles at the exact requested granularity — no client-side bucketing needed. */
export async function fetchKlines(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const url = new URL(`${BASE}/api/v3/klines`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", timeframe);
  url.searchParams.set("limit", String(TIMEFRAME_LIMIT[timeframe]));

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
