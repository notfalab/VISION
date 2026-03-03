"use client";

import { useEffect, useState, useCallback } from "react";
import { Flame, RefreshCw } from "lucide-react";
import { useMarketStore, getMarketType } from "@/stores/market";
import { api } from "@/lib/api";
import { formatPrice, formatVolume } from "@/lib/format";

interface LiqLevel {
  price: number;
  long_liq_usd: number;
  short_liq_usd: number;
}

interface LiqData {
  symbol: string;
  timestamp: string;
  current_price: number;
  levels: LiqLevel[];
  total_long_liq_usd: number;
  total_short_liq_usd: number;
}

export default function LiquidationWidget() {
  const { activeSymbol } = useMarketStore();
  const [data, setData] = useState<LiqData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const isCrypto = getMarketType(activeSymbol) === "crypto";

  const load = useCallback(async () => {
    if (!isCrypto) return;
    setLoading(true);
    setError(false);
    try {
      const result = await api.liquidationMap(activeSymbol);
      if (result.current_price > 0 && result.levels?.length > 0) {
        setData(result);
      } else {
        setData(null);
      }
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeSymbol, isCrypto]);

  useEffect(() => {
    if (!isCrypto) {
      setData(null);
      return;
    }
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, [load, isCrypto]);

  // Hidden for non-crypto
  if (!isCrypto) return null;

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-32 mb-2" />
        <div className="space-y-2">
          <div className="h-10 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-8 bg-[var(--color-bg-hover)] rounded" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
          <Flame className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Liquidation Map
          </h3>
        </div>
        <div className="p-3 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Liquidation data unavailable.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Get top 10 most significant levels
  const sortedLevels = [...data.levels]
    .map((l) => ({
      ...l,
      maxVol: Math.max(l.long_liq_usd, l.short_liq_usd),
    }))
    .sort((a, b) => b.maxVol - a.maxVol)
    .slice(0, 10)
    .sort((a, b) => a.price - b.price); // sort by price for display

  const maxVol = Math.max(...sortedLevels.map((l) => l.maxVol), 1);
  const totalLong = data.total_long_liq_usd;
  const totalShort = data.total_short_liq_usd;
  const totalAll = totalLong + totalShort;
  const longPct = totalAll > 0 ? (totalLong / totalAll) * 100 : 50;

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <Flame className="w-4 h-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Liquidation Map
        </h3>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] ml-auto">
          {data.levels.length} levels
        </span>
        <button
          onClick={load}
          className="p-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-[var(--color-text-muted)] ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        {/* Long vs Short summary bar */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[var(--color-text-muted)] uppercase">
              Liquidation Exposure
            </span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${longPct}%`, backgroundColor: "var(--color-bear)" }}
            />
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${100 - longPct}%`, backgroundColor: "var(--color-bull)" }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[11px] font-mono text-[var(--color-bear)]">
              LONG ${formatVolume(totalLong)}
            </span>
            <span className="text-[11px] font-mono text-[var(--color-bull)]">
              SHORT ${formatVolume(totalShort)}
            </span>
          </div>
        </div>

        {/* Liquidation levels */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
          <div className="text-[12px] text-[var(--color-text-muted)] uppercase mb-1.5">
            Top Liquidation Levels
          </div>
          <div className="space-y-1">
            {sortedLevels.map((l, i) => {
              const isAbove = l.price > data.current_price;
              const vol = Math.max(l.long_liq_usd, l.short_liq_usd);
              const barW = (vol / maxVol) * 100;
              const isLong = l.long_liq_usd > l.short_liq_usd;

              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[var(--color-text-primary)] w-20 shrink-0">
                    {formatPrice(l.price, activeSymbol)}
                  </span>
                  <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-[var(--color-bg-hover)]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barW}%`,
                        backgroundColor: isLong ? "var(--color-bear)" : "var(--color-bull)",
                      }}
                    />
                  </div>
                  <span
                    className="text-[10px] font-mono w-12 text-right shrink-0"
                    style={{ color: isLong ? "var(--color-bear)" : "var(--color-bull)" }}
                  >
                    ${formatVolume(vol)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current price indicator */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--color-text-muted)]">
          <span>Price: {formatPrice(data.current_price, activeSymbol)}</span>
          <span>•</span>
          <span>Crypto only</span>
        </div>
      </div>
    </div>
  );
}
