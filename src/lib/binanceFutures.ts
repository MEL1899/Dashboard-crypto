import type { FundingRatePoint, LongShortRatioPoint, OpenInterestPoint } from "../types";

const BASE = "https://fapi.binance.com";

export class DerivativesDataError extends Error {}

/** CoinGecko id -> Binance USDT-M perpetual symbol. null = no futures market. */
export const BINANCE_FUTURES_SYMBOL: Record<string, string | null> = {
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
};

export function symbolForToken(tokenId: string): string | null {
  return BINANCE_FUTURES_SYMBOL[tokenId] ?? null;
}

async function getJson<T>(url: URL): Promise<T> {
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new DerivativesDataError(`Binance Futures ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

interface PremiumIndexRow {
  markPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

export async function fetchPremiumIndex(symbol: string): Promise<{
  markPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
}> {
  const url = new URL(`${BASE}/fapi/v1/premiumIndex`);
  url.searchParams.set("symbol", symbol);
  const row = await getJson<PremiumIndexRow>(url);
  return {
    markPrice: Number(row.markPrice),
    lastFundingRate: Number(row.lastFundingRate),
    nextFundingTime: Math.floor(row.nextFundingTime / 1000),
  };
}

interface FundingRateRow {
  fundingTime: number;
  fundingRate: string;
}

export async function fetchFundingRateHistory(
  symbol: string,
  limit = 60,
): Promise<FundingRatePoint[]> {
  const url = new URL(`${BASE}/fapi/v1/fundingRate`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", String(limit));
  const rows = await getJson<FundingRateRow[]>(url);
  return rows.map((r) => ({
    time: Math.floor(r.fundingTime / 1000),
    rate: Number(r.fundingRate),
  }));
}

interface OpenInterestHistRow {
  timestamp: number;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
}

export async function fetchOpenInterestHistory(
  symbol: string,
  period: "5m" | "15m" | "1h" | "4h" | "1d" = "1h",
  limit = 60,
): Promise<OpenInterestPoint[]> {
  const url = new URL(`${BASE}/futures/data/openInterestHist`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("period", period);
  url.searchParams.set("limit", String(limit));
  const rows = await getJson<OpenInterestHistRow[]>(url);
  return rows.map((r) => ({
    time: Math.floor(r.timestamp / 1000),
    value: Number(r.sumOpenInterest),
    valueUsd: Number(r.sumOpenInterestValue),
  }));
}

interface LongShortRatioRow {
  timestamp: number;
  longAccount: string;
  shortAccount: string;
  longShortRatio: string;
}

export async function fetchLongShortRatio(
  symbol: string,
  period: "5m" | "15m" | "1h" | "4h" | "1d" = "1h",
  limit = 60,
): Promise<LongShortRatioPoint[]> {
  const url = new URL(`${BASE}/futures/data/globalLongShortAccountRatio`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("period", period);
  url.searchParams.set("limit", String(limit));
  const rows = await getJson<LongShortRatioRow[]>(url);
  return rows.map((r) => ({
    time: Math.floor(r.timestamp / 1000),
    longAccountPct: Number(r.longAccount) * 100,
    shortAccountPct: Number(r.shortAccount) * 100,
    ratio: Number(r.longShortRatio),
  }));
}
