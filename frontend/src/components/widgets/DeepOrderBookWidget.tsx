"use client";

import { useState, memo } from "react";
import { BookOpen } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { formatPrice, formatVolume } from "@/lib/format";
import RefreshIndicator from "@/components/RefreshIndicator";

interface OBLevel {
  price: number;
  quantity: number;
  orders_count: number;
  pct_of_total: number;
}

interface OBStats {
  total_bid_volume: number;
  total_ask_volume: number;
  bid_ask_ratio: number;
  bid_levels: number;
  ask_levels: number;
  spread: number;
  spread_pct: number;
  total_estimated_orders: number;
}

interface DeepOBData {
  symbol: string;
  timestamp: string;
  bids: OBLevel[];
  asks: OBLevel[];
  stats: OBStats;
}

function DeepOrderBookWidget() {
  const { activeSymbol } = useMarketStore();
  const [viewMode, setViewMode] = useState<"standard" | "deep">("standard");

  const { data, loading, error } = useApiData<DeepOBData>(
    () => api.deepOrderBook(activeSymbol, viewMode === "deep" ? 1000 : 100),
    [activeSymbol, viewMode],
    { interval: 120_000, key: `deepOB:${activeSymbol}:${viewMode}` }
  );

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-32 mb-2" />
        <div className="space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-4 bg-[var(--color-bg-hover)] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
          <BookOpen className="w-4 h-4 text-[var(--color-neon-blue)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Deep Order Book
          </h3>
        </div>
        <div className="p-3 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Order book data unavailable.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const displayCount = viewMode === "deep" ? 20 : 10;
  const topBids = data.bids.slice(0, displayCount);
  const topAsks = data.asks.slice(0, displayCount);

  // Max volume for bar widths
  const allVols = [...topBids, ...topAsks].map((l) => l.quantity);
  const maxQ = Math.max(...allVols, 1);

  const stats = data.stats;
  const ratioColor =
    stats.bid_ask_ratio > 1.1
      ? "var(--color-bull)"
      : stats.bid_ask_ratio < 0.9
        ? "var(--color-bear)"
        : "var(--color-text-muted)";

  return (
    <div className="card-glass rounded-lg overflow-hidden relative">
      {loading && data && <RefreshIndicator />}
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Deep Order Book
        </h3>
        {/* View mode toggle */}
        <div className="flex ml-auto gap-0.5">
          <button
            onClick={() => setViewMode("standard")}
            className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-all ${
              viewMode === "standard"
                ? "bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]"
                : "text-[var(--color-text-muted)]"
            }`}
          >
            STD
          </button>
          <button
            onClick={() => setViewMode("deep")}
            className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-all ${
              viewMode === "deep"
                ? "bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]"
                : "text-[var(--color-text-muted)]"
            }`}
          >
            DEEP
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {/* Stats row */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--color-text-muted)]">
          <span>
            B/A Ratio:{" "}
            <span style={{ color: ratioColor }} className="font-bold">
              {stats.bid_ask_ratio?.toFixed(2)}
            </span>
          </span>
          <span>•</span>
          <span>Spread: {stats.spread_pct?.toFixed(3)}%</span>
          <span>•</span>
          <span>~{stats.total_estimated_orders?.toLocaleString()} orders</span>
        </div>

        {/* Order book table */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center px-2 py-1 text-[9px] font-mono text-[var(--color-text-muted)] uppercase border-b border-[var(--color-border-primary)]">
            <span className="w-7">#</span>
            <span className="flex-1">Price</span>
            <span className="w-16 text-right">Qty</span>
            <span className="w-8 text-right">Ord</span>
            <span className="w-12 text-right">%</span>
          </div>

          {/* Asks (reversed: highest at top, lowest near spread) */}
          <div className="relative">
            {[...topAsks].reverse().map((level, i) => {
              const barW = (level.quantity / maxQ) * 100;
              return (
                <div key={`a-${i}`} className="flex items-center px-2 py-0.5 relative">
                  {/* Heatmap background */}
                  <div
                    className="absolute right-0 top-0 bottom-0"
                    style={{
                      width: `${barW}%`,
                      backgroundColor: "color-mix(in srgb, var(--color-bear) 8%, transparent)",
                    }}
                  />
                  <span className="w-7 text-[10px] font-mono text-[var(--color-text-muted)] relative z-10">
                    {displayCount - i}
                  </span>
                  <span className="flex-1 text-[11px] font-mono text-[var(--color-bear)] relative z-10">
                    {formatPrice(level.price, activeSymbol)}
                  </span>
                  <span className="w-16 text-right text-[10px] font-mono text-[var(--color-text-secondary)] relative z-10">
                    {formatVolume(level.quantity)}
                  </span>
                  <span className="w-8 text-right text-[10px] font-mono text-[var(--color-text-muted)] relative z-10">
                    {level.orders_count}
                  </span>
                  <span className="w-12 text-right text-[10px] font-mono text-[var(--color-text-muted)] relative z-10">
                    {level.pct_of_total.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Spread divider */}
          <div className="px-2 py-1 border-y border-[var(--color-border-primary)] flex items-center justify-center">
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
              Spread: {stats.spread?.toFixed(6)} ({stats.spread_pct?.toFixed(3)}%)
            </span>
          </div>

          {/* Bids */}
          <div className="relative">
            {topBids.map((level, i) => {
              const barW = (level.quantity / maxQ) * 100;
              return (
                <div key={`b-${i}`} className="flex items-center px-2 py-0.5 relative">
                  {/* Heatmap background */}
                  <div
                    className="absolute right-0 top-0 bottom-0"
                    style={{
                      width: `${barW}%`,
                      backgroundColor: "color-mix(in srgb, var(--color-bull) 8%, transparent)",
                    }}
                  />
                  <span className="w-7 text-[10px] font-mono text-[var(--color-text-muted)] relative z-10">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[11px] font-mono text-[var(--color-bull)] relative z-10">
                    {formatPrice(level.price, activeSymbol)}
                  </span>
                  <span className="w-16 text-right text-[10px] font-mono text-[var(--color-text-secondary)] relative z-10">
                    {formatVolume(level.quantity)}
                  </span>
                  <span className="w-8 text-right text-[10px] font-mono text-[var(--color-text-muted)] relative z-10">
                    {level.orders_count}
                  </span>
                  <span className="w-12 text-right text-[10px] font-mono text-[var(--color-text-muted)] relative z-10">
                    {level.pct_of_total.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Volume summary */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--color-text-muted)]">
          <span className="text-[var(--color-bull)]">
            Bid: {formatVolume(stats.total_bid_volume || 0)}
          </span>
          <span>•</span>
          <span className="text-[var(--color-bear)]">
            Ask: {formatVolume(stats.total_ask_volume || 0)}
          </span>
          <span>•</span>
          <span>{stats.bid_levels + stats.ask_levels} levels</span>
        </div>
      </div>
    </div>
  );
}

export default memo(DeepOrderBookWidget);
