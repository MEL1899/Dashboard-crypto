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

/**
 * Tiny inline trend line for the score's recent history (see
 * lib/scoreHistory.ts) — plain SVG, no charting library, since it's just a
 * handful of points next to a badge. Renders nothing below 2 points (no
 * trend to draw yet), keeping layout stable while history accumulates.
 */
export function ScoreSparkline({
  points,
  width = 44,
  height = 16,
}: {
  points: { time: number; score: number }[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const coords = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = height - ((s - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const trend = scores[scores.length - 1] - scores[0];
  const color = trend > 0 ? "#0ca30c" : trend < 0 ? "#d03b3b" : "#8b93a7";

  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
 * Small-value tokens get more decimal places so they don't round to 0;
 * four-figure-and-up tokens (BTC, ETH, ...) drop the cents entirely, since
 * at that scale they're just noise — nobody reads $67,682.62 any
 * differently than $67,682.
 */
export function formatPrice(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return "-";
  const converted = currency === "BRL" ? value * MOCK_USD_TO_BRL_RATE : value;
  const symbol = currency === "BRL" ? "R$" : "$";
  const abs = Math.abs(converted);
  if (abs === 0) return `${symbol}0.00`;
  if (abs < 1) return `${symbol}${converted.toFixed(abs < 0.01 ? 6 : 4)}`;
  // Locale pinned to en-US, not the viewer's browser locale: the symbol is
  // always "$"/"R$" chosen above, so the digit grouping has to match it —
  // "undefined" here would format as "$1.521,68" for a pt-BR browser, a
  // currency symbol glued to the wrong separator convention.
  if (abs >= 1000) {
    return `${symbol}${converted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `${symbol}${converted.toLocaleString("en-US", {
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
