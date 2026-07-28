import type { BollingerBands, Candle, IndicatorPoint } from "../types";

/**
 * Wilder's RSI (the standard used by most charting platforms).
 */
export function calcRSI(candles: Candle[], period = 14): IndicatorPoint[] {
  if (candles.length < period + 1) return [];

  const out: IndicatorPoint[] = [];
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out.push({ time: candles[period].time, value: rsiFromAverages(avgGain, avgLoss) });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].time, value: rsiFromAverages(avgGain, avgLoss) });
  }

  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calcSMA(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) {
      out.push({ time: candles[i].time, value: sum / period });
    }
  }
  return out;
}

export function calcBollingerBands(
  candles: Candle[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerBands[] {
  const out: BollingerBands[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const mean = window.reduce((s, c) => s + c.close, 0) / period;
    const variance =
      window.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    out.push({
      time: candles[i].time,
      middle: mean,
      upper: mean + stdDevMultiplier * stdDev,
      lower: mean - stdDevMultiplier * stdDev,
    });
  }
  return out;
}

export function calcVolumeSeries(candles: Candle[]): IndicatorPoint[] {
  return candles.map((c) => ({ time: c.time, value: c.volume }));
}

/** Simple momentum read used for a plain-language insight badge. */
export function rsiSignal(value: number): "oversold" | "overbought" | "neutral" {
  if (value <= 30) return "oversold";
  if (value >= 70) return "overbought";
  return "neutral";
}

export function bbSignal(
  close: number,
  band: BollingerBands,
): "above-upper" | "below-lower" | "inside" {
  if (close >= band.upper) return "above-upper";
  if (close <= band.lower) return "below-lower";
  return "inside";
}
