import { useEffect, useRef } from "react";
import { ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { candleLookback, type Interval } from "../lib/hl";
import { useTerminal } from "../state";

const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export function ChartPane() {
  const { info, market, interval, setInterval } = useTerminal();
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0d1118" },
        textColor: "#8b97a8",
        fontFamily: "IBM Plex Mono, monospace",
      },
      grid: {
        vertLines: { color: "#1a2430" },
        horzLines: { color: "#1a2430" },
      },
      rightPriceScale: { borderColor: "#223042" },
      timeScale: { borderColor: "#223042", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    const candles = chart.addCandlestickSeries({
      upColor: "#3ee089",
      downColor: "#ff5d6c",
      wickUpColor: "#3ee089",
      wickDownColor: "#ff5d6c",
      borderVisible: false,
    });
    api.current = chart;
    series.current = candles;
    return () => {
      chart.remove();
      api.current = null;
      series.current = null;
    };
  }, []);

  useEffect(() => {
    if (!market || !series.current) return;
    let cancelled = false;
    void info
      .candleSnapshot({
        coin: market.coin,
        interval,
        startTime: Date.now() - candleLookback(interval),
        endTime: Date.now(),
      })
      .then((rows) => {
        if (cancelled || !series.current) return;
        series.current.setData(
          rows.map((c) => ({
            time: Math.floor(c.t / 1000) as UTCTimestamp,
            open: Number(c.o),
            high: Number(c.h),
            low: Number(c.l),
            close: Number(c.c),
          })),
        );
        api.current?.timeScale().fitContent();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [info, interval, market?.coin]);

  return (
    <div className="chart-wrap">
      <div className="panel-h">
        <strong>{market?.display ?? "—"}</strong>
        <div className="tabs">
          {INTERVALS.map((iv) => (
            <button key={iv} className={iv === interval ? "tab on" : "tab"} onClick={() => setInterval(iv)}>
              {iv}
            </button>
          ))}
        </div>
      </div>
      <div className="chart" ref={host} />
    </div>
  );
}
