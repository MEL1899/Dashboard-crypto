import { useEffect, useState } from "react";
import { loadWalletSnapshot, type WalletSnapshot } from "../lib/etherscan";
import { mockWalletSnapshot } from "../lib/mock";
import { isValidEvmAddress } from "../lib/chains";
import type { ChainKey } from "../types";

interface WalletState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  snapshot: WalletSnapshot | null;
}

export function useWallet(address: string, chain: ChainKey, apiKey: string) {
  const [state, setState] = useState<WalletState>({
    loading: false,
    isDemo: false,
    error: null,
    snapshot: null,
  });

  useEffect(() => {
    if (!address || !isValidEvmAddress(address)) {
      setState({ loading: false, isDemo: false, error: null, snapshot: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      if (!apiKey) {
        const snapshot = mockWalletSnapshot(address, chain);
        if (!cancelled) {
          setState({
            loading: false,
            isDemo: true,
            error:
              "Adicione uma API key da Etherscan em Configurações para ver dados reais da carteira.",
            snapshot,
          });
        }
        return;
      }

      try {
        const snapshot = await loadWalletSnapshot(address, chain, apiKey);
        if (!cancelled) {
          setState({ loading: false, isDemo: false, error: null, snapshot });
        }
      } catch (err) {
        if (cancelled) return;
        const snapshot = mockWalletSnapshot(address, chain);
        setState({
          loading: false,
          isDemo: true,
          error: err instanceof Error ? err.message : "Failed to load wallet data",
          snapshot,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [address, chain, apiKey]);

  return state;
}
