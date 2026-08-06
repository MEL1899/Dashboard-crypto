import type { AppSettings } from "../types";

const STORAGE_KEY = "crypto-dashboard:settings";

export const DEFAULT_SETTINGS: AppSettings = {
  etherscanApiKey: "",
  coingeckoApiKey: "",
  chain: "eth",
  walletAddress: "",
  watchlist: [],
  portfolio: [],
  selectedTokenId: "",
  timeframe: "1d",
  alertsEnabled: false,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // setItem throws on a full quota and in Safari's private mode. Losing
    // persistence is a nuisance; letting it throw out of a render effect
    // takes the whole app down with it. `load` already guarded this side.
  }
}
