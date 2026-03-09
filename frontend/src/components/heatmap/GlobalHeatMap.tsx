"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Map as MapIcon,
  TrendingUp,
  TrendingDown,
  Flame,
  BarChart3,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import Header from "@/components/layout/Header";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";

// ── Types ──

type MarketTab = "all" | "forex" | "crypto" | "commodity" | "index";

interface Tile {
  symbol: string;
  name: string;
  market_type: string;
  group: string;
  price: number;
  change_pct: number;
  volume: number;
  high: number;
  low: number;
  timestamp: string;
  is_major: boolean;
}

// ── Helpers ──

function formatPrice(price: number | null | undefined, symbol: string): string {
  if (price == null || isNaN(price)) return "--";
  if (symbol.includes("JPY")) return price.toFixed(3);
  if (symbol.startsWith("BTC") || symbol.startsWith("XAU")) return price.toFixed(2);
  if (symbol.startsWith("ETH") || symbol.startsWith("SOL") || symbol.startsWith("XRP")) return price.toFixed(2);
  if (symbol === "NAS100" || symbol === "SPX500") return price.toFixed(1);
  return price.toFixed(5);
}

function getHeatColor(pct: number): string {
  const abs = Math.min(Math.abs(pct), 5);
  const intensity = 0.3 + (abs / 5) * 0.7; // 0.3 → 1.0
  if (pct > 0.01) return `rgba(16, 185, 129, ${intensity})`;
  if (pct < -0.01) return `rgba(239, 68, 68, ${intensity})`;
  return "rgba(100, 100, 120, 0.15)";
}

function getHeatBorder(pct: number): string {
  const abs = Math.min(Math.abs(pct), 5);
  const intensity = 0.2 + (abs / 5) * 0.6;
  if (pct > 0.01) return `rgba(16, 185, 129, ${intensity})`;
  if (pct < -0.01) return `rgba(239, 68, 68, ${intensity})`;
  return "rgba(100, 100, 120, 0.1)";
}

const GROUP_ORDER = [
  "Forex Majors",
  "Commodities",
  "Crypto",
  "Indices",
  "Forex Minors",
];

// ── Mini Sparkline (canvas) ──

function MiniSparkline({
  data,
  color,
  width = 60,
  height = 18,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";

    data.forEach((val, i) => {
      const x = i * step;
      const y = height - ((val - min) / range) * (height - 2) - 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // gradient fill
    const lastX = (data.length - 1) * step;
    ctx.lineTo(lastX, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    const c =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    grad.addColorStop(0, c + "30");
    grad.addColorStop(1, c + "05");
    ctx.fillStyle = grad;
    ctx.fill();
  }, [data, color, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} className="block" />;
}

// ── Custom Treemap Tile ──

interface TreemapContentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  pct: number;
  price: number;
  symbol: string;
}

function TreemapTile(props: TreemapContentProps) {
  const { x, y, width, height, name, pct, price, symbol } = props;

  if (width < 8 || height < 8) return null;

  const isUp = pct > 0.01;
  const isDown = pct < -0.01;
  const bgColor = getHeatColor(pct);
  const borderColor = getHeatBorder(pct);
  const showPrice = width > 60 && height > 40;
  const showPct = width > 40 && height > 28;
  const showSymbol = width > 30 && height > 18;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={1.5}
        rx={4}
        ry={4}
        style={{ cursor: "pointer" }}
      />
      {showSymbol && (
        <text
          x={x + width / 2}
          y={y + (showPrice ? height * 0.3 : height * 0.4)}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={Math.min(Math.max(width / 7, 9), 16)}
          fontWeight="800"
          fontFamily="JetBrains Mono, monospace"
          style={{ pointerEvents: "none" }}
        >
          {symbol}
        </text>
      )}
      {showPct && (
        <text
          x={x + width / 2}
          y={y + (showPrice ? height * 0.55 : height * 0.65)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={isUp ? "#10b981" : isDown ? "#ef4444" : "#94a3b8"}
          fontSize={Math.min(Math.max(width / 8, 8), 14)}
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
          style={{ pointerEvents: "none" }}
        >
          {isUp ? "+" : ""}
          {pct.toFixed(2)}%
        </text>
      )}
      {showPrice && (
        <text
          x={x + width / 2}
          y={y + height * 0.78}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.5)"
          fontSize={Math.min(Math.max(width / 10, 7), 11)}
          fontWeight="500"
          fontFamily="JetBrains Mono, monospace"
          style={{ pointerEvents: "none" }}
        >
          {formatPrice(price, symbol)}
        </text>
      )}
    </g>
  );
}

// ── Stat Card ──

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg min-w-[160px]">
      <div className={`p-2 rounded-lg bg-opacity-10`} style={{ backgroundColor: color + "15" }}>
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </div>
        <div className="text-sm font-bold font-mono text-[var(--color-text-primary)]">
          {value}
        </div>
      </div>
    </div>
  );
}

// ── Mover Card ──

function MoverCard({ tile, onClick }: { tile: Tile; onClick: () => void }) {
  const isUp = tile.change_pct > 0;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg min-w-[180px] hover:border-[var(--color-neon-blue)]/40 transition-all hover:scale-[1.02] text-left"
    >
      <div className="flex-1">
        <div className="text-xs font-bold text-[var(--color-text-primary)]">{tile.symbol}</div>
        <div className="text-[10px] font-mono text-[var(--color-text-muted)]">
          {formatPrice(tile.price, tile.symbol)}
        </div>
      </div>
      <div className="text-right">
        <div
          className={`text-sm font-bold font-mono ${
            isUp ? "text-[var(--color-bull)]" : "text-red-500"
          }`}
        >
          {isUp ? "+" : ""}
          {tile.change_pct.toFixed(2)}%
        </div>
        {isUp ? (
          <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-bull)] ml-auto" />
        ) : (
          <ArrowDownRight className="w-3.5 h-3.5 text-red-500 ml-auto" />
        )}
      </div>
    </button>
  );
}

// ── Custom Tooltip ──

function HeatmapTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  if (!d?.symbol) return null;
  const isUp = (d.pct ?? 0) > 0;

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg p-3 shadow-xl max-w-[200px]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-bold text-[var(--color-text-primary)]">{d.symbol}</span>
        <span className={`text-xs font-bold font-mono ${isUp ? "text-[var(--color-bull)]" : "text-red-500"}`}>
          {isUp ? "+" : ""}{(d.pct ?? 0).toFixed(2)}%
        </span>
      </div>
      <div className="text-xs text-[var(--color-text-muted)] space-y-0.5">
        <div>Price: <span className="font-mono text-[var(--color-text-secondary)]">{formatPrice(d.price, d.symbol)}</span></div>
        {d.high > 0 && (
          <div>Range: <span className="font-mono text-[var(--color-text-secondary)]">{formatPrice(d.low, d.symbol)} — {formatPrice(d.high, d.symbol)}</span></div>
        )}
        {d.volume > 0 && (
          <div>Volume: <span className="font-mono text-[var(--color-text-secondary)]">{d.volume > 1e6 ? (d.volume / 1e6).toFixed(1) + "M" : d.volume > 1e3 ? (d.volume / 1e3).toFixed(0) + "K" : d.volume.toFixed(0)}</span></div>
        )}
        {d.group && (
          <div className="text-[10px] text-[var(--color-text-muted)] pt-0.5">{d.group}</div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

export default function GlobalHeatMap() {
  const router = useRouter();
  const [tab, setTab] = useState<MarketTab>("all");

  const { data, loading, refresh } = useApiData<{ tiles: Tile[]; count: number }>(
    () => api.marketOverview(),
    [],
    { interval: 30_000, key: "heatmap" },
  );

  const tiles = useMemo(() => {
    if (!data?.tiles) return [];
    let filtered = data.tiles;
    if (tab !== "all") {
      filtered = filtered.filter((t) => t.market_type === tab);
    }
    return filtered.sort((a, b) => {
      if (a.is_major !== b.is_major) return a.is_major ? -1 : 1;
      return Math.abs(b.change_pct) - Math.abs(a.change_pct);
    });
  }, [data, tab]);

  // ── Stats ──

  const stats = useMemo(() => {
    if (!tiles.length) return null;
    const changes = tiles.map((t) => t.change_pct);
    const avg = changes.reduce((s, v) => s + v, 0) / changes.length;
    const bullish = tiles.filter((t) => t.change_pct > 0.01).length;
    const bearish = tiles.filter((t) => t.change_pct < -0.01).length;
    const sorted = [...tiles].sort((a, b) => b.change_pct - a.change_pct);
    return {
      total: tiles.length,
      avg: avg.toFixed(2),
      bullish,
      bearish,
      topBull: sorted[0],
      topBear: sorted[sorted.length - 1],
    };
  }, [tiles]);

  // ── Treemap data ──

  const treemapData = useMemo(() => {
    if (!tiles.length) return [];

    // Group tiles
    const groups = new Map<string, Tile[]>();
    for (const t of tiles) {
      const arr = groups.get(t.group) || [];
      arr.push(t);
      groups.set(t.group, arr);
    }

    // Build nested structure for Recharts Treemap
    const children: any[] = [];
    const sortedGroups = [...groups.entries()].sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a[0]);
      const bi = GROUP_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    for (const [groupName, groupTiles] of sortedGroups) {
      for (const t of groupTiles) {
        // Size by volume, with minimum floor so small-volume tiles are still visible
        const vol = Math.max(t.volume || 1, 1);
        const size = t.is_major ? Math.max(vol, 500_000) : Math.max(vol, 50_000);

        children.push({
          name: t.symbol,
          size,
          symbol: t.symbol,
          pct: t.change_pct,
          price: t.price,
          volume: t.volume,
          high: t.high,
          low: t.low,
          group: groupName,
          isMajor: t.is_major,
        });
      }
    }

    return children;
  }, [tiles]);

  // ── Top movers ──

  const topGainers = useMemo(
    () =>
      [...tiles]
        .filter((t) => t.change_pct > 0)
        .sort((a, b) => b.change_pct - a.change_pct)
        .slice(0, 5),
    [tiles],
  );

  const topLosers = useMemo(
    () =>
      [...tiles]
        .filter((t) => t.change_pct < 0)
        .sort((a, b) => a.change_pct - b.change_pct)
        .slice(0, 5),
    [tiles],
  );

  const handleTileClick = useCallback(
    (data: any) => {
      if (data?.symbol) {
        router.push(`/${data.symbol}`);
      }
    },
    [router],
  );

  const TABS: { id: MarketTab; label: string }[] = [
    { id: "all", label: "All Markets" },
    { id: "forex", label: "Forex" },
    { id: "crypto", label: "Crypto" },
    { id: "commodity", label: "Commodities" },
    { id: "index", label: "Indices" },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* ── Title row ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-neon-amber)]/10">
              <MapIcon className="w-5 h-5 text-[var(--color-neon-amber)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--color-text-primary)]">
                Market Heat Map
              </h1>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                Real-time market overview • Size by volume • Color by change
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

        {/* ── Stats bar ── */}
        {stats && (
          <div className="flex gap-3 mb-5 overflow-x-auto pb-1">
            <StatCard
              label="Instruments"
              value={String(stats.total)}
              color="#a78bfa"
              icon={<BarChart3 className="w-4 h-4 text-[#a78bfa]" />}
            />
            <StatCard
              label="Avg Change"
              value={`${Number(stats.avg) > 0 ? "+" : ""}${stats.avg}%`}
              color={Number(stats.avg) > 0 ? "#10b981" : "#ef4444"}
              icon={
                Number(stats.avg) > 0 ? (
                  <TrendingUp className="w-4 h-4 text-[var(--color-bull)]" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )
              }
            />
            <StatCard
              label="Bullish"
              value={`${stats.bullish}`}
              color="#10b981"
              icon={<TrendingUp className="w-4 h-4 text-[var(--color-bull)]" />}
            />
            <StatCard
              label="Bearish"
              value={`${stats.bearish}`}
              color="#ef4444"
              icon={<TrendingDown className="w-4 h-4 text-red-500" />}
            />
            {stats.topBull && (
              <StatCard
                label="Top Gainer"
                value={`${stats.topBull.symbol} +${stats.topBull.change_pct.toFixed(2)}%`}
                color="#10b981"
                icon={<Flame className="w-4 h-4 text-[var(--color-bull)]" />}
              />
            )}
          </div>
        )}

        {/* ── Tab bar ── */}
        <div className="flex gap-1 mb-5 p-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                tab === t.id
                  ? "bg-[var(--color-neon-amber)]/15 text-[var(--color-neon-amber)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Loading state ── */}
        {loading && !data && (
          <div className="flex items-center justify-center h-[500px]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-[var(--color-neon-amber)] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[var(--color-text-muted)]">Loading market data...</span>
            </div>
          </div>
        )}

        {/* ── Treemap ── */}
        {treemapData.length > 0 && (
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl p-3 mb-6">
            <div style={{ width: "100%", height: "calc(65vh - 80px)", minHeight: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  nameKey="name"
                  stroke="rgba(30,30,50,0.8)"
                  content={<TreemapTile x={0} y={0} width={0} height={0} name="" pct={0} price={0} symbol="" />}
                  onClick={handleTileClick}
                  isAnimationActive={false}
                >
                  <Tooltip content={<HeatmapTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Top Movers ── */}
        {(topGainers.length > 0 || topLosers.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Gainers */}
            {topGainers.length > 0 && (
              <div>
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-bull)] mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Top Gainers
                </h2>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {topGainers.map((t) => (
                    <MoverCard key={t.symbol} tile={t} onClick={() => router.push(`/${t.symbol}`)} />
                  ))}
                </div>
              </div>
            )}

            {/* Losers */}
            {topLosers.length > 0 && (
              <div>
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-500 mb-3 flex items-center gap-2">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Top Losers
                </h2>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {topLosers.map((t) => (
                    <MoverCard key={t.symbol} tile={t} onClick={() => router.push(`/${t.symbol}`)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && tiles.length === 0 && (
          <div className="text-center py-16">
            <div className="text-[var(--color-text-muted)] mb-3">No market data available</div>
            <button
              onClick={refresh}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--color-neon-amber)]/15 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/25 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
