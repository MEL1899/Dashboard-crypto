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

/** Portuguese label for a 0-100 Fear & Greed value, independent of the API's own English classification text. */
export function fearGreedLabel(value: number): string {
  if (value <= 24) return "Medo Extremo";
  if (value <= 44) return "Medo";
  if (value <= 55) return "Neutro";
  if (value <= 75) return "Ganância";
  return "Ganância Extrema";
}
