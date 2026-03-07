"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LayoutGrid, RefreshCw, Link2, Link2Off, Clock } from "lucide-react";
import Header from "@/components/layout/Header";
import { api } from "@/lib/api";

// ── Constants ──

const LAYOUTS = [
  { id: "1x1", label: "1", cols: 1, rows: 1 },
  { id: "2x2", label: "4", cols: 2, rows: 2 },
  { id: "2x3", label: "6", cols: 3, rows: 2 },
  { id: "3x3", label: "9", cols: 3, rows: 3 },
] as const;

const SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
  "XAUUSD", "XAGUSD",
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD",
  "NAS100", "SPX500",
  "EURGBP", "EURJPY", "GBPJPY",
];

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

type LayoutId = (typeof LAYOUTS)[number]["id"];

// ── Mini Chart Component ──

interface MiniChartProps {
  symbol: string;
  timeframe: string;
  onSymbolChange: (s: string) => void;
  onTimeframeChange: (tf: string) => void;
}

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function MiniChart({ symbol, timeframe, onSymbolChange, onTimeframeChange }: MiniChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState<{ close: number; change: number } | null>(null);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.prices(symbol, timeframe, 100).then((d: CandleData[]) => {
      if (cancelled) return;
      setData(d ?? []);
      setLoading(false);
      if (d && d.length > 1) {
        const last = d[d.length - 1];
        const prev = d[d.length - 2];
        setPrice({
          close: last.close,
          change: ((last.close - prev.close) / prev.close) * 100,
        });
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  // Draw canvas chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    // Price range
    const closes = data.map((d) => d.close);
    const highs = data.map((d) => d.high);
    const lows = data.map((d) => d.low);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = max - min || 1;

    const candleW = Math.max(1, (W - 8) / data.length - 1);
    const gap = 1;

    data.forEach((candle, i) => {
      const x = 4 + i * (candleW + gap);
      const isUp = candle.close >= candle.open;

      // Wick
      const wickX = x + candleW / 2;
      const wickTop = H - ((candle.high - min) / range) * (H - 8) - 4;
      const wickBot = H - ((candle.low - min) / range) * (H - 8) - 4;
      ctx.strokeStyle = isUp ? "rgba(16, 185, 129, 0.5)" : "rgba(239, 68, 68, 0.5)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(wickX, wickTop);
      ctx.lineTo(wickX, wickBot);
      ctx.stroke();

      // Body
      const bodyTop = H - ((Math.max(candle.open, candle.close) - min) / range) * (H - 8) - 4;
      const bodyBot = H - ((Math.min(candle.open, candle.close) - min) / range) * (H - 8) - 4;
      const bodyH = Math.max(bodyBot - bodyTop, 1);

      ctx.fillStyle = isUp ? "rgba(16, 185, 129, 0.8)" : "rgba(239, 68, 68, 0.7)";
      ctx.fillRect(x, bodyTop, candleW, bodyH);
    });
  }, [data]);

  const isUp = price && price.change >= 0;

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-card)] border border-[var(--color-border-primary)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)]">
        <select
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          className="bg-transparent text-[10px] font-bold text-[var(--color-text-primary)] outline-none cursor-pointer"
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s} className="bg-[var(--color-bg-primary)]">{s}</option>
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
        <div className="flex-1" />
        {price && (
          <>
            <span className="text-[10px] font-mono font-bold text-[var(--color-text-primary)]">
              {price.close.toFixed(symbol.includes("JPY") ? 3 : symbol.includes("BTC") || symbol.includes("XAU") ? 2 : 5)}
            </span>
            <span className={`text-[9px] font-mono font-semibold ${isUp ? "text-[var(--color-bull)]" : "text-red-500"}`}>
              {isUp ? "+" : ""}{price.change.toFixed(2)}%
            </span>
          </>
        )}
      </div>

      {/* Chart canvas */}
      <div className="flex-1 relative min-h-0">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[var(--color-neon-blue)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data.length < 2 ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--color-text-muted)]">
            No data
          </div>
        ) : (
          <canvas ref={canvasRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}

// ── Main Layout ──

export default function MultiChartLayout() {
  const [layoutId, setLayoutId] = useState<LayoutId>("2x2");
  const [syncTf, setSyncTf] = useState(true);
  const [panels, setPanels] = useState(DEFAULT_PANELS.map((p, i) => ({ ...p, id: i })));

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

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex flex-col">
      <Header />

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[var(--color-neon-green)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Multi-Chart</span>
        </div>

        {/* Layout selector */}
        <div className="flex gap-1 p-0.5 bg-[var(--color-bg-card)] rounded">
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
          title={syncTf ? "Timeframes synced" : "Timeframes independent"}
        >
          {syncTf ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
          <Clock className="w-3 h-3" />
          Sync TF
        </button>
      </div>

      {/* Chart grid */}
      <div
        className="flex-1 grid gap-1 p-1"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        }}
      >
        {visiblePanels.map((panel, idx) => (
          <MiniChart
            key={panel.id}
            symbol={panel.symbol}
            timeframe={panel.timeframe}
            onSymbolChange={(s) => handleSymbolChange(idx, s)}
            onTimeframeChange={(tf) => handleTimeframeChange(idx, tf)}
          />
        ))}
      </div>
    </div>
  );
}
