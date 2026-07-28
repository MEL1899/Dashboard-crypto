export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketToken {
  id: string; // coingecko id
  symbol: string;
  name: string;
  image: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
}

export type ChainKey = "eth" | "bsc" | "polygon" | "arbitrum" | "base";

export interface ChainConfig {
  key: ChainKey;
  label: string;
  chainId: number;
  nativeSymbol: string;
  explorer: string;
}

export interface WalletTokenBalance {
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
}

export type TxDirection = "in" | "out";

export interface WalletTransaction {
  hash: string;
  timestamp: number;
  from: string;
  to: string;
  direction: TxDirection;
  asset: string;
  amount: number;
  type: "native" | "token";
}

export interface TradeInsights {
  totalTx: number;
  buys: number;
  sells: number;
  uniqueTokens: number;
  /** Gas spent, expressed in the chain's native token (not USD). */
  totalGasNative: number;
  mostActiveAsset: string | null;
  activityByDay: { date: string; count: number }[];
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface BollingerBands {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface AppSettings {
  etherscanApiKey: string;
  coingeckoApiKey: string;
  chain: ChainKey;
  walletAddress: string;
  tokenId: string;
  days: number;
}

export interface FundingRatePoint {
  time: number;
  rate: number; // fraction, e.g. 0.0001 = 0.01%
}

export interface OpenInterestPoint {
  time: number;
  value: number; // in base asset units
  valueUsd: number;
}

export interface LongShortRatioPoint {
  time: number;
  longAccountPct: number;
  shortAccountPct: number;
  ratio: number; // longAccountPct / shortAccountPct
}

export interface FearGreedPoint {
  time: number;
  value: number; // 0-100
  classification: string;
}

export interface DerivativesSnapshot {
  symbol: string | null; // Binance Futures symbol, null if unsupported asset
  markPrice: number | null;
  lastFundingRate: number | null;
  nextFundingTime: number | null;
  fundingHistory: FundingRatePoint[];
  openInterestHistory: OpenInterestPoint[];
  longShortHistory: LongShortRatioPoint[];
  fearGreed: FearGreedPoint[];
}
