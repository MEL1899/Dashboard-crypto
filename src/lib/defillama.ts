import type { ChainKey, IndicatorPoint } from "../types";

const BASE = "https://api.llama.fi";

export class ChainTvlDataError extends Error {}

const DEFILLAMA_CHAIN_SLUG: Record<ChainKey, string> = {
  eth: "Ethereum",
  bsc: "BSC",
  polygon: "Polygon",
  arbitrum: "Arbitrum",
  base: "Base",
};

interface ChainTvlRow {
  date: number; // unix seconds
  tvl: number;
}

export async function fetchChainTvlHistory(
  chain: ChainKey,
  days = 90,
): Promise<IndicatorPoint[]> {
  const slug = DEFILLAMA_CHAIN_SLUG[chain];
  const res = await fetch(`${BASE}/v2/historicalChainTvl/${slug}`);
  if (!res.ok) {
    throw new ChainTvlDataError(`DeFiLlama ${res.status}: ${res.statusText}`);
  }
  const rows = (await res.json()) as ChainTvlRow[];
  return rows.slice(-days).map((r) => ({ time: r.date, value: r.tvl }));
}
