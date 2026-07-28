import type { AppSettings } from "../types";

const STORAGE_KEY = "crypto-dashboard:settings";

export const DEFAULT_SETTINGS: AppSettings = {
  etherscanApiKey: "",
  coingeckoApiKey: "",
  chain: "eth",
  walletAddress: "",
  tokenId: "bitcoin",
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
