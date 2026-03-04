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
import { TPSLHeatmapPrimitive } from "./primitives/TPSLHeatmapPrimitive";
import { LiquidationHeatmapPrimitive } from "./primitives/LiquidationHeatmapPrimitive";
import { StopHeatmapPrimitive } from "./primitives/StopHeatmapPrimitive";
import { MBOProfilePrimitive } from "./primitives/MBOProfilePrimitive";
import { getMarketType } from "@/stores/market";

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

/**
 * Deduplicate by timestamp (keep last occurrence) and sort ascending.
 * lightweight-charts requires strictly increasing time values.
 */
function deduplicateAndSort(candles: OHLCV[]): OHLCV[] {
  const map = new Map<string, OHLCV>();
  for (const c of candles) {
    map.set(c.timestamp, c); // last wins
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Incrementally update MA overlay lines from the latest data.
 * Recalculates the last point for each MA and calls update() to avoid
 * a full setData() which would reset the viewport.
 */
function updateMAFromData(
  data: OHLCV[],
  sma20: ISeriesApi<"Line"> | null,
  ema50: ISeriesApi<"Line"> | null,
  ema200: ISeriesApi<"Line"> | null,
) {
  if (data.length < 20) return;
  const lastTime = toTime(data[data.length - 1].timestamp);

  try {
    // SMA 20: average of last 20 closes
    if (sma20 && data.length >= 20) {
      let sum = 0;
      for (let i = data.length - 20; i < data.length; i++) sum += data[i].close;
      sma20.update({ time: lastTime, value: sum / 20 });
    }

    // EMA 50: recalculate from scratch for accuracy (fast enough for update)
    if (ema50 && data.length >= 50) {
      const period = 50;
      const alpha = 2 / (period + 1);
      let ema = 0;
      for (let i = 0; i < period; i++) ema += data[i].close;
      ema /= period;
      for (let i = period; i < data.length; i++) {
        ema = data[i].close * alpha + ema * (1 - alpha);
      }
      ema50.update({ time: lastTime, value: ema });
    }

    // EMA 200: recalculate from scratch
    if (ema200 && data.length >= 200) {
      const period = 200;
      const alpha = 2 / (period + 1);
      let ema = 0;
      for (let i = 0; i < period; i++) ema += data[i].close;
      ema /= period;
      for (let i = period; i < data.length; i++) {
        ema = data[i].close * alpha + ema * (1 - alpha);
      }
      ema200.update({ time: lastTime, value: ema });
    }
  } catch { /* stale update during symbol switch — ignore */ }
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
  const tpslPrimRef = useRef<TPSLHeatmapPrimitive | null>(null);
  const liqPrimRef = useRef<LiquidationHeatmapPrimitive | null>(null);
  const stopPrimRef = useRef<StopHeatmapPrimitive | null>(null);
  const mboPrimRef = useRef<MBOProfilePrimitive | null>(null);

  const { activeSymbol, activeTimeframe, setActiveTimeframe, setCandles, candles, livePrices, chartExpanded, toggleChartExpanded } = useMarketStore();
  const theme = useThemeStore((s) => s.theme);
  const [data, setData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredCandle, setHoveredCandle] = useState<OHLCV | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [showSessions, setShowSessions] = useState(true);
  const [showTPSL, setShowTPSL] = useState(false);
  const [showLiq, setShowLiq] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [showMBO, setShowMBO] = useState(false);
  const [isPannedAway, _setIsPannedAway] = useState(false);
  const isPannedRef = useRef(false);

  // Zone state
  const [zones, setZones] = useState<AccZone[]>([]);
  const [zoneShifts, setZoneShifts] = useState<ZoneShift[]>([]);
  const prevZonesRef = useRef<AccZone[]>([]);
  const [patternMarkers, setPatternMarkers] = useState<PatternMarker[]>([]);

  const livePrice = livePrices[activeSymbol]?.price;
  const cacheKey = `${activeSymbol}_${activeTimeframe}`;
  const canStream = isBinanceSymbol(activeSymbol);
  const isIntraday = ["1m", "5m", "15m", "1h", "4h"].includes(activeTimeframe);
  const isCrypto = getMarketType(activeSymbol) === "crypto";

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

    // TP/SL heatmap primitive
    const tpslPrim = new TPSLHeatmapPrimitive(theme);
    candleSeries.attachPrimitive(tpslPrim);

    // Liquidation heatmap primitive
    const liqPrim = new LiquidationHeatmapPrimitive(theme);
    candleSeries.attachPrimitive(liqPrim);

    // Stop heatmap primitive
    const stopPrim = new StopHeatmapPrimitive(theme);
    candleSeries.attachPrimitive(stopPrim);

    // MBO profile primitive
    const mboPrim = new MBOProfilePrimitive(theme);
    candleSeries.attachPrimitive(mboPrim);

    // Series markers plugin
    const markersPlugin = createSeriesMarkers(candleSeries, []);

    // Crosshair tooltip
    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData) {
        const candleData = param.seriesData.get(candleSeries);
        const volData = param.seriesData.get(volumeSeries);
        if (candleData && "open" in candleData) {
          const cd = candleData as { time: UTCTimestamp; open: number; high: number; low: number; close: number };
          const vol = volData && "value" in volData ? (volData as { value: number }).value : 0;
          setHoveredCandle({
            timestamp: new Date((cd.time as number) * 1000).toISOString(),
            open: cd.open,
            high: cd.high,
            low: cd.low,
            close: cd.close,
            volume: vol,
          });
        }
      } else {
        setHoveredCandle(null);
      }
    });

    // Detect panning (use ref to avoid re-renders during drag)
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      const d = dataRef.current;
      const panned = d.length > 0 && range.to < d.length - 2;
      if (panned !== isPannedRef.current) {
        isPannedRef.current = panned;
        _setIsPannedAway(panned);
      }
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
    tpslPrimRef.current = tpslPrim;
    liqPrimRef.current = liqPrim;
    stopPrimRef.current = stopPrim;
    mboPrimRef.current = mboPrim;

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
      tpslPrimRef.current = null;
      liqPrimRef.current = null;
      stopPrimRef.current = null;
      mboPrimRef.current = null;
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
    // Re-set volume data with new colors — save/restore viewport to avoid reset
    const currentData = dataRef.current;
    if (currentData.length > 0) {
      const tc = THEME_CANVAS[theme];
      const savedRange = chart.timeScale().getVisibleLogicalRange();
      volumeSeriesRef.current?.setData(
        currentData.map((c) => toVolumeData(c, tc.bullAlpha, tc.bearAlpha))
      );
      if (savedRange) {
        chart.timeScale().setVisibleLogicalRange(savedRange);
      }
    }
    accZonePrimRef.current?.setTheme(theme);
    tpslPrimRef.current?.setTheme(theme);
    liqPrimRef.current?.setTheme(theme);
    stopPrimRef.current?.setTheme(theme);
    mboPrimRef.current?.setTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  /* ──────────────────────────────────────────────────
     Symbol / Timeframe change — update chart config
     ────────────────────────────────────────────────── */
  useEffect(() => {
    const chart = chartRef.current;
    // Update price formatter for new symbol
    candleSeriesRef.current?.applyOptions({
      priceFormat: {
        type: "custom" as const,
        formatter: getPriceFormatter(activeSymbol),
        minMove: 0.00001,
      },
    });
    // Clear chart data immediately (fresh load in the fetch effect)
    setData([]);
    chartDataPushedRef.current = ""; // Allow new push for new symbol/tf
    pushDataToChart([]);
    // Force price scale reset so old Y-axis range doesn't persist
    if (chart) {
      chart.priceScale("right").applyOptions({ autoScale: true });
      chart.timeScale().fitContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, activeTimeframe]);

  /* ──────────────────────────────────────────────────
     Push data to chart series (full reset — resets viewport!)
     Only call when you INTENTIONALLY want to reset scroll.
     ────────────────────────────────────────────────── */
  const pushDataToChart = useCallback(
    (newData: OHLCV[]) => {
      const chart = chartRef.current;
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
      // Force chart to rescale Y-axis and fit all data after series update
      if (chart) {
        chart.priceScale("right").applyOptions({ autoScale: true });
        chart.timeScale().fitContent();
      }
    },
    [theme]
  );

  // Track whether we've already pushed data for the current symbol/timeframe
  // to avoid calling setData() again (which resets the viewport).
  const chartDataPushedRef = useRef("");

  /* ──────────────────────────────────────────────────
     Fetch historical data
     ────────────────────────────────────────────────── */
  const cacheTimestamps = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const sym = activeSymbol;
    const tf = activeTimeframe;
    const key = `${sym}_${tf}`;

    /**
     * Push data to chart ONLY if it hasn't been pushed yet for this key.
     * This prevents the viewport from resetting when the API response
     * arrives after cached data was already displayed.
     */
    const pushOnce = (d: OHLCV[]) => {
      if (chartDataPushedRef.current === key) return; // Already pushed
      chartDataPushedRef.current = key;
      pushDataToChart(d);
    };

    const load = async () => {
      // 1. Check Zustand cache first (instant)
      const cached = candles[key];
      const cacheAge = Date.now() - (cacheTimestamps.current[key] || 0);
      const CACHE_TTL = 2 * 60 * 1000;

      if (cached && cached.length > 0 && cacheAge < CACHE_TTL) {
        if (cancelled) return;
        setData(cached);
        pushOnce(cached);
        return;
      }

      // 2. Show cached data immediately if available (even if stale)
      if (cached && cached.length > 0) {
        if (cancelled) return;
        setData(cached);
        pushOnce(cached);
      } else {
        setLoading(true);
      }

      // 3. Try fast GET first (reads already-cached data from backend)
      try {
        const prices = await api.prices(sym, tf, 2000);
        if (cancelled) return;
        if (prices && prices.length > 0) {
          const sorted = deduplicateAndSort(prices);
          setData(sorted);
          setCandles(key, sorted);
          cacheTimestamps.current[key] = Date.now();
          pushOnce(sorted); // Only pushes if cached data wasn't already shown
          setLoading(false);
          // Trigger ingestion in background for fresh data next time
          api.fetchPrices(sym, tf, 2000).catch(() => {});
          return;
        }
      } catch {
        // GET failed, try with ingestion
      }

      // 4. Fallback: trigger ingestion then fetch
      try {
        await api.fetchPrices(sym, tf, 2000);
        if (cancelled) return;
        const prices = await api.prices(sym, tf, 2000);
        if (cancelled) return;
        const sorted = deduplicateAndSort(prices);
        setData(sorted);
        setCandles(key, sorted);
        cacheTimestamps.current[key] = Date.now();
        pushOnce(sorted);
      } catch (err) {
        console.error("Failed to load prices:", err);
        // Last resort: try smaller batch
        try {
          await api.fetchPrices(sym, tf, 500);
          if (cancelled) return;
          const prices = await api.prices(sym, tf, 500);
          if (cancelled) return;
          const sorted = deduplicateAndSort(prices);
          setData(sorted);
          setCandles(key, sorted);
          cacheTimestamps.current[key] = Date.now();
          pushOnce(sorted);
        } catch {
          // Data source may be unavailable
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, activeTimeframe]);

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
          try {
            candleSeriesRef.current?.update(toChartData(newCandle));
            volumeSeriesRef.current?.update(toVolumeData(newCandle, tc.bullAlpha, tc.bearAlpha));
          } catch { /* stale update — ignore */ }
          // Update moving averages incrementally
          updateMAFromData(updated, sma20Ref.current, ema50Ref.current, ema200Ref.current);
          return updated;
        }

        // Gap detected — re-fetch missing candles (use setData with viewport save/restore)
        if (gap > intervalMs * 2 && !gapRefetchDone.current) {
          gapRefetchDone.current = true;
          (async () => {
            try {
              const prices = await api.prices(activeSymbol, activeTimeframe, 200);
              if (prices.length > 0) {
                const sorted = deduplicateAndSort(prices);
                setData((existing) => {
                  const merged = deduplicateAndSort([...existing, ...sorted]);
                  const chart = chartRef.current;
                  const savedRange = chart?.timeScale().getVisibleLogicalRange();
                  // Update all series with merged data
                  candleSeriesRef.current?.setData(merged.map(toChartData));
                  volumeSeriesRef.current?.setData(
                    merged.map((c) => toVolumeData(c, tc.bullAlpha, tc.bearAlpha))
                  );
                  sma20Ref.current?.setData(computeSMA(merged, 20));
                  ema50Ref.current?.setData(computeEMA(merged, 50));
                  ema200Ref.current?.setData(computeEMA(merged, 200));
                  // Restore viewport position (no fitContent — keep user's scroll)
                  if (savedRange) {
                    chart?.timeScale().setVisibleLogicalRange(savedRange);
                  }
                  return merged;
                });
              }
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
          try {
            candleSeriesRef.current?.update(toChartData(newOHLCV));
            volumeSeriesRef.current?.update(toVolumeData(newOHLCV, tc.bullAlpha, tc.bearAlpha));
          } catch { /* stale update — ignore */ }
          const appended = [...prev.slice(-499), newOHLCV];
          updateMAFromData(appended, sma20Ref.current, ema50Ref.current, ema200Ref.current);
          return appended;
        }

        return prev;
      });
    });

    // Periodic background candle refresh (uses update() to preserve viewport)
    const bgRefresh = setInterval(async () => {
      try {
        const prices = await api.prices(activeSymbol, activeTimeframe, 10);
        const sorted = deduplicateAndSort(prices);
        if (sorted.length === 0) return;
        setData((prev) => {
          if (prev.length === 0) return sorted;
          const lastTs = prev[prev.length - 1].timestamp;
          const updated = [...prev];
          for (const c of sorted) {
            try {
              if (c.timestamp === lastTs) {
                updated[updated.length - 1] = c;
                candleSeriesRef.current?.update(toChartData(c));
                volumeSeriesRef.current?.update(toVolumeData(c, tc.bullAlpha, tc.bearAlpha));
              } else if (c.timestamp > lastTs) {
                updated.push(c);
                candleSeriesRef.current?.update(toChartData(c));
                volumeSeriesRef.current?.update(toVolumeData(c, tc.bullAlpha, tc.bearAlpha));
              }
            } catch { /* stale update — ignore */ }
          }
          const trimmed = updated.length > 2500 ? updated.slice(-2000) : updated;
          updateMAFromData(trimmed, sma20Ref.current, ema50Ref.current, ema200Ref.current);
          return trimmed;
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

    // Safe wrapper: series.update() can throw if called with stale time after symbol switch
    const safeUpdate = (series: ISeriesApi<"Candlestick"> | ISeriesApi<"Histogram"> | ISeriesApi<"Line"> | null, point: Parameters<ISeriesApi<"Candlestick">["update"]>[0]) => {
      try { series?.update(point as never); } catch { /* stale update — ignore */ }
    };

    // Fast poll: update last candle close price
    const quickPoll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/v1/prices/${sym}/latest`, { cache: "no-store" });
        if (cancelled) return; // check again after await
        if (res.ok) {
          const d = await res.json();
          if (cancelled) return;
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
              safeUpdate(candleSeriesRef.current, toChartData(newCandle));
              safeUpdate(volumeSeriesRef.current, toVolumeData(newCandle, tc.bullAlpha, tc.bearAlpha) as never);
              updateMAFromData(updated, sma20Ref.current, ema50Ref.current, ema200Ref.current);
              return updated;
            });
          }
        }
      } catch { /* ignore */ }
    };

    // Slow poll: fetch recent candles (use GET only, trigger ingestion in background)
    const candleRefresh = async () => {
      if (cancelled) return;
      try {
        const prices = await api.prices(sym, tf, 10);
        if (cancelled) return; // check again after await
        const newCandles = deduplicateAndSort(prices);
        if (newCandles.length === 0) return;

        setData((prev) => {
          if (prev.length === 0) return newCandles;
          const lastTs = prev[prev.length - 1].timestamp;
          const updated = [...prev];
          for (const c of newCandles) {
            if (c.timestamp === lastTs) {
              updated[updated.length - 1] = c;
              safeUpdate(candleSeriesRef.current, toChartData(c));
              safeUpdate(volumeSeriesRef.current, toVolumeData(c, tc.bullAlpha, tc.bearAlpha) as never);
            } else if (c.timestamp > lastTs) {
              updated.push(c);
              safeUpdate(candleSeriesRef.current, toChartData(c));
              safeUpdate(volumeSeriesRef.current, toVolumeData(c, tc.bullAlpha, tc.bearAlpha) as never);
            }
          }
          const trimmed = updated.length > 2500 ? updated.slice(-2000) : updated;
          updateMAFromData(trimmed, sma20Ref.current, ema50Ref.current, ema200Ref.current);
          return trimmed;
        });
        // Trigger ingestion in background for fresh data
        if (!cancelled) api.fetchPrices(sym, tf, 10).catch(() => {});
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
          // Only show patterns from the last 8 candles
          const last8Times = new Set(
            data.slice(-8).map((c: any) => new Date(c.timestamp ?? c.time).getTime()),
          );
          const markers: PatternMarker[] = result.patterns
            .filter((p: any) => p.strength >= 0.6)
            .filter((p: any) => last8Times.has(new Date(p.timestamp).getTime()))
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
    const CRYPTO_SYMBOLS = new Set(["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ETHBTC"]);
    const crypto = CRYPTO_SYMBOLS.has(activeSymbol);
    if (!crypto) {
      setZones([]);
      accZonePrimRef.current?.updateZones([], []);
      return;
    }

    const fetchZones = async () => {
      try {
        const ob = await api.orderBook(activeSymbol, 500);
        if (!ob) return;
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
     TP/SL Heatmap overlay
     ────────────────────────────────────────────────── */
  useEffect(() => {
    tpslPrimRef.current?.setVisible(showTPSL);
    if (!showTPSL) return;

    const fetchTPSL = async () => {
      try {
        const result = await api.tpslHeatmap(activeSymbol, 500);
        if (result.current_price > 0) {
          tpslPrimRef.current?.updateData(
            result.tp_clusters || [],
            result.sl_clusters || [],
            result.round_levels || [],
          );
        }
      } catch { /* ignore */ }
    };

    fetchTPSL();
    const interval = setInterval(fetchTPSL, 60000);
    return () => clearInterval(interval);
  }, [showTPSL, activeSymbol]);

  /* ──────────────────────────────────────────────────
     Liquidation Heatmap overlay (2D thermal)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    liqPrimRef.current?.setVisible(showLiq);
    if (!showLiq) return;

    const fetchLiq = async () => {
      try {
        const result = await api.liquidationHeatmap(activeSymbol, activeTimeframe, 200);
        if (result.columns?.length > 0) {
          liqPrimRef.current?.updateGrid(result);
        }
      } catch { /* ignore */ }
    };

    fetchLiq();
    const interval = setInterval(fetchLiq, 120_000);
    return () => clearInterval(interval);
  }, [showLiq, activeSymbol, activeTimeframe]);

  /* ──────────────────────────────────────────────────
     Stop Heatmap overlay (2D thermal — warm colors)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    stopPrimRef.current?.setVisible(showStops);
    if (!showStops) return;

    const fetchStops = async () => {
      try {
        const result = await api.stopHeatmap(activeSymbol, activeTimeframe, 200);
        if (result.columns?.length > 0) {
          stopPrimRef.current?.updateGrid(result);
        }
      } catch { /* ignore */ }
    };

    fetchStops();
    const interval = setInterval(fetchStops, 120_000);
    return () => clearInterval(interval);
  }, [showStops, activeSymbol, activeTimeframe]);

  /* ──────────────────────────────────────────────────
     MBO Profile overlay (orderbook depth bars)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    mboPrimRef.current?.setVisible(showMBO);
    if (!showMBO) return;

    const fetchMBO = async () => {
      try {
        const result = await api.mboProfile(activeSymbol, 500);
        if (result.current_price > 0) {
          mboPrimRef.current?.updateProfile(result);
        }
      } catch { /* ignore */ }
    };

    fetchMBO();
    const interval = setInterval(fetchMBO, 30_000);
    return () => clearInterval(interval);
  }, [showMBO, activeSymbol]);

  /* ──────────────────────────────────────────────────
     JSX
     ────────────────────────────────────────────────── */
  const buyZoneCount = zones.filter((z) => z.type === "buy").length;
  const sellZoneCount = zones.filter((z) => z.type === "sell").length;

  return (
    <div className="card-glass rounded-lg flex flex-col h-full overflow-hidden">
      {/* Header — symbol + live badge */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 border-b border-[var(--color-border-primary)]">
        <span className="text-sm md:text-base font-mono font-bold text-[var(--color-text-primary)] shrink-0">
          {activeSymbol}
        </span>
        {isLive && (
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-bull)] animate-pulse" />
            <span className="text-[10px] font-mono text-[var(--color-bull)] uppercase">Live</span>
          </span>
        )}
        {/* MA legend — desktop only */}
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
            {hoveredCandle.volume > 0 && (
              <span className="text-[var(--color-text-muted)]">
                V <span className="text-[var(--color-text-secondary)]">{formatVolume(hoveredCandle.volume)}</span>
              </span>
            )}
          </div>
        )}
        {zones.length > 0 && (
          <span className="hidden sm:inline text-[10px] font-mono text-[var(--color-text-muted)]">
            <span className="text-[var(--color-bull)]">{buyZoneCount}B</span>
            {" / "}
            <span className="text-[var(--color-bear)]">{sellZoneCount}S</span>
            {" zones"}
          </span>
        )}
        {/* Spacer + Expand button — always visible */}
        <div className="flex-1" />
        <button
          onClick={toggleChartExpanded}
          className={`
            shrink-0 px-2 py-1 text-sm md:text-[11px] font-mono rounded transition-all border min-h-[28px] md:min-h-[32px]
            ${chartExpanded
              ? "border-[var(--color-neon-blue)]/30 text-[var(--color-neon-blue)] bg-[var(--color-neon-blue)]/10"
              : "border-[var(--color-border-primary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }
          `}
          title={chartExpanded ? "Exit fullscreen" : "Expand chart"}
        >
          {chartExpanded ? "⊟" : "⊞"}
        </button>
      </div>
      {/* Controls toolbar — horizontally scrollable on mobile */}
      <div className="overflow-x-auto scrollbar-hide border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 min-w-max">
          {/* Overlay toggles */}
          {isIntraday && (
            <button
              onClick={() => setShowSessions(!showSessions)}
              className={`
                shrink-0 px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[28px]
                ${showSessions
                  ? "border-[var(--color-neon-purple)]/30 text-[var(--color-neon-purple)] bg-[var(--color-neon-purple)]/10"
                  : "border-[var(--color-border-primary)] text-[var(--color-text-muted)]"
                }
              `}
            >
              Sessions
            </button>
          )}
          <button
            onClick={() => setShowTPSL(!showTPSL)}
            className={`
              shrink-0 px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[28px]
              ${showTPSL
                ? "border-[var(--color-bull)]/30 text-[var(--color-bull)] bg-[var(--color-bull)]/10"
                : "border-[var(--color-border-primary)] text-[var(--color-text-muted)]"
              }
            `}
          >
            TP/SL
          </button>
          <button
            onClick={() => setShowLiq(!showLiq)}
            className={`
              shrink-0 px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[28px]
              ${showLiq
                ? "border-orange-500/30 text-orange-500 bg-orange-500/10"
                : "border-[var(--color-border-primary)] text-[var(--color-text-muted)]"
              }
            `}
          >
            Liq
          </button>
          <button
            onClick={() => setShowStops(!showStops)}
            className={`
              shrink-0 px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[28px]
              ${showStops
                ? "border-rose-500/30 text-rose-500 bg-rose-500/10"
                : "border-[var(--color-border-primary)] text-[var(--color-text-muted)]"
              }
            `}
          >
            Stops
          </button>
          <button
            onClick={() => setShowMBO(!showMBO)}
            className={`
              shrink-0 px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[28px]
              ${showMBO
                ? "border-pink-500/30 text-pink-500 bg-pink-500/10"
                : "border-[var(--color-border-primary)] text-[var(--color-text-muted)]"
              }
            `}
          >
            MBO
          </button>
          {/* Separator */}
          <div className="w-px h-5 bg-[var(--color-border-primary)] shrink-0 mx-0.5" />
          {/* Timeframe selector */}
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setActiveTimeframe(tf.value)}
              className={`
                shrink-0 px-2 py-1 text-[11px] md:text-sm font-mono rounded transition-all min-w-[28px] min-h-[28px] flex items-center justify-center
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
