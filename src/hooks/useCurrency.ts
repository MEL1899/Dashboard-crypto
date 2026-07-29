import { useState } from "react";
import type { Currency } from "../lib/currency";

const STORAGE_KEY = "crypto-dashboard:currency";

function getInitialCurrency(): Currency {
  if (typeof window === "undefined") return "USD";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "BRL" ? "BRL" : "USD";
}

export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>(getInitialCurrency);

  function toggleCurrency() {
    setCurrency((current) => {
      const next: Currency = current === "USD" ? "BRL" : "USD";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return { currency, toggleCurrency };
}
