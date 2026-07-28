import { CHAINS } from "./chains";
import type {
  ChainKey,
  TradeInsights,
  WalletTokenBalance,
  WalletTransaction,
} from "../types";

const BASE = "https://api.etherscan.io/v2/api";

export class OnChainDataError extends Error {}

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T;
}

async function callApi<T>(
  chain: ChainKey,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const url = new URL(BASE);
  url.searchParams.set("chainid", String(CHAINS[chain].chainId));
  url.searchParams.set("apikey", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new OnChainDataError(`Etherscan ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as EtherscanResponse<T>;

  // Etherscan returns status "0" both for genuine errors and for "no records found".
  if (json.status === "0" && typeof json.result === "string") {
    const msg = json.result;
    if (msg.toLowerCase().includes("no transactions found")) {
      return [] as unknown as T;
    }
    throw new OnChainDataError(msg || json.message);
  }
  return json.result;
}

interface NormalTxRow {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  isError: string;
  gasUsed: string;
  gasPrice: string;
}

interface TokenTxRow {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: string;
}

export async function fetchNativeBalance(
  address: string,
  chain: ChainKey,
  apiKey: string,
): Promise<number> {
  const result = await callApi<string>(
    chain,
    { module: "account", action: "balance", address, tag: "latest" },
    apiKey,
  );
  return Number(result) / 1e18;
}

export async function fetchNormalTx(
  address: string,
  chain: ChainKey,
  apiKey: string,
  limit = 100,
): Promise<NormalTxRow[]> {
  return callApi<NormalTxRow[]>(
    chain,
    {
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: String(limit),
      sort: "desc",
    },
    apiKey,
  );
}

export async function fetchTokenTx(
  address: string,
  chain: ChainKey,
  apiKey: string,
  limit = 100,
): Promise<TokenTxRow[]> {
  return callApi<TokenTxRow[]>(
    chain,
    {
      module: "account",
      action: "tokentx",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: String(limit),
      sort: "desc",
    },
    apiKey,
  );
}

export interface WalletSnapshot {
  nativeBalance: number;
  transactions: WalletTransaction[];
  holdings: WalletTokenBalance[];
  insights: TradeInsights;
}

export async function loadWalletSnapshot(
  address: string,
  chain: ChainKey,
  apiKey: string,
): Promise<WalletSnapshot> {
  const addr = address.toLowerCase();
  const [nativeBalance, normalTx, tokenTx] = await Promise.all([
    fetchNativeBalance(address, chain, apiKey),
    fetchNormalTx(address, chain, apiKey),
    fetchTokenTx(address, chain, apiKey),
  ]);

  const nativeSymbol = CHAINS[chain].nativeSymbol;

  const nativeTransactions: WalletTransaction[] = normalTx
    .filter((tx) => tx.isError === "0" && Number(tx.value) > 0)
    .map((tx) => ({
      hash: tx.hash,
      timestamp: Number(tx.timeStamp),
      from: tx.from,
      to: tx.to,
      direction: tx.to.toLowerCase() === addr ? "in" : "out",
      asset: nativeSymbol,
      amount: Number(tx.value) / 1e18,
      gasUsd: undefined,
      type: "native",
    }));

  const tokenTransactions: WalletTransaction[] = tokenTx.map((tx) => ({
    hash: tx.hash,
    timestamp: Number(tx.timeStamp),
    from: tx.from,
    to: tx.to,
    direction: tx.to.toLowerCase() === addr ? "in" : "out",
    asset: tx.tokenSymbol,
    amount: Number(tx.value) / 10 ** Number(tx.tokenDecimal || "18"),
    type: "token",
  }));

  const transactions = [...nativeTransactions, ...tokenTransactions].sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  const holdings = estimateHoldings(tokenTx, addr, nativeBalance, nativeSymbol);
  const insights = buildTradeInsights(transactions, normalTx);

  return { nativeBalance, transactions, holdings, insights };
}

/**
 * Net balance per token derived from the fetched transfer window (not a
 * true on-chain balance call) — good enough for a holdings breakdown
 * without issuing one balance request per contract.
 */
function estimateHoldings(
  tokenTx: TokenTxRow[],
  address: string,
  nativeBalance: number,
  nativeSymbol: string,
): WalletTokenBalance[] {
  const byContract = new Map<string, WalletTokenBalance>();

  for (const tx of tokenTx) {
    const key = tx.contractAddress;
    const decimals = Number(tx.tokenDecimal || "18");
    const amount = Number(tx.value) / 10 ** decimals;
    const delta = tx.to.toLowerCase() === address ? amount : -amount;

    if (!byContract.has(key)) {
      byContract.set(key, {
        contract: key,
        symbol: tx.tokenSymbol,
        name: tx.tokenName,
        decimals,
        balance: 0,
      });
    }
    const entry = byContract.get(key)!;
    entry.balance += delta;
  }

  const holdings = [
    {
      contract: "native",
      symbol: nativeSymbol,
      name: nativeSymbol,
      decimals: 18,
      balance: nativeBalance,
    },
    ...Array.from(byContract.values()).filter((h) => h.balance > 0),
  ];

  return holdings.sort((a, b) => b.balance - a.balance);
}

function buildTradeInsights(
  transactions: WalletTransaction[],
  normalTx: NormalTxRow[],
): TradeInsights {
  const buys = transactions.filter((t) => t.direction === "in").length;
  const sells = transactions.filter((t) => t.direction === "out").length;
  const uniqueTokens = new Set(transactions.map((t) => t.asset)).size;

  const totalGasNative = normalTx.reduce((sum, tx) => {
    if (tx.isError !== "0") return sum;
    const gas = (Number(tx.gasUsed) * Number(tx.gasPrice)) / 1e18;
    return sum + gas;
  }, 0);

  const activityMap = new Map<string, number>();
  for (const tx of transactions) {
    const date = new Date(tx.timestamp * 1000).toISOString().slice(0, 10);
    activityMap.set(date, (activityMap.get(date) ?? 0) + 1);
  }
  const activityByDay = Array.from(activityMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

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

  return {
    totalTx: transactions.length,
    buys,
    sells,
    uniqueTokens,
    totalGasNative,
    mostActiveAsset,
    activityByDay,
  };
}
