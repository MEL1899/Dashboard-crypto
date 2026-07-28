import type {
  Candle,
  DerivativesSnapshot,
  FearGreedPoint,
  MarketToken,
  TradeInsights,
  WalletTokenBalance,
  WalletTransaction,
} from "../types";
import type { WalletSnapshot } from "./etherscan";
import { symbolForToken } from "./binanceFutures";

// Deterministic PRNG so demo mode looks the same across reloads/screenshots.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_TOKEN_META: Record<
  string,
  { symbol: string; name: string; basePrice: number }
> = {
  bitcoin: { symbol: "BTC", name: "Bitcoin", basePrice: 68000 },
  ethereum: { symbol: "ETH", name: "Ethereum", basePrice: 3500 },
  solana: { symbol: "SOL", name: "Solana", basePrice: 165 },
  binancecoin: { symbol: "BNB", name: "BNB", basePrice: 590 },
  ripple: { symbol: "XRP", name: "XRP", basePrice: 0.62 },
  cardano: { symbol: "ADA", name: "Cardano", basePrice: 0.45 },
  dogecoin: { symbol: "DOGE", name: "Dogecoin", basePrice: 0.15 },
  "polygon-ecosystem-token": { symbol: "POL", name: "Polygon", basePrice: 0.55 },
  chainlink: { symbol: "LINK", name: "Chainlink", basePrice: 14.5 },
  "avalanche-2": { symbol: "AVAX", name: "Avalanche", basePrice: 35 },
};

function seedFromString(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

export function mockMarketTokens(ids: string[]): MarketToken[] {
  return ids
    .filter((id) => MOCK_TOKEN_META[id])
    .map((id) => {
      const meta = MOCK_TOKEN_META[id];
      const rng = mulberry32(seedFromString(id));
      const change24h = (rng() - 0.45) * 14;
      return {
        id,
        symbol: meta.symbol,
        name: meta.name,
        image: "",
        price: meta.basePrice * (1 + (rng() - 0.5) * 0.02),
        change24h,
        marketCap: meta.basePrice * 19_000_000 * (0.8 + rng() * 0.4),
        volume24h: meta.basePrice * 900_000 * (0.5 + rng()),
      };
    });
}

export function mockCandles(tokenId: string, days: number): Candle[] {
  const meta = MOCK_TOKEN_META[tokenId] ?? {
    symbol: "TKN",
    name: tokenId,
    basePrice: 100,
  };
  const rng = mulberry32(seedFromString(tokenId) ^ days);
  const points = Math.max(30, Math.min(days, 180));
  const now = Math.floor(Date.now() / 1000);
  const dayStep = 86400;

  const candles: Candle[] = [];
  let price = meta.basePrice * (0.75 + rng() * 0.2);

  for (let i = points; i >= 0; i--) {
    const time = now - i * dayStep;
    const drift = (rng() - 0.5) * 0.06;
    const open = price;
    const close = Math.max(0.0001, open * (1 + drift));
    const high = Math.max(open, close) * (1 + rng() * 0.015);
    const low = Math.min(open, close) * (1 - rng() * 0.015);
    const volume = meta.basePrice * 500_000 * (0.4 + rng());
    candles.push({ time, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

const MOCK_TOKENS_HELD = ["USDC", "UNI", "AAVE", "PEPE", "ARB"];

export function mockWalletSnapshot(address: string, chain: string): WalletSnapshot {
  const rng = mulberry32(seedFromString(address + chain));
  const now = Math.floor(Date.now() / 1000);

  const transactions: WalletTransaction[] = Array.from({ length: 40 }).map(
    (_, i) => {
      const direction = rng() > 0.5 ? "in" : "out";
      const isToken = rng() > 0.35;
      const asset = isToken
        ? MOCK_TOKENS_HELD[Math.floor(rng() * MOCK_TOKENS_HELD.length)]
        : chain === "eth" || chain === "arbitrum" || chain === "base"
          ? "ETH"
          : chain === "bsc"
            ? "BNB"
            : "POL";
      return {
        hash: `0x${seedFromString(address).toString(16).padStart(6, "0").slice(0, 6)}${(rng() * 1e10).toString(16).padStart(8, "0").slice(0, 8)}${(i + 1).toString(16).padStart(4, "0")}`,
        timestamp: now - i * (3600 * (4 + Math.floor(rng() * 20))),
        from: direction === "out" ? address : `0x${(rng() * 1e16).toString(16).slice(0, 8)}...`,
        to: direction === "in" ? address : `0x${(rng() * 1e16).toString(16).slice(0, 8)}...`,
        direction,
        asset,
        amount: isToken ? rng() * 500 : rng() * 2,
        type: isToken ? "token" : "native",
      };
    },
  );

  const holdings: WalletTokenBalance[] = [
    { contract: "native", symbol: "ETH", name: "Ether", decimals: 18, balance: 1.2 + rng() * 3 },
    ...MOCK_TOKENS_HELD.map((symbol) => ({
      contract: symbol.toLowerCase(),
      symbol,
      name: symbol,
      decimals: 18,
      balance: rng() * 1200,
    })),
  ].sort((a, b) => b.balance - a.balance);

  const activityMap = new Map<string, number>();
  for (const tx of transactions) {
    const date = new Date(tx.timestamp * 1000).toISOString().slice(0, 10);
    activityMap.set(date, (activityMap.get(date) ?? 0) + 1);
  }
  const activityByDay = Array.from(activityMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const buys = transactions.filter((t) => t.direction === "in").length;
  const sells = transactions.filter((t) => t.direction === "out").length;
  const assetCounts = new Map<string, number>();
  for (const tx of transactions) {
    assetCounts.set(tx.asset, (assetCounts.get(tx.asset) ?? 0) + 1);
  }
  let mostActiveAsset: string | null = null;
  let maxCount = 0;
  for (const [asset, count] of assetCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostActiveAsset = asset;
    }
  }

  const insights: TradeInsights = {
    totalTx: transactions.length,
    buys,
    sells,
    uniqueTokens: new Set(transactions.map((t) => t.asset)).size,
    totalGasNative: 0.004 + rng() * 0.03,
    mostActiveAsset,
    activityByDay,
  };

  return {
    nativeBalance: holdings[0].balance,
    transactions,
    holdings,
    insights,
  };
}

const FNG_LABELS = [
  { max: 24, label: "Medo Extremo" },
  { max: 44, label: "Medo" },
  { max: 55, label: "Neutro" },
  { max: 75, label: "Ganância" },
  { max: 101, label: "Ganância Extrema" },
];

function classifyFng(value: number): string {
  return FNG_LABELS.find((b) => value <= b.max)!.label;
}

export function mockFearGreed(days = 30): FearGreedPoint[] {
  const rng = mulberry32(0xf6ee6);
  const now = Math.floor(Date.now() / 1000);
  let value = 45;
  const points: FearGreedPoint[] = [];
  for (let i = days; i >= 0; i--) {
    value = Math.min(95, Math.max(5, value + (rng() - 0.5) * 14));
    points.push({
      time: now - i * 86400,
      value: Math.round(value),
      classification: classifyFng(value),
    });
  }
  return points;
}

export function mockDerivatives(tokenId: string): DerivativesSnapshot {
  const symbol = symbolForToken(tokenId);
  const rng = mulberry32(seedFromString(tokenId + ":deriv"));
  const now = Math.floor(Date.now() / 1000);
  const hourStep = 3600;
  const points = 60;

  const fundingHistory = Array.from({ length: points }).map((_, i) => ({
    time: now - (points - i) * (8 * hourStep),
    rate: (rng() - 0.5) * 0.0012,
  }));

  let oiBase = 50_000 + rng() * 200_000;
  const openInterestHistory = Array.from({ length: points }).map((_, i) => {
    oiBase = Math.max(1000, oiBase * (1 + (rng() - 0.5) * 0.04));
    return {
      time: now - (points - i) * hourStep,
      value: oiBase,
      valueUsd: oiBase * (MOCK_TOKEN_META[tokenId]?.basePrice ?? 100),
    };
  });

  const longShortHistory = Array.from({ length: points }).map((_, i) => {
    const longPct = 45 + rng() * 20;
    const shortPct = 100 - longPct;
    return {
      time: now - (points - i) * hourStep,
      longAccountPct: longPct,
      shortAccountPct: shortPct,
      ratio: longPct / shortPct,
    };
  });

  const lastFunding = fundingHistory[fundingHistory.length - 1];

  return {
    symbol,
    markPrice: MOCK_TOKEN_META[tokenId]?.basePrice ?? null,
    lastFundingRate: lastFunding?.rate ?? null,
    nextFundingTime: now + hourStep * (rng() * 8),
    fundingHistory,
    openInterestHistory,
    longShortHistory,
    fearGreed: mockFearGreed(),
  };
}
