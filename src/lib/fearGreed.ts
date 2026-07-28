import type { FearGreedPoint } from "../types";

const BASE = "https://api.alternative.me/fng/";

export class FearGreedDataError extends Error {}

interface FngRow {
  value: string;
  value_classification: string;
  timestamp: string;
}

export async function fetchFearGreedIndex(limit = 30): Promise<FearGreedPoint[]> {
  const url = new URL(BASE);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new FearGreedDataError(`Fear & Greed ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as { data: FngRow[] };

  return data.data
    .map((row) => ({
      time: Number(row.timestamp),
      value: Number(row.value),
      classification: row.value_classification,
    }))
    .sort((a, b) => a.time - b.time);
}
