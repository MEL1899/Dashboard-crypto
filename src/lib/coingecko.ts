import type { Candle, MarketToken } from "../types";

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
  ids: string[] = POPULAR_TOKENS,
  apiKey?: string,
): Promise<MarketToken[]> {
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
