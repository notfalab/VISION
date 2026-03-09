"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMarketStore } from "@/stores/market";
import { useThemeStore, THEME_CANVAS } from "@/stores/theme";
import { api } from "@/lib/api";
import { formatPrice, formatVolume, formatChange } from "@/lib/format";
import { updateDashboardURL } from "@/lib/url";
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
import { toast } from "sonner";
import { Camera } from "lucide-react";
import DrawingToolbar, { type DrawingMode } from "./DrawingToolbar";
import { TrendLinePrimitive, type TrendLineData, type HitResult } from "./primitives/TrendLinePrimitive";

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
 * Deduplicate by timestamp (keep last occurrence), validate, and sort ascending.
 * lightweight-charts requires strictly increasing time values.
 */
function deduplicateAndSort(candles: OHLCV[]): OHLCV[] {
  const map = new Map<string, OHLCV>();
  for (const c of candles) {
    // Skip clearly invalid candles
    if (c.open <= 0 || c.close <= 0 || c.volume < 0) continue;
    // Repair: ensure high/low encompass open/close
    c.high = Math.max(c.high, c.open, c.close);
    c.low = Math.min(c.low, c.open, c.close);
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
  const hasData = data.length > 0;
  const [loading, setLoading] = useState(false);
  const [hoveredCandle, setHoveredCandle] = useState<OHLCV | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [showSessions, setShowSessions] = useState(true);
  const [showTPSL, setShowTPSL] = useState(false);
  const [showLiq, setShowLiq] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [showMBO, setShowMBO] = useState(false);
  const [showWalls, setShowWalls] = useState(false);
  const wallLinesRef = useRef<any[]>([]);
  const [isPannedAway, _setIsPannedAway] = useState(false);

  const handleScreenshot = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const canvas = chart.takeScreenshot();
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(
          () => toast.success("Chart copied to clipboard"),
          () => downloadChartBlob(blob),
        );
      } else {
        downloadChartBlob(blob);
      }
    }, "image/png");
  }, []);

  const downloadChartBlob = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VISION_${activeSymbol}_${activeTimeframe}_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chart downloaded");
  }, [activeSymbol, activeTimeframe]);
  const isPannedRef = useRef(false);
  const [countdown, setCountdown] = useState("");

  // Drawing tools state
  const [drawingMode, setDrawingMode] = useState<DrawingMode>("none");
  const [drawings, setDrawings] = useState<{ type: string; id: string; price?: number; line?: TrendLineData }[]>([]);
  const [pendingPoint, setPendingPoint] = useState<{ time: number; price: number } | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const trendLinePrimRef = useRef<TrendLinePrimitive | null>(null);
  const hLinesRef = useRef<{ id: string; priceLine: any }[]>([]);
  const dragRef = useRef<{
    id: string;
    type: "hline" | "trendline";
    part: "body" | "p1" | "p2";
    startMouseY: number;
    startMouseX: number;
    origPrice?: number;
    origP1?: { time: number; price: number };
    origP2?: { time: number; price: number };
  } | null>(null);

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
  const activeSymbolRef = useRef(activeSymbol);
  activeSymbolRef.current = activeSymbol;

  /* ── Countdown timer: time until current candle closes ── */
  useEffect(() => {
    const intervalMs = getIntervalMs(activeTimeframe);
    const tick = () => {
      const now = Date.now();
      const remaining = intervalMs - (now % intervalMs);
      const totalSec = Math.floor(remaining / 1000);
      if (intervalMs >= 86_400_000) {
        // Daily/weekly: HH:MM:SS
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      } else if (intervalMs >= 3_600_000) {
        // Hourly: HH:MM:SS
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      } else {
        // Minutes: MM:SS
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        setCountdown(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTimeframe]);

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

    // Drawing tools primitive
    const trendPrim = new TrendLinePrimitive();
    candleSeries.attachPrimitive(trendPrim);
    trendLinePrimRef.current = trendPrim;

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
      trendLinePrimRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: create h-line on chart ──
  const createHLine = useCallback((price: number, selected = false) => {
    const series = candleSeriesRef.current;
    if (!series) return null;
    return series.createPriceLine({
      price,
      color: selected ? "#60a5fa" : "#f59e0b",
      lineWidth: selected ? 2 : 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "",
    });
  }, []);

  // ── Helper: hit-test h-lines ──
  const hitTestHLine = useCallback((cssY: number): { id: string } | null => {
    const series = candleSeriesRef.current;
    if (!series) return null;
    const THRESHOLD = 8;
    for (const entry of hLinesRef.current) {
      const drawing = drawings.find((d) => d.id === entry.id);
      if (!drawing?.price) continue;
      const coord = series.priceToCoordinate(drawing.price);
      if (coord !== null && Math.abs(cssY - coord) < THRESHOLD) return { id: entry.id };
    }
    return null;
  }, [drawings]);

  // ── Update h-line appearance on selection change ──
  useEffect(() => {
    for (const entry of hLinesRef.current) {
      const isSelected = entry.id === selectedDrawingId;
      try {
        entry.priceLine.applyOptions({
          color: isSelected ? "#60a5fa" : "#f59e0b",
          lineWidth: isSelected ? 2 : 1,
        });
      } catch {}
    }
    trendLinePrimRef.current?.setSelected(selectedDrawingId);
  }, [selectedDrawingId]);

  // ── Drawing: placement click handler (hline/trendline creation) ──
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;

    const container = chartContainerRef.current;

    // Update cursor
    if (drawingMode !== "none") {
      if (container) container.style.cursor = "crosshair";
    }

    const clickHandler = (param: any) => {
      if (!param.point || !param.time) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;
      const time = param.time as number;

      if (drawingMode === "hline") {
        const id = crypto.randomUUID();
        const priceLine = createHLine(price);
        if (priceLine) hLinesRef.current.push({ id, priceLine });
        setDrawings((prev) => [...prev, { type: "hline", id, price }]);
        setDrawingMode("none");
      } else if (drawingMode === "trendline") {
        if (!pendingPoint) {
          setPendingPoint({ time, price });
        } else {
          const id = crypto.randomUUID();
          const lineData: TrendLineData = {
            id,
            p1: pendingPoint,
            p2: { time, price },
            color: "#3b82f6",
            lineWidth: 1,
          };
          trendLinePrimRef.current?.addLine(lineData);
          setDrawings((prev) => [...prev, { type: "trendline", id, line: lineData }]);
          setPendingPoint(null);
          setDrawingMode("none");
        }
      } else {
        // Select mode — hit-test for selecting drawings
        const trendHit = trendLinePrimRef.current?.customHitTest(param.point.x, param.point.y);
        const hlineHit = hitTestHLine(param.point.y);
        const hitId = trendHit?.id || hlineHit?.id || null;
        setSelectedDrawingId(hitId);
      }
    };

    chart.subscribeClick(clickHandler);
    return () => {
      chart.unsubscribeClick(clickHandler);
      if (container) container.style.cursor = "";
    };
  }, [drawingMode, pendingPoint, createHLine, hitTestHLine]);

  // ── Drawing: mouse interaction (hover, drag) ──
  useEffect(() => {
    const container = chartContainerRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!container || !chart || !series) return;

    // Get chart pane element offset (area below the toolbar)
    const getOffset = () => {
      const rect = container.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    };

    const onMouseDown = (e: MouseEvent) => {
      if (drawingMode !== "none") return;
      const offset = getOffset();
      const x = e.clientX - offset.left;
      const y = e.clientY - offset.top;

      // Hit test trendlines
      const trendHit = trendLinePrimRef.current?.customHitTest(x, y);
      if (trendHit) {
        const line = trendLinePrimRef.current?.getLine(trendHit.id);
        if (line) {
          dragRef.current = {
            id: trendHit.id,
            type: "trendline",
            part: trendHit.part,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            origP1: { ...line.p1 },
            origP2: { ...line.p2 },
          };
          setSelectedDrawingId(trendHit.id);
          e.preventDefault();
          return;
        }
      }

      // Hit test h-lines
      const hlineHit = hitTestHLine(y);
      if (hlineHit) {
        const drawing = drawings.find((d) => d.id === hlineHit.id);
        if (drawing?.price) {
          dragRef.current = {
            id: hlineHit.id,
            type: "hline",
            part: "body",
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            origPrice: drawing.price,
          };
          setSelectedDrawingId(hlineHit.id);
          e.preventDefault();
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag) {
        // ── Dragging ──
        container.style.cursor = drag.part === "body" ? "grabbing" : "crosshair";

        if (drag.type === "hline" && drag.origPrice != null) {
          const origCoord = series.priceToCoordinate(drag.origPrice);
          if (origCoord === null) return;
          const newCoord = origCoord + (e.clientY - drag.startMouseY);
          const newPrice = series.coordinateToPrice(newCoord);
          if (newPrice === null) return;

          // Update the h-line
          const entry = hLinesRef.current.find((h) => h.id === drag.id);
          if (entry) {
            try { entry.priceLine.applyOptions({ price: newPrice }); } catch {}
          }
          // Update state (will persist on mouseup)
          setDrawings((prev) =>
            prev.map((d) => (d.id === drag.id ? { ...d, price: newPrice } : d)),
          );
        } else if (drag.type === "trendline" && drag.origP1 && drag.origP2) {
          const ts = chart.timeScale();
          const deltaY = e.clientY - drag.startMouseY;
          const deltaX = e.clientX - drag.startMouseX;

          if (drag.part === "body") {
            // Move both endpoints
            const origY1 = series.priceToCoordinate(drag.origP1.price);
            const origY2 = series.priceToCoordinate(drag.origP2.price);
            const origX1 = ts.timeToCoordinate(drag.origP1.time as any);
            const origX2 = ts.timeToCoordinate(drag.origP2.time as any);
            if (origY1 === null || origY2 === null || origX1 === null || origX2 === null) return;

            const newPrice1 = series.coordinateToPrice(origY1 + deltaY);
            const newPrice2 = series.coordinateToPrice(origY2 + deltaY);
            const newTime1 = ts.coordinateToTime(origX1 + deltaX);
            const newTime2 = ts.coordinateToTime(origX2 + deltaX);
            if (newPrice1 === null || newPrice2 === null || newTime1 === null || newTime2 === null) return;

            const newP1 = { time: newTime1 as number, price: newPrice1 as number };
            const newP2 = { time: newTime2 as number, price: newPrice2 as number };
            trendLinePrimRef.current?.updateLine(drag.id, newP1, newP2);
            setDrawings((prev) =>
              prev.map((d) =>
                d.id === drag.id && d.line ? { ...d, line: { ...d.line, p1: newP1, p2: newP2 } } : d,
              ),
            );
          } else {
            // Move single endpoint (p1 or p2)
            const origP = drag.part === "p1" ? drag.origP1 : drag.origP2;
            const otherP = drag.part === "p1" ? drag.origP2 : drag.origP1;
            const origY = series.priceToCoordinate(origP.price);
            const origX = ts.timeToCoordinate(origP.time as any);
            if (origY === null || origX === null) return;

            const newPrice = series.coordinateToPrice(origY + deltaY);
            const newTime = ts.coordinateToTime(origX + deltaX);
            if (newPrice === null || newTime === null) return;

            const movedP = { time: newTime as number, price: newPrice as number };
            const newP1 = drag.part === "p1" ? movedP : otherP;
            const newP2 = drag.part === "p2" ? movedP : otherP;
            trendLinePrimRef.current?.updateLine(drag.id, newP1, newP2);
            setDrawings((prev) =>
              prev.map((d) =>
                d.id === drag.id && d.line ? { ...d, line: { ...d.line, p1: newP1, p2: newP2 } } : d,
              ),
            );
          }
        }
        return;
      }

      // ── Hover (no drag) — only in select mode ──
      if (drawingMode !== "none") return;
      const offset = getOffset();
      const x = e.clientX - offset.left;
      const y = e.clientY - offset.top;

      const trendHit = trendLinePrimRef.current?.customHitTest(x, y);
      trendLinePrimRef.current?.setHovered(trendHit?.id ?? null);

      const hlineHit = hitTestHLine(y);
      if (trendHit || hlineHit) {
        const part = trendHit?.part;
        container.style.cursor =
          part === "p1" || part === "p2" ? "crosshair" : "grab";
      } else if (!dragRef.current) {
        container.style.cursor = "";
      }
    };

    const onMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        container.style.cursor = "";
      }
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [drawingMode, drawings, hitTestHLine]);

  // ── Keyboard: delete selected drawing ──
  useEffect(() => {
    if (!selectedDrawingId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't intercept if user is typing in an input
        if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
        deleteSelectedDrawing();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDrawingId]);

  // ── Persist drawings per symbol ──
  useEffect(() => {
    if (drawings.length > 0) {
      localStorage.setItem(`vision_drawings_${activeSymbol}`, JSON.stringify(drawings));
    } else {
      localStorage.removeItem(`vision_drawings_${activeSymbol}`);
    }
  }, [drawings, activeSymbol]);

  // ── Restore drawings when symbol changes ──
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (series) {
      for (const entry of hLinesRef.current) {
        try { series.removePriceLine(entry.priceLine); } catch {}
      }
    }
    hLinesRef.current = [];
    trendLinePrimRef.current?.setLines([]);
    setSelectedDrawingId(null);

    const stored = localStorage.getItem(`vision_drawings_${activeSymbol}`);
    if (!stored || !series) { setDrawings([]); return; }
    try {
      const parsed = JSON.parse(stored);
      const restoredDrawings: typeof drawings = [];
      for (const d of parsed) {
        if (d.type === "hline" && d.price) {
          const priceLine = createHLine(d.price);
          if (priceLine) hLinesRef.current.push({ id: d.id, priceLine });
          restoredDrawings.push(d);
        } else if (d.type === "trendline" && d.line) {
          trendLinePrimRef.current?.addLine(d.line);
          restoredDrawings.push(d);
        }
      }
      setDrawings(restoredDrawings);
    } catch {
      setDrawings([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol]);

  // ── Delete selected drawing ──
  const deleteSelectedDrawing = useCallback(() => {
    if (!selectedDrawingId) return;
    const series = candleSeriesRef.current;
    const drawing = drawings.find((d) => d.id === selectedDrawingId);

    if (drawing?.type === "hline" && series) {
      const entry = hLinesRef.current.find((h) => h.id === selectedDrawingId);
      if (entry) {
        try { series.removePriceLine(entry.priceLine); } catch {}
        hLinesRef.current = hLinesRef.current.filter((h) => h.id !== selectedDrawingId);
      }
    } else if (drawing?.type === "trendline") {
      trendLinePrimRef.current?.removeLine(selectedDrawingId);
    }

    setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  }, [selectedDrawingId, drawings]);

  // ── Clear all drawings ──
  const clearAllDrawings = useCallback(() => {
    const series = candleSeriesRef.current;
    if (series) {
      for (const entry of hLinesRef.current) {
        try { series.removePriceLine(entry.priceLine); } catch {}
      }
    }
    hLinesRef.current = [];
    trendLinePrimRef.current?.setLines([]);
    setDrawings([]);
    setPendingPoint(null);
    setDrawingMode("none");
    setSelectedDrawingId(null);
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
    (rawData: OHLCV[]) => {
      const chart = chartRef.current;
      if (rawData.length === 0) {
        candleSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
        sma20Ref.current?.setData([]);
        ema50Ref.current?.setData([]);
        ema200Ref.current?.setData([]);
        return;
      }
      // Safety dedupe — lightweight-charts requires strictly increasing times
      const newData = deduplicateAndSort(rawData);
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
      // Guard: ignore stale updates if symbol changed since subscription
      if (activeSymbolRef.current !== activeSymbol) return;

      setData((prev) => {
        if (prev.length === 0) return prev;

        const lastCandle = prev[prev.length - 1];
        const lastTs = new Date(lastCandle.timestamp).getTime();
        // Align WebSocket timestamp to candle boundary to avoid precision loss
        const alignedTs = Math.floor(candle.timestamp / intervalMs) * intervalMs;
        const gap = alignedTs - lastTs;

        // Same candle period — update in place
        if (Math.abs(gap) < intervalMs * 0.5) {
          const updated = [...prev];
          const newCandle: OHLCV = candle.isFinal
            ? {
                // isFinal: trust Binance's authoritative final values
                ...lastCandle,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
              }
            : {
                // Still building: merge high/low
                ...lastCandle,
                high: Math.max(lastCandle.high, candle.high),
                low: Math.min(lastCandle.low, candle.low),
                close: candle.close,
                volume: candle.volume,
              };
          updated[updated.length - 1] = newCandle;
          try {
            candleSeriesRef.current?.update(toChartData(newCandle));
            volumeSeriesRef.current?.update(toVolumeData(newCandle, tc.bullAlpha, tc.bearAlpha));
          } catch { /* stale update — ignore */ }
          updateMAFromData(updated, sma20Ref.current, ema50Ref.current, ema200Ref.current);
          return updated;
        }

        // Gap detected — re-fetch missing candles
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
                  candleSeriesRef.current?.setData(merged.map(toChartData));
                  volumeSeriesRef.current?.setData(
                    merged.map((c) => toVolumeData(c, tc.bullAlpha, tc.bearAlpha))
                  );
                  sma20Ref.current?.setData(computeSMA(merged, 20));
                  ema50Ref.current?.setData(computeEMA(merged, 50));
                  ema200Ref.current?.setData(computeEMA(merged, 200));
                  if (savedRange) {
                    chart?.timeScale().setVisibleLogicalRange(savedRange);
                  }
                  return merged;
                });
              }
            } catch {
              gapRefetchDone.current = false;
            }
          })();
        }

        // New candle — append
        if (alignedTs > lastTs) {
          const newOHLCV: OHLCV = {
            timestamp: new Date(alignedTs).toISOString(),
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
  }, [canStream, activeSymbol, activeTimeframe, hasData]);

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
        const d = await api.latestPrice(sym);
        if (cancelled || !d?.price) return;
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
    const quickInterval = setInterval(quickPoll, 3_000);
    const refreshInterval = setInterval(candleRefresh, 30_000);
    const firstRefresh = setTimeout(candleRefresh, 15_000);

    return () => {
      cancelled = true;
      clearInterval(quickInterval);
      clearInterval(refreshInterval);
      clearTimeout(firstRefresh);
      setIsLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStream, activeSymbol, activeTimeframe, hasData]);

  /* ──────────────────────────────────────────────────
     Pattern markers
     ────────────────────────────────────────────────── */
  useEffect(() => {
    if (data.length < 30) {
      setPatternMarkers([]);
      markersRef.current?.setMarkers([]);
      return;
    }
    let cancelled = false;
    const fetchPatterns = async () => {
      try {
        const result = await api.patternHistory(activeSymbol, activeTimeframe, Math.min(data.length, 50));
        if (cancelled) return;
        if (result?.patterns?.length > 0) {
          // Only show patterns from the last 8 candles
          const last8Times = new Set(
            data.slice(-8).map((c: any) => new Date(c.timestamp ?? c.time).getTime()),
          );
          // Only show strong reversal patterns (engulfing, stars, etc.)
          const STRONG_PATTERNS = new Set([
            "bullish_engulfing", "bearish_engulfing",
            "morning_star", "evening_star",
            "three_white_soldiers", "three_black_crows",
            "hammer", "shooting_star",
          ]);
          const markers: PatternMarker[] = result.patterns
            .filter((p: any) => p.strength >= 0.7 && STRONG_PATTERNS.has(p.pattern))
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
        if (!cancelled) setPatternMarkers([]);
      }
    };
    fetchPatterns();
    return () => { cancelled = true; };
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
    const crypto = getMarketType(activeSymbol) === "crypto";
    if (!crypto) {
      setZones([]);
      accZonePrimRef.current?.updateZones([], []);
      return;
    }

    let cancelled = false;
    const fetchZones = async () => {
      try {
        const ob = await api.orderBook(activeSymbol, 500);
        if (cancelled || !ob) return;
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
    return () => { cancelled = true; clearInterval(interval); };
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

    let cancelled = false;
    const fetchTPSL = async () => {
      try {
        const result = await api.tpslHeatmap(activeSymbol, 500);
        if (cancelled) return;
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
    return () => { cancelled = true; clearInterval(interval); };
  }, [showTPSL, activeSymbol]);

  /* ──────────────────────────────────────────────────
     Liquidation Heatmap overlay (2D thermal)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    liqPrimRef.current?.setVisible(showLiq);
    if (!showLiq) return;

    let cancelled = false;
    const fetchLiq = async () => {
      try {
        const result = await api.liquidationHeatmap(activeSymbol, activeTimeframe, 2000);
        if (cancelled) return;
        if (result.columns?.length > 0) {
          liqPrimRef.current?.updateGrid(result);
        }
      } catch { /* ignore */ }
    };

    fetchLiq();
    const interval = setInterval(fetchLiq, 120_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showLiq, activeSymbol, activeTimeframe]);

  /* ──────────────────────────────────────────────────
     Stop Heatmap overlay (2D thermal — warm colors)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    stopPrimRef.current?.setVisible(showStops);
    if (!showStops) return;

    let cancelled = false;
    const fetchStops = async () => {
      try {
        const result = await api.stopHeatmap(activeSymbol, activeTimeframe, 2000);
        if (cancelled) return;
        if (result.columns?.length > 0) {
          stopPrimRef.current?.updateGrid(result);
        }
      } catch { /* ignore */ }
    };

    fetchStops();
    const interval = setInterval(fetchStops, 120_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showStops, activeSymbol, activeTimeframe]);

  /* ──────────────────────────────────────────────────
     MBO Profile overlay (orderbook depth bars)
     ────────────────────────────────────────────────── */
  useEffect(() => {
    mboPrimRef.current?.setVisible(showMBO);
    if (!showMBO) return;

    let cancelled = false;
    const fetchMBO = async () => {
      try {
        const result = await api.mboProfile(activeSymbol, 500);
        if (cancelled) return;
        if (result.current_price > 0) {
          mboPrimRef.current?.updateProfile(result);
        }
      } catch { /* ignore */ }
    };

    fetchMBO();
    const interval = setInterval(fetchMBO, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showMBO, activeSymbol]);

  /* ──────────────────────────────────────────────────
     Buy/Sell Wall price lines overlay
     ────────────────────────────────────────────────── */
  useEffect(() => {
    // Clear previous wall lines
    const series = candleSeriesRef.current;
    if (series) {
      for (const line of wallLinesRef.current) {
        try { series.removePriceLine(line); } catch { /* ignore */ }
      }
      wallLinesRef.current = [];
    }

    if (!showWalls || !series) return;

    let cancelled = false;
    const fetchWalls = async () => {
      try {
        const result = await api.orderFlow(activeSymbol);
        if (cancelled || !result || !series) return;

        // Clear any previously drawn lines
        for (const line of wallLinesRef.current) {
          try { series.removePriceLine(line); } catch { /* ignore */ }
        }
        wallLinesRef.current = [];

        // Draw buy walls (green dashed lines)
        for (const w of (result.buy_walls || []).slice(0, 5)) {
          const line = series.createPriceLine({
            price: w.price,
            color: "rgba(34, 197, 94, 0.7)",
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: `BUY ${w.strength.toFixed(1)}x`,
          });
          wallLinesRef.current.push(line);
        }

        // Draw sell walls (red dashed lines)
        for (const w of (result.sell_walls || []).slice(0, 5)) {
          const line = series.createPriceLine({
            price: w.price,
            color: "rgba(239, 68, 68, 0.7)",
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: `SELL ${w.strength.toFixed(1)}x`,
          });
          wallLinesRef.current.push(line);
        }
      } catch { /* ignore */ }
    };

    fetchWalls();
    const interval = setInterval(fetchWalls, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      // Clean up lines on unmount/toggle off
      if (series) {
        for (const line of wallLinesRef.current) {
          try { series.removePriceLine(line); } catch { /* ignore */ }
        }
        wallLinesRef.current = [];
      }
    };
  }, [showWalls, activeSymbol]);

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
        {livePrices[activeSymbol] && (
          <div className="flex items-center gap-1.5 text-[12px] font-mono shrink-0">
            <span className="text-[var(--color-text-primary)] tabular-nums font-semibold">
              {formatPrice(livePrices[activeSymbol].price, activeSymbol)}
            </span>
            <span className={`text-[11px] tabular-nums ${livePrices[activeSymbol].change >= 0 ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}`}>
              {formatChange(livePrices[activeSymbol].change)}
            </span>
          </div>
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
        {/* Spacer + Screenshot + Expand button */}
        <div className="flex-1" />
        <button
          onClick={handleScreenshot}
          className="shrink-0 px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[28px] md:min-h-[32px] border-[var(--color-border-primary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          title="Screenshot (copy to clipboard)"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>
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
          <button
            onClick={() => setShowWalls(!showWalls)}
            className={`
              shrink-0 px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[28px]
              ${showWalls
                ? "border-cyan-500/30 text-cyan-500 bg-cyan-500/10"
                : "border-[var(--color-border-primary)] text-[var(--color-text-muted)]"
              }
            `}
          >
            Walls
          </button>
          {/* Separator — Drawing Tools */}
          <div className="w-px h-5 bg-[var(--color-border-primary)] shrink-0 mx-0.5" />
          <DrawingToolbar
            mode={drawingMode}
            onModeChange={setDrawingMode}
            onClearAll={clearAllDrawings}
            onDeleteSelected={deleteSelectedDrawing}
            drawingCount={drawings.length}
            hasSelection={!!selectedDrawingId}
          />
          {/* Separator */}
          <div className="w-px h-5 bg-[var(--color-border-primary)] shrink-0 mx-0.5" />
          {/* Timeframe selector */}
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => { setActiveTimeframe(tf.value); updateDashboardURL(activeSymbol, tf.value); }}
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
          {/* Candle close countdown */}
          {countdown && (
            <>
              <div className="w-px h-5 bg-[var(--color-border-primary)] shrink-0 mx-0.5" />
              <span className="shrink-0 text-[11px] font-mono text-[var(--color-text-muted)] tabular-nums">
                {countdown}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 relative min-h-0" style={{ touchAction: "manipulation" }}>
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
