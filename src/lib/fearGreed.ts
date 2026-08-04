const BASE = "https://api.alternative.me/fng/";

export class FearGreedDataError extends Error {}

interface FngRow {
  value: string;
  value_classification: string;
}

export interface FearGreedNow {
  value: number;
}

/** Just the current reading — free, no key, same endpoint the old Derivativos tab used. */
export async function fetchFearGreedIndex(): Promise<FearGreedNow> {
  const url = new URL(BASE);
  url.searchParams.set("limit", "1");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new FearGreedDataError(`Fear & Greed ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as { data: FngRow[] };
  const row = data.data[0];
  if (!row) throw new FearGreedDataError("Fear & Greed: empty response");
  return { value: Number(row.value) };
}

export interface FearGreedPoint {
  /** Unix seconds, as published by the API (one reading per day). */
  time: number;
  value: number;
}

/**
 * The full published history, oldest first. `limit=0` asks Alternative.me
 * for every reading since the index began in February 2018 — free, no key,
 * same endpoint as the current-value call above.
 *
 * Sorted ascending because every consumer (chart, backtest alignment) walks
 * it forwards; the API returns newest-first.
 */
export async function fetchFearGreedHistory(limit = 0): Promise<FearGreedPoint[]> {
  const url = new URL(BASE);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new FearGreedDataError(`Fear & Greed history ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as { data?: (FngRow & { timestamp?: string })[] };
  const rows = data.data ?? [];
  if (rows.length === 0) throw new FearGreedDataError("Fear & Greed: empty history");

  return rows
    .map((row) => ({ time: Number(row.timestamp), value: Number(row.value) }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time);
}

/** Portuguese label for a 0-100 Fear & Greed value, independent of the API's own English classification text. */
export function fearGreedLabel(value: number): string {
  if (value <= 24) return "Medo Extremo";
  if (value <= 44) return "Medo";
  if (value <= 55) return "Neutro";
  if (value <= 75) return "Ganância";
  return "Ganância Extrema";
}
