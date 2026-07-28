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
}

const CHART_BG = "#12141c";
const GRID = "#1c1f2a";
const TEXT = "#8b93a7";

export function PriceChart({ candles, bollinger, rsi, volume }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { color: CHART_BG },
        textColor: TEXT,
        panes: { separatorColor: GRID },
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: { borderColor: GRID },
      timeScale: { borderColor: GRID, timeVisible: true },
      autoSize: true,
    });
    chartRef.current = chart;

    // Pane 0: candlesticks + Bollinger Bands overlay
    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "#22c55e",
        downColor: "#f43f5e",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#f43f5e",
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

    const bbColor = { upper: "#7c6cff", middle: "#c7cad6", lower: "#7c6cff" };
    for (const key of ["upper", "middle", "lower"] as const) {
      const series = chart.addSeries(
        LineSeries,
        {
          color: bbColor[key],
          lineWidth: key === "middle" ? 1 : 1,
          lineStyle: key === "middle" ? 2 : 0,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        },
        0,
      );
      series.setData(
        bollinger.map((b) => ({ time: b.time as UTCTimestamp, value: b[key] })),
      );
    }

    // Pane 1: volume
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { color: "#7c6cff80", priceFormat: { type: "volume" } },
      1,
    );
    volumeSeries.setData(
      volume.map((v) => ({ time: v.time as UTCTimestamp, value: v.value })),
    );

    // Pane 2: RSI
    const rsiSeries = chart.addSeries(
      LineSeries,
      { color: "#22d3ee", lineWidth: 2, lastValueVisible: true, priceLineVisible: false },
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
  }, [candles, bollinger, rsi, volume]);

  return <div ref={containerRef} className="h-[560px] w-full" />;
}
