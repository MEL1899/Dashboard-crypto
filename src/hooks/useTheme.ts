import { useLayoutEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "crypto-dashboard:theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // No explicit choice yet — follow the OS preference.
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Layout effect (not a plain effect) so the attribute lands before the
  // browser paints, avoiding a flash of the wrong theme.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b0d12" : "#f1f3f8");
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return { theme, toggleTheme };
}
