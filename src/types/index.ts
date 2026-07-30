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

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export type Timeframe = "1h" | "4h" | "1d" | "1w" | "1M";

export interface AppSettings {
  etherscanApiKey: string;
  coingeckoApiKey: string;
  chain: ChainKey;
  walletAddress: string;
  watchlist: string[];
  /** Subset of `watchlist` the user has marked as actually held, not just
   * watched — purely a manual tag, no quantities or values tracked. */
  portfolio: string[];
  selectedTokenId: string;
  timeframe: Timeframe;
}
