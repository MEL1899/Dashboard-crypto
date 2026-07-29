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

export type ScoreLevel = "strongBuy" | "buy" | "neutral" | "sell" | "strongSell";

export const SCORE_LEVEL_META: Record<
  ScoreLevel,
  { label: string; tone: "up" | "down" | "neutral"; strong: boolean }
> = {
  strongBuy: { label: "Compra Forte", tone: "up", strong: true },
  buy: { label: "Compra", tone: "up", strong: false },
  neutral: { label: "Neutro", tone: "neutral", strong: false },
  sell: { label: "Venda", tone: "down", strong: false },
  strongSell: { label: "Venda Forte", tone: "down", strong: true },
};

/**
 * Same visual language everywhere a technical signal is shown (watchlist
 * table, detail panel): solid background for "Forte", ~55% opacity for the
 * milder level, reusing the app's up/down colors instead of new hues.
 *
 * Pass `score` where there's room for the underlying number (table rows,
 * cards) so it renders as one pill ("41 · Venda") instead of a separate
 * plain-text number sitting next to the badge. Omit it for the detail
 * panel's hero card, which already shows the score on its own line.
 */
export function ScoreBadge({ level, score }: { level: ScoreLevel; score?: number }) {
  const meta = SCORE_LEVEL_META[level];
  const content =
    score === undefined ? (
      meta.label
    ) : (
      <>
        <span className="num-mono">{score}</span>
        <span className="mx-1 opacity-60">·</span>
        {meta.label}
      </>
    );
  if (meta.tone === "neutral") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-[var(--color-text-dim)]">
        {content}
      </span>
    );
  }
  const solid = meta.tone === "up" ? "#0ca30c" : "#d03b3b";
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={
        meta.strong
          ? { backgroundColor: solid, color: "#fff" }
          : { backgroundColor: `${solid}8c`, color: solid }
      }
    >
      {content}
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

/**
 * For aggregate figures (market cap, volume) where exact cents don't
 * matter and abbreviating aids readability. Currency-aware (USD or a
 * mocked BRL conversion). Don't use this for a per-coin price — see
 * formatPrice below.
 */
export function formatMoney(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return "-";
  const converted = currency === "BRL" ? value * MOCK_USD_TO_BRL_RATE : value;
  const symbol = currency === "BRL" ? "R$" : "$";
  const abs = Math.abs(converted);
  if (abs >= 1_000_000_000_000) return `${symbol}${(converted / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${symbol}${(converted / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${symbol}${(converted / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${symbol}${(converted / 1_000).toFixed(2)}K`;
  if (abs < 1) return `${symbol}${converted.toFixed(4)}`;
  return `${symbol}${converted.toFixed(2)}`;
}

/**
 * For a per-coin price (or a price level like a Bollinger band) — never
 * abbreviated to K/M/B, since that reads as a different number than the
 * price someone would actually see quoted (e.g. $67,682.62, not $67.68K).
 * Small-value tokens get more decimal places so they don't round to 0.
 */
export function formatPrice(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return "-";
  const converted = currency === "BRL" ? value * MOCK_USD_TO_BRL_RATE : value;
  const symbol = currency === "BRL" ? "R$" : "$";
  const abs = Math.abs(converted);
  if (abs === 0) return `${symbol}0.00`;
  if (abs < 1) return `${symbol}${converted.toFixed(abs < 0.01 ? 6 : 4)}`;
  return `${symbol}${converted.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
