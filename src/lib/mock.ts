import type {
  Candle,
  ChainKey,
  IndicatorPoint,
  MarketToken,
  Timeframe,
  TradeInsights,
  WalletTokenBalance,
  WalletTransaction,
} from "../types";
import type { WalletSnapshot } from "./etherscan";
import {
  bbSignal,
  calcBollingerBands,
  calcMACD,
  calcRSI,
  isVolumeSpike,
  macdSignal,
  relativeStrengthSignal,
  trendSignal,
  type RelativeStrengthSignal,
  type TrendSignal,
} from "./indicators";
import type { MacdSignal, BbPosition, SignalTimeframe } from "./indicators";

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

// Kept in sync with BINANCE_SPOT_SYMBOL (lib/binance.ts) — any token real
// data can resolve to a live exchange feed for should also get a plausible
// mock price here, not the unbounded synthetic fallback below.
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
  tron: { symbol: "TRX", name: "TRON", basePrice: 0.12 },
  litecoin: { symbol: "LTC", name: "Litecoin", basePrice: 85 },
  polkadot: { symbol: "DOT", name: "Polkadot", basePrice: 6.5 },
  uniswap: { symbol: "UNI", name: "Uniswap", basePrice: 9 },
  near: { symbol: "NEAR", name: "NEAR Protocol", basePrice: 5 },
  "shiba-inu": { symbol: "SHIB", name: "Shiba Inu", basePrice: 0.000018 },
  cosmos: { symbol: "ATOM", name: "Cosmos", basePrice: 7 },
  stellar: { symbol: "XLM", name: "Stellar", basePrice: 0.11 },
  filecoin: { symbol: "FIL", name: "Filecoin", basePrice: 5 },
  hyperliquid: { symbol: "HYPE", name: "Hyperliquid", basePrice: 35 },
  sui: { symbol: "SUI", name: "Sui", basePrice: 3.5 },
};

function seedFromString(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

/** Known tokens get realistic prices; anything else (user-searched) still gets a plausible synthetic entry. */
function mockTokenMeta(id: string): { symbol: string; name: string; basePrice: number } {
  if (MOCK_TOKEN_META[id]) return MOCK_TOKEN_META[id];
  const rng = mulberry32(seedFromString(id));
  const magnitude = 10 ** (rng() * 5 - 1); // ~0.1 to ~10,000
  return {
    symbol: id.slice(0, 5).toUpperCase(),
    name: id,
    basePrice: magnitude * (0.5 + rng()),
  };
}

/** Deterministic "current price" for a token, independent of timeframe, so
 * every view of the same asset (pills, table, chart) agrees on one value. */
function mockCurrentPrice(tokenId: string): number {
  const meta = mockTokenMeta(tokenId);
  const rng = mulberry32(seedFromString(tokenId));
  return meta.basePrice * (1 + (rng() - 0.5) * 0.02);
}

export function mockMarketTokens(ids: string[]): MarketToken[] {
  return ids.map((id) => {
    const meta = mockTokenMeta(id);
    const rng = mulberry32(seedFromString(id));
    const change24h = (rng() - 0.45) * 14;
    return {
      id,
      symbol: meta.symbol,
      name: meta.name,
      image: "",
      price: mockCurrentPrice(id),
      change24h,
      marketCap: meta.basePrice * 19_000_000 * (0.8 + rng() * 0.4),
      volume24h: meta.basePrice * 900_000 * (0.5 + rng()),
    };
  });
}

const TIMEFRAME_MOCK_CONFIG: Record<Timeframe, { points: number; stepSeconds: number }> = {
  "1h": { points: 168, stepSeconds: 3600 },
  "4h": { points: 180, stepSeconds: 4 * 3600 },
  "1d": { points: 180, stepSeconds: 86400 },
  "1w": { points: 156, stepSeconds: 7 * 86400 },
  "1M": { points: 96, stepSeconds: 30 * 86400 },
};

export function mockCandles(tokenId: string, timeframe: Timeframe): Candle[] {
  const meta = mockTokenMeta(tokenId);
  const { points, stepSeconds } = TIMEFRAME_MOCK_CONFIG[timeframe];
  const rng = mulberry32(seedFromString(tokenId) ^ seedFromString(timeframe));
  const now = Math.floor(Date.now() / 1000);

  const candles: Candle[] = [];
  let price = meta.basePrice * (0.75 + rng() * 0.2);

  for (let i = points; i >= 0; i--) {
    const time = now - i * stepSeconds;
    const drift = (rng() - 0.5) * 0.06;
    const open = price;
    const close = Math.max(0.0001, open * (1 + drift));
    const high = Math.max(open, close) * (1 + rng() * 0.015);
    const low = Math.min(open, close) * (1 - rng() * 0.015);
    const volume = meta.basePrice * 500_000 * (0.4 + rng());
    candles.push({ time, open, high, low, close, volume });
    price = close;
  }

  // Every timeframe gets its own randomly-shaped walk (that's realistic —
  // real 1h/4h/1d candles genuinely look different) but must all end at the
  // same current price, exactly like real data always does.
  const target = mockCurrentPrice(tokenId);
  const actualLastClose = candles[candles.length - 1].close;
  const scale = target / actualLastClose;
  for (const candle of candles) {
    candle.open *= scale;
    candle.high *= scale;
    candle.low *= scale;
    candle.close *= scale;
  }

  return candles;
}

/**
 * Mocked per-timeframe RSI+MACD+Bollinger, used as a fallback whenever the
 * real per-token fetch (useWatchlistSignals) fails, and as the instant
 * placeholder before real data has resolved. Computed with the real
 * indicator math off the same mockCandles used for the chart itself, so if
 * a token's chart also happens to be in fallback mode, its numbers here
 * agree with what the chart shows instead of coming from unrelated PRNGs.
 */
export function mockSignalsByTimeframe(tokenId: string): Record<
  SignalTimeframe,
  {
    rsi: number;
    macd: MacdSignal;
    bbPosition: BbPosition;
    volumeSpike: boolean;
    trend: TrendSignal;
    relativeStrength: RelativeStrengthSignal;
  }
> {
  const signalForTimeframe = (timeframe: SignalTimeframe) => {
    const candles = mockCandles(tokenId, timeframe);
    const rsiSeries = calcRSI(candles);
    const bbSeries = calcBollingerBands(candles);
    const lastCandle = candles[candles.length - 1];
    const lastBb = bbSeries[bbSeries.length - 1];
    return {
      rsi: rsiSeries.length > 0 ? Math.round(rsiSeries[rsiSeries.length - 1].value) : 50,
      macd: macdSignal(calcMACD(candles)),
      bbPosition: lastCandle && lastBb ? bbSignal(lastCandle.close, lastBb) : ("inside" as const),
      volumeSpike: isVolumeSpike(candles),
      trend: trendSignal(candles),
      relativeStrength:
        tokenId === "bitcoin"
          ? ("inline" as const)
          : relativeStrengthSignal(candles, mockCandles("bitcoin", timeframe)),
    };
  };
  return {
    "1h": signalForTimeframe("1h"),
    "4h": signalForTimeframe("4h"),
    "1d": signalForTimeframe("1d"),
    "1w": signalForTimeframe("1w"),
    "1M": signalForTimeframe("1M"),
  };
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

const CHAIN_TVL_BASE: Record<ChainKey, number> = {
  eth: 55_000_000_000,
  bsc: 5_500_000_000,
  polygon: 1_000_000_000,
  arbitrum: 2_800_000_000,
  base: 3_200_000_000,
};

export function mockChainTvl(chain: ChainKey, days = 90): IndicatorPoint[] {
  const rng = mulberry32(seedFromString(chain + ":tvl"));
  const now = Math.floor(Date.now() / 1000);
  let value = CHAIN_TVL_BASE[chain];
  const points: IndicatorPoint[] = [];
  for (let i = days; i >= 0; i--) {
    value = Math.max(1_000_000, value * (1 + (rng() - 0.48) * 0.03));
    points.push({ time: now - i * 86400, value });
  }
  return points;
}
