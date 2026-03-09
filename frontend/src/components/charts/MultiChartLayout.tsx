"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  LayoutGrid,
  Link2,
  Link2Off,
  Clock,
  Camera,
  Layers,
  GitCompare,
  ChevronDown,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import { api } from "@/lib/api";
import { useThemeStore, THEME_CANVAS } from "@/stores/theme";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

// ── Constants ──

const LAYOUTS = [
  { id: "1x1", label: "1", cols: 1, rows: 1 },
  { id: "2x2", label: "4", cols: 2, rows: 2 },
  { id: "2x3", label: "6", cols: 3, rows: 2 },
  { id: "3x3", label: "9", cols: 3, rows: 3 },
] as const;

const SYMBOL_GROUPS: Record<string, string[]> = {
  "Forex Majors": ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"],
  "Forex Minors": [
    "EURGBP", "EURJPY", "GBPJPY", "EURCHF", "GBPAUD", "EURAUD", "GBPCAD",
    "AUDNZD", "AUDCAD", "AUDJPY", "NZDJPY", "CADJPY", "CADCHF", "NZDCAD",
    "EURNZD", "GBPCHF", "GBPNZD", "EURCAD", "AUDCHF", "NZDCHF", "CHFJPY",
  ],
  "Commodities": ["XAUUSD"],
  "Indices": ["NAS100", "SPX500"],
  "Crypto": [
    "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "BNBUSD", "ADAUSD",
    "PEPEUSD", "TRXUSD", "SUIUSD", "NEARUSD", "AVAXUSD", "LINKUSD", "LTCUSD",
    "AAVEUSD", "TAOUSD", "BCHUSD", "UNIUSD", "DOTUSD", "ICPUSD", "APTUSD",
    "SHIBUSD", "HBARUSD", "FILUSD", "XLMUSD", "ARBUSD", "SEIUSD", "TONUSD",
    "ONDOUSD", "BONKUSD", "ENAUSD", "WLDUSD", "TIAUSD", "RENDERUSD", "FTMUSD",
    "INJUSD", "OPUSD", "MATICUSD", "ATOMUSD", "WIFUSD",
  ],
};

const CRYPTO_SET = new Set(SYMBOL_GROUPS["Crypto"]);

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

const DEFAULT_PANELS = [
  { symbol: "EURUSD", timeframe: "1h" },
  { symbol: "GBPUSD", timeframe: "1h" },
  { symbol: "USDJPY", timeframe: "1h" },
  { symbol: "XAUUSD", timeframe: "1h" },
  { symbol: "BTCUSD", timeframe: "1h" },
  { symbol: "AUDUSD", timeframe: "1h" },
  { symbol: "ETHUSD", timeframe: "1h" },
  { symbol: "USDCAD", timeframe: "1h" },
  { symbol: "NAS100", timeframe: "1h" },
];

const PRESETS: { label: string; symbols: string[] }[] = [
  { label: "Forex Majors", symbols: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "XAUUSD", "NAS100"] },
  { label: "Crypto Top", symbols: ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "BNBUSD", "ADAUSD", "LINKUSD", "AVAXUSD"] },
  { label: "Cross-Market", symbols: ["EURUSD", "XAUUSD", "BTCUSD", "NAS100", "USDJPY", "ETHUSD", "GBPUSD", "SPX500", "SOLUSD"] },
];

type LayoutId = (typeof LAYOUTS)[number]["id"];

// ── Overlay types ──

type OverlayType = "liq" | "stops" | "tpsl" | "mbo" | "walls";

const OVERLAY_TYPES: OverlayType[] = ["liq", "stops", "tpsl", "mbo", "walls"];

const OVERLAY_LABELS: Record<OverlayType, string> = {
  liq: "LIQ",
  stops: "Stops",
  tpsl: "TP/SL",
  mbo: "MBO",
  walls: "Walls",
};

const OVERLAY_ACTIVE_COLORS: Record<OverlayType, string> = {
  liq: "text-orange-400 bg-orange-400/15",
  stops: "text-amber-400 bg-amber-400/15",
  tpsl: "text-emerald-400 bg-emerald-400/15",
  mbo: "text-cyan-400 bg-cyan-400/15",
  walls: "text-purple-400 bg-purple-400/15",
};

// ── Indicator types ──

type IndicatorType = "sma20" | "sma50" | "sma200" | "bb";

const INDICATOR_OPTIONS: { id: IndicatorType; label: string; color: string }[] = [
  { id: "sma20", label: "SMA 20", color: "#f59e0b" },
  { id: "sma50", label: "SMA 50", color: "#3b82f6" },
  { id: "sma200", label: "SMA 200", color: "#ef4444" },
  { id: "bb", label: "Bollinger", color: "#8b5cf6" },
];

// ── Overlay data fetcher ──

const _failedCache = new Map<string, number>();
const FAIL_TTL = 5 * 60_000;

function isCryptoSymbol(s: string) {
  return CRYPTO_SET.has(s);
}

async function fetchOverlayLines(
  type: OverlayType,
  symbol: string,
  timeframe: string,
  series: ISeriesApi<"Candlestick">,
): Promise<any[]> {
  const lines: any[] = [];

  if (type === "liq" && !isCryptoSymbol(symbol)) return lines;

  const cacheKey = `${type}:${symbol}`;
  const failedAt = _failedCache.get(cacheKey);
  if (failedAt && Date.now() - failedAt < FAIL_TTL) return lines;

  try {
    switch (type) {
      case "liq": {
        const data = await api.liquidationMap(symbol);
        if (!data?.levels?.length) return lines;
        const top = [...data.levels]
          .sort((a: any, b: any) => (b.long_liq_usd + b.short_liq_usd) - (a.long_liq_usd + a.short_liq_usd))
          .slice(0, 5);
        for (const level of top) {
          const isLong = level.long_liq_usd > level.short_liq_usd;
          lines.push(
            series.createPriceLine({
              price: level.price,
              color: isLong ? "#ef4444a0" : "#10b981a0",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: false,
              title: isLong ? "LIQ \u2193" : "LIQ \u2191",
            }),
          );
        }
        break;
      }
      case "stops": {
        const data = await api.stopHeatmap(symbol, timeframe);
        if (!data?.columns?.length || !data.n_levels) return lines;
        const n = data.n_levels;
        const sums = new Float64Array(n);
        for (const col of data.columns) {
          for (let i = 0; i < Math.min(col.v.length, n); i++) sums[i] += col.v[i];
        }
        const indexed = Array.from(sums).map((sum, i) => ({ sum, i }));
        const top = indexed.sort((a, b) => b.sum - a.sum).slice(0, 5);
        for (const { sum, i } of top) {
          if (sum === 0) break;
          const price = data.price_min + i * data.price_step;
          lines.push(
            series.createPriceLine({
              price,
              color: "#f59e0b90",
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
              title: "Stop",
            }),
          );
        }
        break;
      }
      case "tpsl": {
        const data = await api.tpslHeatmap(symbol);
        if (!data) return lines;
        const tps = (data.tp_clusters || []).sort((a: any, b: any) => b.volume - a.volume).slice(0, 3);
        const sls = (data.sl_clusters || []).sort((a: any, b: any) => b.volume - a.volume).slice(0, 3);
        for (const tp of tps) {
          lines.push(series.createPriceLine({ price: tp.price, color: "#10b981a0", lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: false, title: "TP" }));
        }
        for (const sl of sls) {
          lines.push(series.createPriceLine({ price: sl.price, color: "#ef4444a0", lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: false, title: "SL" }));
        }
        break;
      }
      case "mbo": {
        const data = await api.mboProfile(symbol);
        if (!data) return lines;
        const instBids = (data.bids || []).filter((b: any) => b.segment === "institutional").slice(0, 3);
        const instAsks = (data.asks || []).filter((a: any) => a.segment === "institutional").slice(0, 3);
        for (const bid of instBids) {
          lines.push(series.createPriceLine({ price: bid.price, color: "#06b6d4a0", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "MBO Bid" }));
        }
        for (const ask of instAsks) {
          lines.push(series.createPriceLine({ price: ask.price, color: "#e879f9a0", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "MBO Ask" }));
        }
        break;
      }
      case "walls": {
        const data = await api.deepOrderBook(symbol);
        if (!data) return lines;
        const topBids = (data.bids || []).sort((a: any, b: any) => b.quantity - a.quantity).slice(0, 3);
        const topAsks = (data.asks || []).sort((a: any, b: any) => b.quantity - a.quantity).slice(0, 3);
        for (const bid of topBids) {
          lines.push(series.createPriceLine({ price: bid.price, color: "#22c55ea0", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "Wall" }));
        }
        for (const ask of topAsks) {
          lines.push(series.createPriceLine({ price: ask.price, color: "#f43f5ea0", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "Wall" }));
        }
        break;
      }
    }
  } catch {
    _failedCache.set(cacheKey, Date.now());
  }
  return lines;
}

// ── Price precision ──

function getPrecision(symbol: string): number {
  if (symbol.includes("JPY")) return 3;
  if (symbol.includes("BTC") || symbol.includes("XAU")) return 2;
  if (symbol === "NAS100" || symbol === "SPX500") return 1;
  return 5;
}

// ── Score Circle ──

function ScoreCircle({ score, size = 20 }: { score: number; size?: number }) {
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#6b7280";
  const r = size / 2 - 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(100,100,120,0.2)" strokeWidth={2} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={size * 0.35}
        fontWeight="bold"
        fontFamily="JetBrains Mono"
      >
        {score}
      </text>
    </svg>
  );
}

// ── Mini Chart Component ──

interface MiniChartProps {
  symbol: string;
  timeframe: string;
  onSymbolChange: (s: string) => void;
  onTimeframeChange: (tf: string) => void;
  enabledIndicators: Set<IndicatorType>;
}

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function MiniChart({ symbol, timeframe, onSymbolChange, onTimeframeChange, enabledIndicators }: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const overlayLinesRef = useRef<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState<{ close: number; change: number } | null>(null);
  const [noData, setNoData] = useState(false);
  const [chartReady, setChartReady] = useState(0);
  const [compositeScore, setCompositeScore] = useState<number | null>(null);
  const [infoStrip, setInfoStrip] = useState<string>("");
  const [overlays, setOverlays] = useState<Record<OverlayType, boolean>>({
    liq: false, stops: false, tpsl: false, mbo: false, walls: false,
  });
  const theme = useThemeStore((s) => s.theme);

  const activeOverlayKey = useMemo(
    () => Object.entries(overlays).filter(([, v]) => v).map(([k]) => k).join(","),
    [overlays],
  );

  const toggleOverlay = useCallback((type: OverlayType) => {
    setOverlays((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const handleScreenshot = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const canvas = chart.takeScreenshot();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VISION_${symbol}_${timeframe}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${symbol} chart saved`);
    }, "image/png");
  }, [symbol, timeframe]);

  // Create chart on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const tc = THEME_CANVAS[theme];
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: tc.textMuted,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 9,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: tc.grid, style: LineStyle.Dotted },
        horzLines: { color: tc.grid, style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: tc.textMuted, width: 1, style: LineStyle.Dotted, labelBackgroundColor: "#1e293b" },
        horzLine: { color: tc.textMuted, width: 1, style: LineStyle.Dotted, labelBackgroundColor: "#1e293b" },
      },
      rightPriceScale: {
        borderColor: tc.grid,
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor: tc.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        barSpacing: 6,
        minBarSpacing: 2,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      autoSize: true,
    });

    const prec = getPrecision(symbol);
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b98180",
      wickDownColor: "#ef444480",
      priceFormat: { type: "price", precision: prec, minMove: 0.00001 },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    setChartReady((n) => n + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      indicatorSeriesRef.current = [];
      overlayLinesRef.current = [];
    };
  }, [theme]);

  // Fetch & set data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNoData(false);

    async function loadData() {
      let d: CandleData[] = await api.prices(symbol, timeframe, 200);

      if (!d || d.length < 2) {
        try {
          await api.fetchPrices(symbol, timeframe, 200);
          d = await api.prices(symbol, timeframe, 200);
        } catch {}
      }

      if (cancelled) return;

      if (!d || d.length < 2) {
        setLoading(false);
        setNoData(true);
        setPrice(null);
        return;
      }

      const sorted = [...d]
        .filter((c) => c.open > 0 && c.close > 0)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (sorted.length < 2) {
        setLoading(false);
        setNoData(true);
        return;
      }

      const candleData = sorted.map((c) => ({
        time: (new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const volData = sorted.map((c) => ({
        time: (new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
      }));

      candleSeriesRef.current?.setData(candleData);
      volumeSeriesRef.current?.setData(volData);
      chartRef.current?.timeScale().fitContent();

      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      setPrice({
        close: last.close,
        change: ((last.close - prev.close) / prev.close) * 100,
      });

      setLoading(false);
    }

    loadData().catch(() => {
      if (!cancelled) { setLoading(false); setNoData(true); }
    });

    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  // Update price precision
  useEffect(() => {
    const prec = getPrecision(symbol);
    candleSeriesRef.current?.applyOptions({
      priceFormat: { type: "price", precision: prec, minMove: 0.00001 },
    });
  }, [symbol]);

  // Indicator overlays
  useEffect(() => {
    if (!chartReady || loading) return;
    const chart = chartRef.current;
    if (!chart) return;

    // Remove existing indicator series
    for (const s of indicatorSeriesRef.current) {
      try { chart.removeSeries(s); } catch {}
    }
    indicatorSeriesRef.current = [];

    if (enabledIndicators.size === 0) return;

    let cancelled = false;

    async function loadIndicators() {
      try {
        const indData = await api.indicators(symbol, timeframe, 200);
        if (cancelled || !indData) return;

        // Parse indicator data — the response contains calculated indicator arrays
        // We need to extract MA, BB values keyed to timestamps
        const indicators = indData.indicators || indData;

        // Get OHLCV timestamps for alignment
        const candles = await api.prices(symbol, timeframe, 200);
        if (cancelled || !candles?.length) return;

        const sorted = [...candles]
          .filter((c: any) => c.open > 0)
          .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const closes = sorted.map((c: any) => c.close);
        const times = sorted.map((c: any) => (new Date(c.timestamp).getTime() / 1000) as UTCTimestamp);

        // Calculate SMA
        function calcSMA(data: number[], period: number): (number | null)[] {
          return data.map((_, i) => {
            if (i < period - 1) return null;
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += data[j];
            return sum / period;
          });
        }

        // Calculate BB
        function calcBB(data: number[], period = 20, mult = 2) {
          const sma = calcSMA(data, period);
          return sma.map((m, i) => {
            if (m === null) return { upper: null, lower: null, middle: m };
            let sumSq = 0;
            for (let j = i - period + 1; j <= i; j++) sumSq += (data[j] - m) ** 2;
            const std = Math.sqrt(sumSq / period);
            return { upper: m + mult * std, lower: m - mult * std, middle: m };
          });
        }

        const chart = chartRef.current;
        if (!chart || cancelled) return;

        if (enabledIndicators.has("sma20")) {
          const smaVals = calcSMA(closes, 20);
          const series = chart.addSeries(LineSeries, {
            color: "#f59e0b",
            lineWidth: 1,
            priceScaleId: "right",
            lastValueVisible: false,
            priceLineVisible: false,
          });
          series.setData(
            smaVals.map((v, i) => (v !== null ? { time: times[i], value: v } : null)).filter(Boolean) as any[],
          );
          indicatorSeriesRef.current.push(series);
        }

        if (enabledIndicators.has("sma50")) {
          const smaVals = calcSMA(closes, 50);
          const series = chart.addSeries(LineSeries, {
            color: "#3b82f6",
            lineWidth: 1,
            priceScaleId: "right",
            lastValueVisible: false,
            priceLineVisible: false,
          });
          series.setData(
            smaVals.map((v, i) => (v !== null ? { time: times[i], value: v } : null)).filter(Boolean) as any[],
          );
          indicatorSeriesRef.current.push(series);
        }

        if (enabledIndicators.has("sma200")) {
          const smaVals = calcSMA(closes, 200);
          const series = chart.addSeries(LineSeries, {
            color: "#ef4444",
            lineWidth: 1,
            priceScaleId: "right",
            lastValueVisible: false,
            priceLineVisible: false,
          });
          series.setData(
            smaVals.map((v, i) => (v !== null ? { time: times[i], value: v } : null)).filter(Boolean) as any[],
          );
          indicatorSeriesRef.current.push(series);
        }

        if (enabledIndicators.has("bb")) {
          const bb = calcBB(closes, 20, 2);
          const upperSeries = chart.addSeries(LineSeries, {
            color: "#8b5cf680",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            priceScaleId: "right",
            lastValueVisible: false,
            priceLineVisible: false,
          });
          const lowerSeries = chart.addSeries(LineSeries, {
            color: "#8b5cf680",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            priceScaleId: "right",
            lastValueVisible: false,
            priceLineVisible: false,
          });
          upperSeries.setData(
            bb.map((v, i) => (v.upper !== null ? { time: times[i], value: v.upper } : null)).filter(Boolean) as any[],
          );
          lowerSeries.setData(
            bb.map((v, i) => (v.lower !== null ? { time: times[i], value: v.lower } : null)).filter(Boolean) as any[],
          );
          indicatorSeriesRef.current.push(upperSeries, lowerSeries);
        }
      } catch {}
    }

    loadIndicators();
    return () => { cancelled = true; };
  }, [enabledIndicators, chartReady, loading, symbol, timeframe]);

  // Composite score + info strip
  useEffect(() => {
    let cancelled = false;
    async function loadComposite() {
      try {
        const data = await api.compositeScore(symbol, timeframe);
        if (!cancelled && data) {
          setCompositeScore(data.composite_score ?? null);
          const parts: string[] = [];
          if (data.regime) parts.push(`Regime: ${data.regime}`);
          if (data.direction) parts.push(`Dir: ${data.direction}`);
          if (data.rsi != null) parts.push(`RSI: ${Number(data.rsi).toFixed(0)}`);
          if (data.atr != null) parts.push(`ATR: ${Number(data.atr).toFixed(data.atr < 1 ? 5 : 2)}`);
          setInfoStrip(parts.join(" • "));
        }
      } catch {}
    }
    loadComposite();
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  // Overlay rendering
  useEffect(() => {
    if (loading || !chartReady) return;
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const line of overlayLinesRef.current) {
      try { series.removePriceLine(line); } catch {}
    }
    overlayLinesRef.current = [];

    if (!activeOverlayKey) return;

    let cancelled = false;

    async function loadOverlays() {
      const active = activeOverlayKey.split(",") as OverlayType[];
      for (const type of active) {
        if (cancelled) break;
        const newLines = await fetchOverlayLines(type, symbol, timeframe, series!);
        if (!cancelled) overlayLinesRef.current.push(...newLines);
      }
    }

    loadOverlays();
    return () => { cancelled = true; };
  }, [loading, chartReady, activeOverlayKey, symbol, timeframe]);

  const isUp = price && price.change >= 0;

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-card)] border border-[var(--color-border-primary)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)]">
        <select
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          className="bg-transparent text-[10px] font-bold text-[var(--color-text-primary)] outline-none cursor-pointer"
        >
          {Object.entries(SYMBOL_GROUPS).map(([group, syms]) => (
            <optgroup key={group} label={group}>
              {syms.map((s) => (
                <option key={s} value={s} className="bg-[var(--color-bg-primary)]">{s}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={timeframe}
          onChange={(e) => onTimeframeChange(e.target.value)}
          className="bg-transparent text-[9px] text-[var(--color-text-muted)] outline-none cursor-pointer"
        >
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf} className="bg-[var(--color-bg-primary)]">{tf}</option>
          ))}
        </select>

        {/* Overlay toggles */}
        <div className="flex gap-px ml-1">
          {OVERLAY_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => toggleOverlay(type)}
              className={`px-1 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${
                overlays[type]
                  ? OVERLAY_ACTIVE_COLORS[type]
                  : "text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)]"
              }`}
              title={OVERLAY_LABELS[type]}
            >
              {OVERLAY_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Composite score */}
        {compositeScore != null && <ScoreCircle score={compositeScore} size={18} />}

        <button
          onClick={handleScreenshot}
          className="p-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
          title="Screenshot"
        >
          <Camera className="w-3 h-3 text-[var(--color-text-muted)]" />
        </button>
        {price && (
          <>
            <span className="text-[10px] font-mono font-bold text-[var(--color-text-primary)]">
              {price.close.toFixed(getPrecision(symbol))}
            </span>
            <span className={`text-[9px] font-mono font-semibold ${isUp ? "text-[var(--color-bull)]" : "text-red-500"}`}>
              {isUp ? "+" : ""}{price.change.toFixed(2)}%
            </span>
          </>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 relative" style={{ minHeight: 100 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-5 h-5 border-2 border-[var(--color-neon-blue)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {noData && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 text-[10px] text-[var(--color-text-muted)]">
            No data
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      {/* Info strip */}
      {infoStrip && (
        <div className="px-2 py-0.5 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-primary)] text-[8px] font-mono text-[var(--color-text-muted)] truncate">
          {infoStrip}
        </div>
      )}
    </div>
  );
}

// ── Main Layout ──

export default function MultiChartLayout() {
  const [layoutId, setLayoutId] = useState<LayoutId>("2x2");
  const [syncTf, setSyncTf] = useState(false);
  const [panels, setPanels] = useState(DEFAULT_PANELS.map((p, i) => ({ ...p, id: i })));
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [enabledIndicators, setEnabledIndicators] = useState<Set<IndicatorType>>(new Set());
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  const layout = LAYOUTS.find((l) => l.id === layoutId)!;
  const visibleCount = layout.cols * layout.rows;
  const visiblePanels = panels.slice(0, visibleCount);

  const handleSymbolChange = useCallback((idx: number, symbol: string) => {
    setPanels((prev) => prev.map((p, i) => (i === idx ? { ...p, symbol } : p)));
  }, []);

  const handleTimeframeChange = useCallback(
    (idx: number, timeframe: string) => {
      setPanels((prev) =>
        prev.map((p, i) => {
          if (syncTf) return { ...p, timeframe };
          return i === idx ? { ...p, timeframe } : p;
        }),
      );
    },
    [syncTf],
  );

  const toggleIndicator = useCallback((ind: IndicatorType) => {
    setEnabledIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind);
      else next.add(ind);
      return next;
    });
  }, []);

  const applyPreset = useCallback((symbols: string[]) => {
    setPanels((prev) =>
      prev.map((p, i) => ({
        ...p,
        symbol: symbols[i] || p.symbol,
      })),
    );
    setShowPresetMenu(false);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex flex-col">
      <Header />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] flex-wrap">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[var(--color-neon-green)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Multi-Chart</span>
        </div>

        {/* Layout selector */}
        <div className="flex gap-1 p-0.5 bg-[var(--color-bg-card)] rounded border border-[var(--color-border-primary)]">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLayoutId(l.id)}
              className={`w-7 h-7 rounded text-[10px] font-bold transition-all ${
                layoutId === l.id
                  ? "bg-[var(--color-neon-green)]/20 text-[var(--color-neon-green)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Sync toggle */}
        <button
          onClick={() => setSyncTf(!syncTf)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
            syncTf
              ? "text-[var(--color-neon-green)] bg-[var(--color-neon-green)]/10"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
          }`}
        >
          {syncTf ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
          <Clock className="w-3 h-3" />
          Sync TF
        </button>

        {/* Indicator dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowIndicatorMenu(!showIndicatorMenu); setShowPresetMenu(false); }}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
              enabledIndicators.size > 0
                ? "text-[var(--color-neon-blue)] bg-[var(--color-neon-blue)]/10"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Indicators
            {enabledIndicators.size > 0 && (
              <span className="ml-0.5 px-1 py-0 rounded bg-[var(--color-neon-blue)]/20 text-[8px]">
                {enabledIndicators.size}
              </span>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showIndicatorMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg shadow-xl overflow-hidden">
              {INDICATOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => toggleIndicator(opt.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[10px] hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <div
                    className={`w-3 h-3 rounded border-2 transition-colors ${
                      enabledIndicators.has(opt.id)
                        ? "border-transparent"
                        : "border-[var(--color-text-muted)]/30"
                    }`}
                    style={{
                      backgroundColor: enabledIndicators.has(opt.id) ? opt.color : "transparent",
                    }}
                  />
                  <span
                    className={`font-semibold ${
                      enabledIndicators.has(opt.id) ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="w-4 h-0.5 ml-auto rounded" style={{ backgroundColor: opt.color }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Presets dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowPresetMenu(!showPresetMenu); setShowIndicatorMenu(false); }}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Presets
            <ChevronDown className="w-3 h-3" />
          </button>
          {showPresetMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg shadow-xl overflow-hidden">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset.symbols)}
                  className="w-full text-left px-3 py-2 text-[10px] font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart grid */}
      <div
        className="flex-1 grid gap-1 p-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
          height: "calc(100vh - 100px)",
        }}
      >
        {visiblePanels.map((panel, idx) => (
          <MiniChart
            key={`${panel.id}-${layoutId}`}
            symbol={panel.symbol}
            timeframe={panel.timeframe}
            onSymbolChange={(s) => handleSymbolChange(idx, s)}
            onTimeframeChange={(tf) => handleTimeframeChange(idx, tf)}
            enabledIndicators={enabledIndicators}
          />
        ))}
      </div>
    </div>
  );
}
