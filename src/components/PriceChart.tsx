import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { BollingerBands, Candle, IndicatorPoint } from "../types";

interface PriceChartProps {
  candles: Candle[];
  bollinger: BollingerBands[];
  rsi: IndicatorPoint[];
  volume: IndicatorPoint[];
  theme: "light" | "dark";
}

// lightweight-charts renders to <canvas>, which can't resolve CSS custom
// properties — so each theme needs its own literal color set here, kept in
// sync with the tokens in index.css.
const THEME_COLORS = {
  dark: { bg: "#12141c", grid: "#1c1f2a", text: "#8b93a7", rsiLine: "#22d3ee" },
  light: { bg: "#ffffff", grid: "#e4e7ee", text: "#5b6472", rsiLine: "#0a8fa6" },
};

export function PriceChart({ candles, bollinger, rsi, volume, theme }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const colors = THEME_COLORS[theme];

    const chart = createChart(container, {
      layout: {
        background: { color: colors.bg },
        textColor: colors.text,
        panes: { separatorColor: colors.grid },
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderColor: colors.grid },
      timeScale: { borderColor: colors.grid, timeVisible: true },
      autoSize: true,
    });
    chartRef.current = chart;

    // Same "cents stop being meaningful at four figures" rule as
    // formatPrice (components/common.tsx) — BTC/ETH-range prices show
    // whole numbers on the axis instead of $67,682.62. All series sharing
    // this pane's price scale need the same precision, so it's computed
    // once here from the latest close.
    const lastClose = candles.length > 0 ? candles[candles.length - 1].close : 0;
    const priceFormat =
      Math.abs(lastClose) >= 1000
        ? { type: "price" as const, precision: 0, minMove: 1 }
        : { type: "price" as const, precision: 2, minMove: 0.01 };

    // Pane 0: candlesticks + Bollinger Bands overlay
    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "#0ca30c",
        downColor: "#d03b3b",
        borderVisible: false,
        wickUpColor: "#0ca30c",
        wickDownColor: "#d03b3b",
        priceFormat,
      },
      0,
    );
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    // Upper band = dynamic resistance/overbought zone, lower band = dynamic
    // support/oversold zone — same red/green semantics used everywhere else
    // in this app (RSI, 24h change), not an arbitrary color choice.
    const bbColor = { upper: "#d03b3b", middle: colors.text, lower: "#0ca30c" };
    for (const key of ["upper", "middle", "lower"] as const) {
      const series = chart.addSeries(
        LineSeries,
        {
          color: bbColor[key],
          lineWidth: 1,
          lineStyle: key === "middle" ? 2 : 0,
          crosshairMarkerVisible: false,
          // Current upper/lower band values shown on the right axis, in
          // their own colors, so they read the same way the live price and
          // RSI badges already do. Middle (the SMA) stays off the axis,
          // matching the detail card's Bollinger Bands display above.
          lastValueVisible: key !== "middle",
          priceLineVisible: false,
          priceFormat,
        },
        0,
      );
      series.setData(
        bollinger.map((b) => ({ time: b.time as UTCTimestamp, value: b[key] })),
      );
    }

    // Pane 1: volume, colored per-bar by that candle's direction (same
    // green/red as the candlesticks) instead of one flat accent color —
    // makes it readable at a glance which side pushed the volume.
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" } },
      1,
    );
    volumeSeries.setData(
      volume.map((v, i) => {
        const candle = candles[i];
        const isUp = !candle || candle.close >= candle.open;
        return {
          time: v.time as UTCTimestamp,
          value: v.value,
          color: isUp ? "#0ca30c80" : "#d03b3b80",
        };
      }),
    );

    // Pane 2: RSI
    const rsiSeries = chart.addSeries(
      LineSeries,
      { color: colors.rsiLine, lineWidth: 2, lastValueVisible: true, priceLineVisible: false },
      2,
    );
    rsiSeries.setData(rsi.map((r) => ({ time: r.time as UTCTimestamp, value: r.value })));

    const panes = chart.panes();
    if (panes[0]) panes[0].setHeight(320);
    if (panes[1]) panes[1].setHeight(90);
    if (panes[2]) panes[2].setHeight(120);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, bollinger, rsi, volume, theme]);

  return <div ref={containerRef} className="h-[560px] w-full" />;
}
