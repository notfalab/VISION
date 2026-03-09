"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Grid3X3,
  AlertTriangle,
  RefreshCw,
  X,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import Header from "@/components/layout/Header";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";

// ── Types ──

interface CorrelationData {
  symbols: string[];
  matrix: number[][];
  correlation_breaks: {
    pair: [string, string];
    historical: number;
    current: number;
    break_magnitude: number;
    significance: string;
  }[];
  period_days: number;
  group: string;
}

type Period = 30 | 60 | 90;
type Group = "forex" | "crypto" | "all";

// ── Color Helpers ──

function getCorrelationColor(val: number): string {
  const abs = Math.min(Math.abs(val), 1);
  const intensity = abs;
  if (val > 0.05) {
    // Green gradient
    const r = Math.round(16 + (1 - intensity) * 10);
    const g = Math.round(80 + intensity * 105);
    const b = Math.round(60 + intensity * 69);
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (val < -0.05) {
    // Red gradient
    const r = Math.round(100 + intensity * 139);
    const g = Math.round(40 + (1 - intensity) * 28);
    const b = Math.round(40 + (1 - intensity) * 28);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return "rgb(30, 30, 50)";
}

function getCorrelationAlpha(val: number): number {
  return Math.min(Math.abs(val) * 0.9 + 0.1, 0.95);
}

// ── Canvas Heatmap ──

function CanvasHeatmap({
  symbols,
  matrix,
  cellSize,
  breakPairs,
  onCellClick,
  hoveredCell,
  onHover,
}: {
  symbols: string[];
  matrix: number[][];
  cellSize: number;
  breakPairs: Set<string>;
  onCellClick: (row: number, col: number) => void;
  hoveredCell: { row: number; col: number } | null;
  onHover: (cell: { row: number; col: number } | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headerSize = 60;
  const totalW = headerSize + symbols.length * cellSize;
  const totalH = headerSize + symbols.length * cellSize;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !symbols.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalW, totalH);

    // Background
    ctx.fillStyle = "rgb(12, 12, 20)";
    ctx.fillRect(0, 0, totalW, totalH);

    // Column headers (rotated)
    ctx.save();
    ctx.font = `bold ${Math.min(cellSize * 0.22, 11)}px JetBrains Mono, monospace`;
    ctx.fillStyle = "rgba(180, 180, 200, 0.6)";
    ctx.textAlign = "right";
    for (let i = 0; i < symbols.length; i++) {
      const x = headerSize + i * cellSize + cellSize / 2;
      const y = headerSize - 4;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 3);
      ctx.fillText(symbols[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Row headers
    ctx.font = `bold ${Math.min(cellSize * 0.22, 11)}px JetBrains Mono, monospace`;
    ctx.fillStyle = "rgba(180, 180, 200, 0.6)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < symbols.length; i++) {
      const y = headerSize + i * cellSize + cellSize / 2;
      ctx.fillText(symbols[i], headerSize - 6, y);
    }

    // Cells
    for (let ri = 0; ri < symbols.length; ri++) {
      for (let ci = 0; ci < symbols.length; ci++) {
        const x = headerSize + ci * cellSize;
        const y = headerSize + ri * cellSize;
        const val = matrix[ri]?.[ci] ?? 0;
        const isDiag = ri === ci;
        const isHovered =
          hoveredCell && (hoveredCell.row === ri || hoveredCell.col === ci);
        const isExactHover =
          hoveredCell && hoveredCell.row === ri && hoveredCell.col === ci;
        const isBreak = breakPairs.has(`${symbols[ri]}:${symbols[ci]}`);

        // Cell background
        if (isDiag) {
          ctx.fillStyle = "rgba(167, 139, 250, 0.7)"; // neon-blue diagonal
        } else {
          const color = getCorrelationColor(val);
          const alpha = getCorrelationAlpha(val);
          ctx.globalAlpha = isHovered ? Math.min(alpha + 0.15, 1) : alpha;
          ctx.fillStyle = color;
        }

        // Rounded rect
        const pad = 1;
        const r = 2;
        const cx = x + pad;
        const cy = y + pad;
        const cw = cellSize - pad * 2;
        const ch = cellSize - pad * 2;
        ctx.beginPath();
        ctx.moveTo(cx + r, cy);
        ctx.lineTo(cx + cw - r, cy);
        ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + r);
        ctx.lineTo(cx + cw, cy + ch - r);
        ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - r, cy + ch);
        ctx.lineTo(cx + r, cy + ch);
        ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - r);
        ctx.lineTo(cx, cy + r);
        ctx.quadraticCurveTo(cx, cy, cx + r, cy);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        // Break indicator border
        if (isBreak && !isDiag) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Exact hover border
        if (isExactHover && !isDiag) {
          ctx.strokeStyle = "rgba(167, 139, 250, 0.8)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Cell value text
        if (cellSize >= 36) {
          const displayVal = isDiag ? "1.00" : val.toFixed(2);
          if (isDiag || Math.abs(val) > 0.05) {
            ctx.font = `bold ${Math.min(cellSize * 0.24, 12)}px JetBrains Mono, monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = isDiag
              ? "white"
              : Math.abs(val) > 0.5
              ? "rgba(255,255,255,0.9)"
              : "rgba(255,255,255,0.5)";
            ctx.fillText(displayVal, x + cellSize / 2, y + cellSize / 2);
          }
        }
      }
    }
  }, [symbols, matrix, cellSize, hoveredCell, breakPairs, totalW, totalH, headerSize]);

  // Mouse handlers
  const getCell = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = totalW / rect.width;
      const scaleY = totalH / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      const col = Math.floor((mx - headerSize) / cellSize);
      const row = Math.floor((my - headerSize) / cellSize);
      if (row >= 0 && row < symbols.length && col >= 0 && col < symbols.length) {
        return { row, col };
      }
      return null;
    },
    [totalW, totalH, cellSize, symbols.length, headerSize],
  );

  return (
    <canvas
      ref={canvasRef}
      style={{ width: totalW, height: totalH, cursor: "crosshair" }}
      onMouseMove={(e) => onHover(getCell(e))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        const cell = getCell(e);
        if (cell && cell.row !== cell.col) onCellClick(cell.row, cell.col);
      }}
    />
  );
}

// ── Pair Detail Sidebar ──

function PairDetailPanel({
  symbolA,
  symbolB,
  correlation,
  breakInfo,
  period,
  onClose,
}: {
  symbolA: string;
  symbolB: string;
  correlation: number;
  breakInfo?: {
    historical: number;
    current: number;
    break_magnitude: number;
    significance: string;
  };
  period: number;
  onClose: () => void;
}) {
  const [pricesA, setPricesA] = useState<{ date: string; close: number }[]>([]);
  const [pricesB, setPricesB] = useState<{ date: string; close: number }[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingPrices(true);

    async function loadPrices() {
      try {
        const [dataA, dataB] = await Promise.all([
          api.prices(symbolA, "1d", period),
          api.prices(symbolB, "1d", period),
        ]);
        if (!cancelled) {
          setPricesA(
            (dataA || [])
              .sort(
                (a: any, b: any) =>
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
              )
              .map((c: any) => ({ date: c.timestamp?.slice(0, 10) ?? "", close: c.close })),
          );
          setPricesB(
            (dataB || [])
              .sort(
                (a: any, b: any) =>
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
              )
              .map((c: any) => ({ date: c.timestamp?.slice(0, 10) ?? "", close: c.close })),
          );
        }
      } catch {}
      if (!cancelled) setLoadingPrices(false);
    }

    loadPrices();
    return () => {
      cancelled = true;
    };
  }, [symbolA, symbolB, period]);

  // Normalize prices to % change from first
  const chartData = useMemo(() => {
    if (!pricesA.length || !pricesB.length) return [];
    const baseA = pricesA[0].close;
    const baseB = pricesB[0].close;
    if (!baseA || !baseB) return [];

    const minLen = Math.min(pricesA.length, pricesB.length);
    return Array.from({ length: minLen }, (_, i) => ({
      date: pricesA[i]?.date ?? "",
      [symbolA]: ((pricesA[i].close - baseA) / baseA) * 100,
      [symbolB]: ((pricesB[i]?.close ?? baseB) - baseB) / baseB * 100,
    }));
  }, [pricesA, pricesB, symbolA, symbolB]);

  const isPositive = correlation > 0;
  const isStrong = Math.abs(correlation) > 0.7;
  const hasBreak = breakInfo && breakInfo.break_magnitude > 0.2;

  // Trading implication
  let implication = "";
  if (isStrong && isPositive) {
    implication = hasBreak
      ? "These pairs typically move together, but currently diverging. Potential mean-reversion opportunity."
      : "Strong positive correlation — these pairs tend to move in the same direction.";
  } else if (isStrong && !isPositive) {
    implication = hasBreak
      ? "These pairs are normally inversely correlated, but the relationship has weakened. Monitor for regime change."
      : "Strong inverse correlation — when one rises, the other tends to fall.";
  } else if (Math.abs(correlation) < 0.3) {
    implication = "Low correlation — these pairs move independently.";
  } else {
    implication = "Moderate correlation — partial co-movement.";
  }

  return (
    <div className="w-[320px] bg-[var(--color-bg-secondary)] border-l border-[var(--color-border-primary)] flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--color-text-primary)]">{symbolA}</span>
          <ArrowRight className="w-3 h-3 text-[var(--color-text-muted)]" />
          <span className="text-sm font-bold text-[var(--color-text-primary)]">{symbolB}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
        >
          <X className="w-4 h-4 text-[var(--color-text-muted)]" />
        </button>
      </div>

      {/* Correlation value */}
      <div className="px-4 py-4 text-center border-b border-[var(--color-border-primary)]">
        <div
          className="text-3xl font-bold font-mono"
          style={{ color: isPositive ? "#10b981" : "#ef4444" }}
        >
          {correlation > 0 ? "+" : ""}
          {correlation.toFixed(3)}
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)] mt-1">
          Correlation ({period}d)
        </div>

        {breakInfo && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-neon-amber)]" />
            <span className="text-[10px] text-[var(--color-neon-amber)]">
              Break: {breakInfo.historical.toFixed(2)} → {breakInfo.current.toFixed(2)} (Δ
              {breakInfo.break_magnitude.toFixed(2)})
            </span>
          </div>
        )}
      </div>

      {/* Dual sparkline */}
      <div className="px-4 py-3 border-b border-[var(--color-border-primary)]">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          Normalized Price Comparison
        </div>
        {loadingPrices ? (
          <div className="h-[120px] flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[var(--color-neon-cyan)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-primary)" />
              <XAxis dataKey="date" hide />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-border-primary)",
                  borderRadius: 8,
                  fontSize: 10,
                }}
                formatter={(v: unknown) => [`${Number(v)?.toFixed(2) ?? 0}%`]}
              />
              <Line
                type="monotone"
                dataKey={symbolA}
                stroke="#a78bfa"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey={symbolB}
                stroke="#10b981"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[120px] flex items-center justify-center text-[10px] text-[var(--color-text-muted)]">
            No price data available
          </div>
        )}
        <div className="flex justify-center gap-4 mt-1 text-[9px]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-[#a78bfa] inline-block" />
            {symbolA}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-[#10b981] inline-block" />
            {symbolB}
          </span>
        </div>
      </div>

      {/* Trading Implication */}
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          Trading Insight
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{implication}</p>
      </div>
    </div>
  );
}

// ── Main Component ──

export default function CorrelationsMatrix() {
  const [period, setPeriod] = useState<Period>(30);
  const [group, setGroup] = useState<Group>("forex");
  const [cellSize, setCellSize] = useState(48);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ row: number; col: number } | null>(null);

  const { data, loading, refresh } = useApiData<CorrelationData>(
    () => api.marketCorrelations(period, group),
    [period, group],
    { interval: 300_000, key: `corr:${period}:${group}` },
  );

  const breakPairs = useMemo(() => {
    if (!data?.correlation_breaks) return new Set<string>();
    const set = new Set<string>();
    for (const b of data.correlation_breaks) {
      set.add(`${b.pair[0]}:${b.pair[1]}`);
      set.add(`${b.pair[1]}:${b.pair[0]}`);
    }
    return set;
  }, [data]);

  const breakMap = useMemo(() => {
    const map = new Map<string, CorrelationData["correlation_breaks"][0]>();
    if (!data?.correlation_breaks) return map;
    for (const b of data.correlation_breaks) {
      map.set(`${b.pair[0]}:${b.pair[1]}`, b);
      map.set(`${b.pair[1]}:${b.pair[0]}`, b);
    }
    return map;
  }, [data]);

  const symbols = data?.symbols ?? [];
  const matrix = data?.matrix ?? [];

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (row === col) return;
      setSelectedPair((prev) =>
        prev?.row === row && prev?.col === col ? null : { row, col },
      );
    },
    [],
  );

  // Tooltip text
  const tooltipText = useMemo(() => {
    if (!hoveredCell || !symbols.length) return "";
    const { row, col } = hoveredCell;
    if (row === col) return symbols[row];
    const val = matrix[row]?.[col] ?? 0;
    return `${symbols[row]} / ${symbols[col]}: ${val.toFixed(3)}`;
  }, [hoveredCell, symbols, matrix]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* ── Title ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-neon-cyan)]/10">
              <Grid3X3 className="w-5 h-5 text-[var(--color-neon-cyan)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--color-text-primary)]">
                Correlation Matrix
              </h1>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {symbols.length}×{symbols.length} matrix • {period}d period •
                Click a cell for details
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors border border-[var(--color-border-primary)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-4 mb-5">
          <div className="flex gap-1 p-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg">
            {([30, 60, 90] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  period === p
                    ? "bg-[var(--color-neon-cyan)]/15 text-[var(--color-neon-cyan)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
          <div className="flex gap-1 p-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg">
            {(["forex", "crypto", "all"] as Group[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase transition-all ${
                  group === g
                    ? "bg-[var(--color-neon-cyan)]/15 text-[var(--color-neon-cyan)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">Cell size</span>
            <input
              type="range"
              min={36}
              max={80}
              value={cellSize}
              onChange={(e) => setCellSize(Number(e.target.value))}
              className="w-20 accent-[var(--color-neon-cyan)]"
            />
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{cellSize}px</span>
          </div>
        </div>

        {/* ── Correlation Breaks ── */}
        {data?.correlation_breaks && data.correlation_breaks.length > 0 && (
          <div className="mb-5 p-4 bg-[var(--color-neon-amber)]/5 border border-[var(--color-neon-amber)]/20 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-[var(--color-neon-amber)]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-neon-amber)]">
                {data.correlation_breaks.length} Correlation Break
                {data.correlation_breaks.length > 1 ? "s" : ""} Detected
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.correlation_breaks.slice(0, 6).map((b, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const ri = symbols.indexOf(b.pair[0]);
                    const ci = symbols.indexOf(b.pair[1]);
                    if (ri >= 0 && ci >= 0) setSelectedPair({ row: ri, col: ci });
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-neon-amber)]/20 rounded-lg hover:border-[var(--color-neon-amber)]/50 transition-colors text-left"
                >
                  <span className="text-xs font-bold text-[var(--color-text-primary)]">
                    {b.pair[0]} / {b.pair[1]}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                    {(b.historical ?? 0).toFixed(2)} → {(b.current ?? 0).toFixed(2)}
                  </span>
                  <span
                    className={`text-[10px] font-bold ml-auto ${
                      b.significance === "high"
                        ? "text-red-500"
                        : "text-[var(--color-neon-amber)]"
                    }`}
                  >
                    Δ{(b.break_magnitude ?? 0).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && !data && (
          <div className="flex items-center justify-center h-[500px]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-[var(--color-neon-cyan)] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[var(--color-text-muted)]">
                Computing correlations...
              </span>
            </div>
          </div>
        )}

        {/* ── Matrix + Detail Panel ── */}
        {symbols.length > 0 && (
          <div className="flex gap-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
            {/* Canvas area */}
            <div className="flex-1 overflow-auto p-4">
              {/* Hover tooltip */}
              {tooltipText && (
                <div className="mb-2 text-xs font-mono text-[var(--color-text-secondary)] h-5">
                  {tooltipText}
                </div>
              )}

              <CanvasHeatmap
                symbols={symbols}
                matrix={matrix}
                cellSize={cellSize}
                breakPairs={breakPairs}
                onCellClick={handleCellClick}
                hoveredCell={hoveredCell}
                onHover={setHoveredCell}
              />

              {/* Legend */}
              <div className="flex items-center gap-5 mt-4 text-[10px] text-[var(--color-text-muted)]">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-3 rounded" style={{ background: "linear-gradient(to right, #8b2020, #1e1e32, #10b981)" }} />
                  <span>-1.0 → 0 → +1.0</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-[rgba(167,139,250,0.7)]" />
                  Diagonal (self)
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border-2 border-[var(--color-neon-amber)]" />
                  Break detected
                </div>
              </div>
            </div>

            {/* Detail sidebar */}
            {selectedPair && symbols[selectedPair.row] && symbols[selectedPair.col] && (
              <PairDetailPanel
                symbolA={symbols[selectedPair.row]}
                symbolB={symbols[selectedPair.col]}
                correlation={matrix[selectedPair.row]?.[selectedPair.col] ?? 0}
                breakInfo={breakMap.get(
                  `${symbols[selectedPair.row]}:${symbols[selectedPair.col]}`,
                )}
                period={period}
                onClose={() => setSelectedPair(null)}
              />
            )}
          </div>
        )}

        {!loading && symbols.length === 0 && (
          <div className="text-center py-16 text-[var(--color-text-muted)]">
            <Grid3X3 className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <div className="text-sm mb-1">No correlation data available</div>
            <div className="text-[10px]">Requires daily OHLCV data in the database</div>
          </div>
        )}
      </div>
    </div>
  );
}
