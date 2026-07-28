import { useEffect, useState } from "react";
import { fetchChainTvlHistory } from "../lib/defillama";
import { mockChainTvl } from "../lib/mock";
import type { ChainKey, IndicatorPoint } from "../types";

interface ChainTvlState {
  loading: boolean;
  isDemo: boolean;
  error: string | null;
  data: IndicatorPoint[];
}

export function useChainTvl(chain: ChainKey) {
  const [state, setState] = useState<ChainTvlState>({
    loading: true,
    isDemo: false,
    error: null,
    data: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      try {
        const data = await fetchChainTvlHistory(chain);
        if (cancelled) return;
        setState({ loading: false, isDemo: false, error: null, data });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          isDemo: true,
          error: err instanceof Error ? err.message : "Failed to load chain TVL",
          data: mockChainTvl(chain),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [chain]);

  return state;
}
