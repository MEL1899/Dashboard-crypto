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

type OhlcRow = [number, number, number, number, number]; // ts, o, h, l, c
type ChartSeries = [number, number][]; // ts, value

export async function fetchCandles(
  tokenId: string,
  days: number,
  apiKey?: string,
): Promise<Candle[]> {
  const ohlcUrl = withKey(new URL(`${BASE}/coins/${tokenId}/ohlc`), apiKey);
  ohlcUrl.searchParams.set("vs_currency", "usd");
  ohlcUrl.searchParams.set("days", String(days));

  const chartUrl = withKey(
    new URL(`${BASE}/coins/${tokenId}/market_chart`),
    apiKey,
  );
  chartUrl.searchParams.set("vs_currency", "usd");
  chartUrl.searchParams.set("days", String(days));

  const [ohlc, chart] = await Promise.all([
    getJson<OhlcRow[]>(ohlcUrl),
    getJson<{ total_volumes: ChartSeries }>(chartUrl),
  ]);

  const volumes = chart.total_volumes ?? [];

  return ohlc.map(([ts, open, high, low, close]) => {
    const volume = closestVolume(volumes, ts);
    return {
      time: Math.floor(ts / 1000),
      open,
      high,
      low,
      close,
      volume,
    };
  });
}

function closestVolume(series: ChartSeries, targetTs: number): number {
  if (series.length === 0) return 0;
  let best = series[0];
  let bestDiff = Math.abs(series[0][0] - targetTs);
  for (const point of series) {
    const diff = Math.abs(point[0] - targetTs);
    if (diff < bestDiff) {
      best = point;
      bestDiff = diff;
    }
  }
  return best[1];
}

/**
 * CoinGecko's free OHLC endpoint auto-picks its own candle width from `days`
 * and can't be forced to 1h/4h. For those timeframes we instead pull the
 * raw price/volume series (auto-hourly for a 2-90 day window) and bucket it
 * into real OHLC candles ourselves.
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

  if (timeframe === "1d") {
    return fetchCandles(tokenId, lookbackDays, apiKey);
  }

  const chartUrl = withKey(new URL(`${BASE}/coins/${tokenId}/market_chart`), apiKey);
  chartUrl.searchParams.set("vs_currency", "usd");
  chartUrl.searchParams.set("days", String(lookbackDays));

  const chart = await getJson<{ prices: ChartSeries; total_volumes: ChartSeries }>(chartUrl);
  return bucketToCandles(chart.prices ?? [], chart.total_volumes ?? [], bucketSeconds);
}
