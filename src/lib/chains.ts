import type { ChainConfig, ChainKey } from "../types";

export const CHAINS: Record<ChainKey, ChainConfig> = {
  eth: {
    key: "eth",
    label: "Ethereum",
    chainId: 1,
    nativeSymbol: "ETH",
    explorer: "https://etherscan.io",
  },
  bsc: {
    key: "bsc",
    label: "BNB Chain",
    chainId: 56,
    nativeSymbol: "BNB",
    explorer: "https://bscscan.com",
  },
  polygon: {
    key: "polygon",
    label: "Polygon",
    chainId: 137,
    nativeSymbol: "POL",
    explorer: "https://polygonscan.com",
  },
  arbitrum: {
    key: "arbitrum",
    label: "Arbitrum",
    chainId: 42161,
    nativeSymbol: "ETH",
    explorer: "https://arbiscan.io",
  },
  base: {
    key: "base",
    label: "Base",
    chainId: 8453,
    nativeSymbol: "ETH",
    explorer: "https://basescan.org",
  },
};

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}
