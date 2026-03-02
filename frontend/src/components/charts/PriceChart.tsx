"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMarketStore } from "@/stores/market";
import { useThemeStore, THEME_CANVAS } from "@/stores/theme";
import { api } from "@/lib/api";
import { formatPrice, formatVolume } from "@/lib/format";
import { binanceKlineWS, isBinanceSymbol } from "@/lib/binance-ws";
import type { LiveCandle } from "@/lib/binance-ws";
import type { OHLCV, Timeframe } from "@/types/market";
import {
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type Time,
  type SeriesMarker,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import {
  getChartOptions,
  getCandlestickOptions,
  getVolumeOptions,
} from "./helpers/chartTheme";
import { computeSMA, computeEMA } from "./helpers/indicators";
import { getPriceFormatter } from "./helpers/priceFormatter";
import { SessionBandsPrimitive } from "./primitives/SessionBandsPrimitive";
import {
  AccZonePrimitive,
  computeAccumulationZones,
  detectZoneShifts,
  type AccZone,
  type ZoneShift,
} from "./primitives/AccZonePrimitive";

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

/* ── Data conversion helpers ── */
function toTime(ts: string): UTCTimestamp {
  return (new Date(ts).getTime() / 1000) as UTCTimestamp;
}

function toChartData(c: OHLCV) {
  return {
    time: toTime(c.timestamp),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function toVolumeData(c: OHLCV, bullAlpha: string, bearAlpha: string) {
  return {
    time: toTime(c.timestamp),
    value: c.volume,
    color: c.close >= c.open ? bullAlpha : bearAlpha,
  };
}

/* ── Pattern Marker type ── */
interface PatternMarker {
  timestamp: string;
  pattern: string;
  bias: string;
  strength: number;
  type: string;
}

/* ── Component ── */
export default function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const sma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const sessionPrimRef = useRef<SessionBandsPrimitive | null>(null);
  const accZonePrimRef = useRef<AccZonePrimitive | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watermarkRef = useRef<any>(null);

  const { activeSymbol, activeTimeframe, setActiveTimeframe, setCandles, candles, livePrices } = useMarketStore();
  const theme = useThemeStore((s) => s.theme);
  const [data, setData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredCandle, setHoveredCandle] = useState<OHLCV | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [showSessions, setShowSessions] = useState(true);
  const [isPannedAway, setIsPannedAway] = useState(false);

  // Zone state
  const [zones, setZones] = useState<AccZone[]>([]);
  const [zoneShifts, setZoneShifts] = useState<ZoneShift[]>([]);
  const prevZonesRef = useRef<AccZone[]>([]);
  const [patternMarkers, setPatternMarkers] = useState<PatternMarker[]>([]);

  const livePrice = livePrices[activeSymbol]?.price;
  const cacheKey = `${activeSymbol}_${activeTimeframe}`;
  const canStream = isBinanceSymbol(activeSymbol);
  const isIntraday = ["1m", "5m", "15m", "1h", "4h"].includes(activeTimeframe);

  // Refs to avoid stale closures in data effects
  const dataRef = useRef<OHLCV[]>([]);
  dataRef.current = data;

  /* ──────────────────────────────────────────────────
     Chart creation / destruction (mount only)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      ...getChartOptions(theme),
      autoSize: true,
    });

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      ...getCandlestickOptions(theme),
      priceFormat: {
        type: "custom" as const,
        formatter: getPriceFormatter(activeSymbol),
        minMove: 0.00001,
      },
    });

    // Volume histogram (bottom 20%)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      ...getVolumeOptions(theme),
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // MA overlays
    const sma20 = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: "SMA 20",
    });
    const ema50 = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: "EMA 50",
    });
    const ema200 = chart.addSeries(LineSeries, {
      color: "#8b5cf6",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: "EMA 200",
    });

    // Session bands primitive
    const sessionPrim = new SessionBandsPrimitive();
    candleSeries.attachPrimitive(sessionPrim);

    // Accumulation zones primitive
    const accZonePrim = new AccZonePrimitive(theme);
    candleSeries.attachPrimitive(accZonePrim);

    // Watermark
    const watermark = createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        {
          text: activeSymbol,
          color: "rgba(100,116,139,0.07)",
          fontSize: 48,
          fontFamily: "JetBrains Mono",
          fontStyle: "bold",
        },
      ],
    });

    // Series markers plugin
    const markersPlugin = createSeriesMarkers(candleSeries, []);

    // Crosshair tooltip
    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData) {
        const candleData = param.seriesData.get(candleSeries);
        if (candleData && "open" in candleData) {
          const cd = candleData as { time: UTCTimestamp; open: number; high: number; low: number; close: number };
          setHoveredCandle({
            timestamp: new Date((cd.time as number) * 1000).toISOString(),
            open: cd.open,
            high: cd.high,
            low: cd.low,
            close: cd.close,
            volume: 0,
          });
        }
      } else {
        setHoveredCandle(null);
      }
    });

    // Detect panning
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      const d = dataRef.current;
      setIsPannedAway(d.length > 0 && range.to < d.length - 2);
    });

    // Store refs
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    sma20Ref.current = sma20;
    ema50Ref.current = ema50;
    ema200Ref.current = ema200;
    markersRef.current = markersPlugin;
    sessionPrimRef.current = sessionPrim;
    accZonePrimRef.current = accZonePrim;
    watermarkRef.current = watermark;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      sma20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      markersRef.current = null;
      sessionPrimRef.current = null;
      accZonePrimRef.current = null;
      watermarkRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ──────────────────────────────────────────────────
     Theme switching
     ────────────────────────────────────────────────── */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions(getChartOptions(theme));
    candleSeriesRef.current?.applyOptions(getCandlestickOptions(theme));
    // Re-set volume data with new colors
    if (data.length > 0) {
      const tc = THEME_CANVAS[theme];
      volumeSeriesRef.current?.setData(
        data.map((c) => toVolumeData(c, tc.bullAlpha, tc.bearAlpha))
      );
    }
    accZonePrimRef.current?.setTheme(theme);
  }, [theme, data]);

  /* ──────────────────────────────────────────────────
     Symbol / Timeframe change — update chart config
     ────────────────────────────────────────────────── */
  useEffect(() => {
    // Update watermark
    watermarkRef.current?.applyOptions({
      lines: [
        {
          text: activeSymbol,
          color: "rgba(100,116,139,0.07)",
          fontSize: 48,
          fontFamily: "JetBrains Mono",
          fontStyle: "bold",
        },
      ],
    });
    // Update price formatter
    candleSeriesRef.current?.applyOptions({
      priceFormat: {
        type: "custom" as const,
        formatter: getPriceFormatter(activeSymbol),
        minMove: 0.00001,
      },
    });
    // Load from cache synchronously, or clear
    const cached = candles[`${activeSymbol}_${activeTimeframe}`];
    setData(cached || []);
  }, [activeSymbol, activeTimeframe, candles]);

  /* ──────────────────────────────────────────────────
     Push data to chart series whenever data changes
     ────────────────────────────────────────────────── */
  const pushDataToChart = useCallback(
    (newData: OHLCV[]) => {
      if (newData.length === 0) {
        candleSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
        sma20Ref.current?.setData([]);
        ema50Ref.current?.setData([]);
        ema200Ref.current?.setData([]);
        return;
      }
      const tc = THEME_CANVAS[theme];
      candleSeriesRef.current?.setData(newData.map(toChartData));
      volumeSeriesRef.current?.setData(
        newData.map((c) => toVolumeData(c, tc.bullAlpha, tc.bearAlpha))
      );
      sma20Ref.current?.setData(computeSMA(newData, 20));
      ema50Ref.current?.setData(computeEMA(newData, 50));
      ema200Ref.current?.setData(computeEMA(newData, 200));
    },
    [theme]
  );

  /* ──────────────────────────────────────────────────
     Fetch historical data
     ────────────────────────────────────────────────── */
  const cacheTimestamps = useRef<Record<string, number>>({});

  useEffect(() => {
    const load = async () => {
      const cached = candles[cacheKey];
      const cacheAge = Date.now() - (cacheTimestamps.current[cacheKey] || 0);
      const CACHE_TTL = 2 * 60 * 1000;

      if (cached && cacheAge < CACHE_TTL) {
        setData(cached);
        pushDataToChart(cached);
        return;
      }
      if (cached) {
        setData(cached);
        pushDataToChart(cached);
      } else {
        setLoading(true);
      }
      try {
        await api.fetchPrices(activeSymbol, activeTimeframe, 2000);
        const prices = await api.prices(activeSymbol, activeTimeframe, 2000);
        const sorted = [...prices].reverse();
        setData(sorted);
        setCandles(cacheKey, sorted);
        cacheTimestamps.current[cacheKey] = Date.now();
        pushDataToChart(sorted);
      } catch (err) {
        console.error("Failed to load prices:", err);
        try {
          await api.fetchPrices(activeSymbol, activeTimeframe, 500);
          const prices = await api.prices(activeSymbol, activeTimeframe, 500);
          const sorted = [...prices].reverse();
          setData(sorted);
          setCandles(cacheKey, sorted);
          cacheTimestamps.current[cacheKey] = Date.now();
          pushDataToChart(sorted);
        } catch {
          // Data source may be unavailable
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, activeTimeframe, cacheKey]);

  /* ──────────────────────────────────────────────────
     Real-time WebSocket (Binance crypto)
     ────────────────────────────────────────────────── */
  const gapRefetchDone = useRef(false);
  useEffect(() => {
    gapRefetchDone.current = false;
  }, [activeSymbol, activeTimeframe]);

  useEffect(() => {
    if (!canStream || data.length === 0) {
      setIsLive(false);
      return;
    }

    setIsLive(true);
    const intervalMs = getIntervalMs(activeTimeframe);
    const tc = THEME_CANVAS[theme];

    binanceKlineWS.subscribe(activeSymbol, activeTimeframe, (_symbol: string, candle: LiveCandle) => {
      setData((prev) => {
        if (prev.length === 0) return prev;

        const lastCandle = prev[prev.length - 1];
        const lastTs = new Date(lastCandle.timestamp).getTime();
        const candleTs = candle.timestamp;
        const gap = candleTs - lastTs;

        // Same candle — update in place
        if (Math.abs(gap) < intervalMs * 0.9) {
          const updated = [...prev];
          const newCandle = {
            ...lastCandle,
            high: Math.max(lastCandle.high, candle.high),
            low: Math.min(lastCandle.low, candle.low),
            close: candle.close,
            volume: candle.volume,
          };
          updated[updated.length - 1] = newCandle;
          // Update chart series in place
          candleSeriesRef.current?.update(toChartData(newCandle));
          volumeSeriesRef.current?.update(toVolumeData(newCandle, tc.bullAlpha, tc.bearAlpha));
          return updated;
        }

        // Gap detected — re-fetch
        if (gap > intervalMs * 2 && !gapRefetchDone.current) {
          gapRefetchDone.current = true;
          (async () => {
            try {
              await api.fetchPrices(activeSymbol, activeTimeframe, 200);
              const prices = await api.prices(activeSymbol, activeTimeframe, 200);
              const sorted = [...prices].reverse();
              setData(sorted);
              pushDataToChart(sorted);
            } catch { /* ignore */ }
          })();
        }

        // Next candle — append
        if (candleTs > lastTs) {
          const newOHLCV: OHLCV = {
            timestamp: new Date(candleTs).toISOString(),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          };
          candleSeriesRef.current?.update(toChartData(newOHLCV));
          volumeSeriesRef.current?.update(toVolumeData(newOHLCV, tc.bullAlpha, tc.bearAlpha));
          return [...prev.slice(-499), newOHLCV];
        }

        return prev;
      });
    });

    // Periodic background candle refresh
    const bgRefresh = setInterval(async () => {
      try {
        const prices = await api.prices(activeSymbol, activeTimeframe, 10);
        const sorted = [...prices].reverse();
        if (sorted.length === 0) return;
        setData((prev) => {
          if (prev.length === 0) return sorted;
          const lastTs = prev[prev.length - 1].timestamp;
          const updated = [...prev];
          for (const c of sorted) {
            if (c.timestamp === lastTs) {
              updated[updated.length - 1] = c;
              candleSeriesRef.current?.update(toChartData(c));
              volumeSeriesRef.current?.update(toVolumeData(c, tc.bullAlpha, tc.bearAlpha));
            } else if (c.timestamp > lastTs) {
              updated.push(c);
              candleSeriesRef.current?.update(toChartData(c));
              volumeSeriesRef.current?.update(toVolumeData(c, tc.bullAlpha, tc.bearAlpha));
            }
          }
          return updated.length > 2500 ? updated.slice(-2000) : updated;
        });
      } catch { /* ignore */ }
    }, 90_000);

    return () => {
      binanceKlineWS.close();
      clearInterval(bgRefresh);
      setIsLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStream, activeSymbol, activeTimeframe, data.length > 0]);

  /* ──────────────────────────────────────────────────
     REST polling for non-Binance (forex, gold)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    if (canStream || data.length === 0) return;

    setIsLive(true);
    let cancelled = false;
    const sym = activeSymbol;
    const tf = activeTimeframe;
    const tc = THEME_CANVAS[theme];

    // Fast poll: update last candle close price
    const quickPoll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/v1/prices/${sym}/latest`);
        if (res.ok) {
          const d = await res.json();
          if (d.price) {
            setData((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.close > 0) {
                const ratio = d.price / last.close;
                if (ratio > 5 || ratio < 0.2) return prev;
              }
              const updated = [...prev];
              const newCandle = {
                ...last,
                close: d.price,
                high: Math.max(last.high, d.price),
                low: Math.min(last.low, d.price),
              };
              updated[updated.length - 1] = newCandle;
              candleSeriesRef.current?.update(toChartData(newCandle));
              volumeSeriesRef.current?.update(toVolumeData(newCandle, tc.bullAlpha, tc.bearAlpha));
              return updated;
            });
          }
        }
      } catch { /* ignore */ }
    };

    // Slow poll: fetch recent candles
    const candleRefresh = async () => {
      if (cancelled) return;
      try {
        await api.fetchPrices(sym, tf, 10);
        const prices = await api.prices(sym, tf, 10);
        const newCandles = [...prices].reverse();
        if (newCandles.length === 0) return;

        setData((prev) => {
          if (prev.length === 0) return newCandles;
          const lastTs = prev[prev.length - 1].timestamp;
          const updated = [...prev];
          for (const c of newCandles) {
            if (c.timestamp === lastTs) {
              updated[updated.length - 1] = c;
              candleSeriesRef.current?.update(toChartData(c));
              volumeSeriesRef.current?.update(toVolumeData(c, tc.bullAlpha, tc.bearAlpha));
            } else if (c.timestamp > lastTs) {
              updated.push(c);
              candleSeriesRef.current?.update(toChartData(c));
              volumeSeriesRef.current?.update(toVolumeData(c, tc.bullAlpha, tc.bearAlpha));
            }
          }
          return updated.length > 2500 ? updated.slice(-2000) : updated;
        });
      } catch { /* ignore */ }
    };

    quickPoll();
    const quickInterval = setInterval(quickPoll, 10_000);
    const refreshInterval = setInterval(candleRefresh, 60_000);
    const firstRefresh = setTimeout(candleRefresh, 20_000);

    return () => {
      cancelled = true;
      clearInterval(quickInterval);
      clearInterval(refreshInterval);
      clearTimeout(firstRefresh);
      setIsLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStream, activeSymbol, activeTimeframe, data.length > 0]);

  /* ──────────────────────────────────────────────────
     Pattern markers
     ────────────────────────────────────────────────── */
  useEffect(() => {
    if (data.length < 30) {
      setPatternMarkers([]);
      markersRef.current?.setMarkers([]);
      return;
    }
    const fetchPatterns = async () => {
      try {
        const result = await api.patternHistory(activeSymbol, activeTimeframe, Math.min(data.length, 50));
        if (result?.patterns?.length > 0) {
          const markers: PatternMarker[] = result.patterns
            .filter((p: any) => p.strength >= 0.6)
            .map((p: any) => ({
              timestamp: p.timestamp,
              pattern: p.pattern,
              bias: p.bias,
              strength: p.strength,
              type: p.type,
            }));
          setPatternMarkers(markers);
        } else {
          setPatternMarkers([]);
        }
      } catch {
        setPatternMarkers([]);
      }
    };
    fetchPatterns();
  }, [data.length, activeSymbol, activeTimeframe]);

  // Push markers to chart when they change
  useEffect(() => {
    if (!markersRef.current) return;
    const tc = THEME_CANVAS[theme];
    const chartMarkers: SeriesMarker<Time>[] = patternMarkers
      .map((m) => ({
        time: toTime(m.timestamp),
        position: (m.bias === "bullish" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
        shape: (m.bias === "bullish" ? "arrowUp" : m.bias === "bearish" ? "arrowDown" : "circle") as "arrowUp" | "arrowDown" | "circle",
        color: m.bias === "bullish" ? tc.patternBull : m.bias === "bearish" ? tc.patternBear : tc.patternNeutral,
        text: m.pattern.replace(/_/g, " ").toUpperCase(),
        size: m.strength >= 0.8 ? 2 : 1,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current.setMarkers(chartMarkers);
  }, [patternMarkers, theme]);

  /* ──────────────────────────────────────────────────
     Accumulation zones (order book — crypto only)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    const crypto = activeSymbol.endsWith("USDT") || activeSymbol.endsWith("USDC") || activeSymbol.endsWith("BTC");
    if (!crypto) {
      setZones([]);
      accZonePrimRef.current?.updateZones([], []);
      return;
    }

    const fetchZones = async () => {
      try {
        const ob = await api.orderBook(activeSymbol, 500);
        const bids = (ob.bids || []).map((b: any) => ({ price: b.price, quantity: b.quantity }));
        const asks = (ob.asks || []).map((a: any) => ({ price: a.price, quantity: a.quantity }));
        const newZones = computeAccumulationZones(bids, asks);

        if (prevZonesRef.current.length > 0) {
          const shifts = detectZoneShifts(prevZonesRef.current, newZones);
          if (shifts.length > 0) {
            setZoneShifts((prev) => {
              const newShifts = [...prev, ...shifts].slice(-20);
              accZonePrimRef.current?.updateZones(newZones, newShifts);
              return newShifts;
            });
          } else {
            accZonePrimRef.current?.updateZones(newZones, zoneShifts);
          }
        } else {
          accZonePrimRef.current?.updateZones(newZones, []);
        }

        prevZonesRef.current = newZones;
        setZones(newZones);
      } catch {
        // Order book not available
      }
    };

    fetchZones();
    const interval = setInterval(fetchZones, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol]);

  // Clean up old zone shifts
  useEffect(() => {
    const timer = setInterval(() => {
      accZonePrimRef.current?.cleanOldShifts();
      setZoneShifts((prev) => prev.filter((s) => s.timestamp > Date.now() - 30000));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  /* ──────────────────────────────────────────────────
     Session bands toggle
     ────────────────────────────────────────────────── */
  useEffect(() => {
    sessionPrimRef.current?.update(showSessions, isIntraday);
  }, [showSessions, isIntraday]);

  /* ──────────────────────────────────────────────────
     JSX
     ────────────────────────────────────────────────── */
  const buyZoneCount = zones.filter((z) => z.type === "buy").length;
  const sellZoneCount = zones.filter((z) => z.type === "sell").length;

  return (
    <div className="card-glass rounded-lg flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-sm md:text-base font-mono font-bold text-[var(--color-text-primary)]">
            {activeSymbol}
          </span>
          {isLive && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-bull)] animate-pulse" />
              <span className="text-[10px] font-mono text-[var(--color-bull)] uppercase">Live</span>
            </span>
          )}
          {zones.length > 0 && (
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
              <span className="text-[var(--color-bull)]">{buyZoneCount}B</span>
              {" / "}
              <span className="text-[var(--color-bear)]">{sellZoneCount}S</span>
              {" zones"}
            </span>
          )}
          {/* MA legend */}
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono">
            <span style={{ color: "#f59e0b" }}>SMA 20</span>
            <span style={{ color: "#3b82f6" }}>EMA 50</span>
            <span style={{ color: "#8b5cf6" }}>EMA 200</span>
          </div>
          {hoveredCandle && (
            <div className="hidden md:flex items-center gap-3 text-[12px] font-mono">
              <span className="text-[var(--color-text-muted)]">
                O <span className="text-[var(--color-text-primary)]">{formatPrice(hoveredCandle.open, activeSymbol)}</span>
              </span>
              <span className="text-[var(--color-text-muted)]">
                H <span className="text-[var(--color-bull)]">{formatPrice(hoveredCandle.high, activeSymbol)}</span>
              </span>
              <span className="text-[var(--color-text-muted)]">
                L <span className="text-[var(--color-bear)]">{formatPrice(hoveredCandle.low, activeSymbol)}</span>
              </span>
              <span className="text-[var(--color-text-muted)]">
                C <span className="text-[var(--color-text-primary)]">{formatPrice(hoveredCandle.close, activeSymbol)}</span>
              </span>
            </div>
          )}
        </div>
        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Sessions toggle */}
          {isIntraday && (
            <button
              onClick={() => setShowSessions(!showSessions)}
              className={`
                px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[32px]
                ${showSessions
                  ? "border-[var(--color-neon-purple)]/30 text-[var(--color-neon-purple)] bg-[var(--color-neon-purple)]/10"
                  : "border-[var(--color-border-primary)] text-[var(--color-text-muted)]"
                }
              `}
            >
              Sessions
            </button>
          )}
          {/* Timeframe selector */}
          <div className="flex items-center gap-0.5 md:gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setActiveTimeframe(tf.value)}
                className={`
                  px-2 py-1 text-xs md:text-sm font-mono rounded transition-all min-w-[32px] min-h-[32px] flex items-center justify-center
                  ${tf.value === "1m" ? "hidden sm:flex" : ""}
                  ${
                    activeTimeframe === tf.value
                      ? "bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }
                `}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-sm text-[var(--color-text-muted)] animate-pulse">
              Loading {activeSymbol}...
            </div>
          </div>
        )}
        <div
          ref={chartContainerRef}
          className="absolute inset-0"
        />

        {/* Snap to latest button */}
        {isPannedAway && !loading && (
          <button
            onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
            className="absolute bottom-14 right-20 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono font-semibold transition-all duration-200 shadow-lg hover:scale-105 active:scale-95"
            style={{
              backgroundColor: "var(--color-neon-blue)",
              color: "#fff",
              boxShadow: "0 2px 12px color-mix(in srgb, var(--color-neon-blue) 40%, transparent)",
            }}
            title="Scroll to latest candle"
          >
            Latest
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */
function getIntervalMs(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
    "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000,
  };
  return map[tf] || 86_400_000;
}
