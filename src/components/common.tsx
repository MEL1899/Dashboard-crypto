import type { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";
import { MOCK_USD_TO_BRL_RATE, type Currency } from "../lib/currency";

export function Card({
  children,
  className,
  title,
  action,
}: PropsWithChildren<{ className?: string; title?: string; action?: ReactNode }>) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h3 className="text-sm font-medium text-[var(--color-text-dim)]">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: PropsWithChildren<{ tone?: "up" | "down" | "neutral" | "accent" }>) {
  const toneClasses = {
    up: "bg-[var(--color-up)]/15 text-[var(--color-up)]",
    down: "bg-[var(--color-down)]/15 text-[var(--color-down)]",
    neutral: "bg-white/5 text-[var(--color-text-dim)]",
    accent: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  } as const;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-[var(--color-accent)]",
        className,
      )}
    />
  );
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (Math.abs(value) < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

/** Like formatUsd, but currency-aware (USD or a mocked BRL conversion). */
export function formatMoney(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return "-";
  const converted = currency === "BRL" ? value * MOCK_USD_TO_BRL_RATE : value;
  const symbol = currency === "BRL" ? "R$" : "$";
  const abs = Math.abs(converted);
  if (abs >= 1_000_000_000) return `${symbol}${(converted / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${symbol}${(converted / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${symbol}${(converted / 1_000).toFixed(2)}K`;
  if (abs < 1) return `${symbol}${converted.toFixed(4)}`;
  return `${symbol}${converted.toFixed(2)}`;
}

export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(digits);
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function timeAgo(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}
