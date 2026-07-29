import type { Candle, MarketToken, Timeframe } from "../types";

const BASE = "https://api.coingecko.com/api/v3";

export class MarketDataError extends Error {}

function withKey(url: URL, apiKey?: string) {
  if (apiKey) url.searchParams.set("x_cg_demo_api_key", apiKey);
  return url;
}

async function getJson<T>(url: URL): Promise<T> {
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new MarketDataError(`CoinGecko ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const POPULAR_TOKENS = [
  "bitcoin",
  "ethereum",
  "solana",
  "binancecoin",
  "ripple",
  "cardano",
  "dogecoin",
  "polygon-ecosystem-token",
  "chainlink",
  "avalanche-2",
];

interface CoinGeckoMarketRow {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
}

export async function fetchMarketTokens(
  ids: string[],
  apiKey?: string,
): Promise<MarketToken[]> {
  if (ids.length === 0) return [];

  const url = withKey(new URL(`${BASE}/coins/markets`), apiKey);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("price_change_percentage", "24h");

  const rows = await getJson<CoinGeckoMarketRow[]>(url);
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol.toUpperCase(),
    name: r.name,
    image: r.image,
    price: r.current_price,
    change24h: r.price_change_percentage_24h ?? 0,
    marketCap: r.market_cap,
    volume24h: r.total_volume,
  }));
}

export interface GlobalMarketData {
  totalMarketCap: number;
  totalMarketCapChange24h: number;
  btcDominance: number;
}

interface CoinGeckoGlobalResponse {
  data: {
    total_market_cap: { usd: number };
    market_cap_change_percentage_24h_usd: number;
    market_cap_percentage: { btc: number };
  };
}

/** Free, no-key aggregate endpoint: total market cap, its 24h change, and BTC dominance. */
export async function fetchGlobalMarketData(apiKey?: string): Promise<GlobalMarketData> {
  const url = withKey(new URL(`${BASE}/global`), apiKey);
  const { data } = await getJson<CoinGeckoGlobalResponse>(url);
  return {
    totalMarketCap: data.total_market_cap.usd,
    totalMarketCapChange24h: data.market_cap_change_percentage_24h_usd,
    btcDominance: data.market_cap_percentage.btc,
  };
}

export interface TokenSearchResult {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
}

export async function searchTokens(
  query: string,
  apiKey?: string,
): Promise<TokenSearchResult[]> {
  if (!query.trim()) return [];
  const url = withKey(new URL(`${BASE}/search`), apiKey);
  url.searchParams.set("query", query);
  const data = await getJson<{ coins: TokenSearchResult[] }>(url);
  return data.coins.slice(0, 8);
}

type ChartSeries = [number, number][]; // ts, value

/**
 * CoinGecko's free OHLC endpoint auto-picks its own candle width from `days`
 * (e.g. 4-day buckets once `days` passes ~30), which made the "1D" chart's
 * last candle up to 4 days stale compared to the live price shown elsewhere.
 * So every timeframe instead pulls the raw price/volume series (auto-hourly
 * for a 2-90 day window, daily beyond that) and gets bucketed into OHLC
 * candles ourselves — always ending at the most recent data point.
 */
function bucketToCandles(
  prices: ChartSeries,
  volumes: ChartSeries,
  bucketSeconds: number,
): Candle[] {
  const buckets = new Map<number, { prices: number[]; time: number }>();

  for (const [tsMs, price] of prices) {
    const tsSec = Math.floor(tsMs / 1000);
    const bucketStart = Math.floor(tsSec / bucketSeconds) * bucketSeconds;
    const bucket = buckets.get(bucketStart) ?? { prices: [], time: bucketStart };
    bucket.prices.push(price);
    buckets.set(bucketStart, bucket);
  }

  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => a.time - b.time);

  return sortedBuckets.map((bucket, i) => {
    const open = i > 0 ? sortedBuckets[i - 1].prices.at(-1)! : bucket.prices[0];
    const close = bucket.prices.at(-1)!;
    return {
      time: bucket.time,
      open,
      high: Math.max(open, close, ...bucket.prices),
      low: Math.min(open, close, ...bucket.prices),
      close,
      volume: sumVolumeInRange(volumes, bucket.time, bucket.time + bucketSeconds),
    };
  });
}

function sumVolumeInRange(volumes: ChartSeries, fromSec: number, toSec: number): number {
  let sum = 0;
  for (const [tsMs, vol] of volumes) {
    const tsSec = tsMs / 1000;
    if (tsSec >= fromSec && tsSec < toSec) sum += vol;
  }
  return sum;
}

const TIMEFRAME_CONFIG: Record<Timeframe, { lookbackDays: number; bucketSeconds: number }> = {
  "1h": { lookbackDays: 7, bucketSeconds: 3600 },
  "4h": { lookbackDays: 30, bucketSeconds: 4 * 3600 },
  "1d": { lookbackDays: 180, bucketSeconds: 86400 },
};

export async function fetchCandlesForTimeframe(
  tokenId: string,
  timeframe: Timeframe,
  apiKey?: string,
): Promise<Candle[]> {
  const { lookbackDays, bucketSeconds } = TIMEFRAME_CONFIG[timeframe];

  const chartUrl = withKey(new URL(`${BASE}/coins/${tokenId}/market_chart`), apiKey);
  chartUrl.searchParams.set("vs_currency", "usd");
  chartUrl.searchParams.set("days", String(lookbackDays));

  const chart = await getJson<{ prices: ChartSeries; total_volumes: ChartSeries }>(chartUrl);
  return bucketToCandles(chart.prices ?? [], chart.total_volumes ?? [], bucketSeconds);
}
