"use client";

import { useEffect, useState, useCallback } from "react";
import { Crosshair } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { formatPrice, formatVolume } from "@/lib/format";
import RefreshIndicator from "@/components/RefreshIndicator";

interface Cluster {
  price_min: number;
  price_max: number;
  volume: number;
  strength: number;
  type: "long_tp" | "short_tp" | "long_sl" | "short_sl";
  distance_pct: number;
}

interface TPSLData {
  tp_clusters: Cluster[];
  sl_clusters: Cluster[];
  round_levels: { price: number; type: string; distance_pct: number; magnitude: string }[];
  current_price: number;
}

function StrengthBar({ strength }: { strength: number }) {
  const pct = Math.round(strength * 100);
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 h-1 rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: strength > 0.6 ? "var(--color-bull)" : "var(--color-text-muted)",
          }}
        />
      </div>
      <span className="text-[10px] font-mono w-7 text-right text-[var(--color-text-muted)]">
        {pct}%
      </span>
    </div>
  );
}

function ClusterRow({ c, symbol }: { c: Cluster; symbol: string }) {
  const isTP = c.type === "long_tp" || c.type === "short_tp";
  const side = c.type.startsWith("long") ? "LONG" : "SHORT";
  const labelColor = isTP ? "var(--color-bull)" : "var(--color-bear)";
  const midPrice = (c.price_min + c.price_max) / 2;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="text-[10px] font-mono font-bold w-10 shrink-0"
        style={{ color: labelColor }}
      >
        {side}
      </span>
      <span className="text-[11px] font-mono text-[var(--color-text-primary)] flex-1">
        {formatPrice(midPrice, symbol)}
      </span>
      <span className="text-[10px] font-mono text-[var(--color-text-muted)] w-10 text-right">
        {c.distance_pct.toFixed(1)}%
      </span>
      <div className="w-16">
        <StrengthBar strength={c.strength} />
      </div>
    </div>
  );
}

export default function TPSLWidget() {
  const { activeSymbol } = useMarketStore();
  const [data, setData] = useState<TPSLData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<"tp" | "sl" | null>("tp");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await api.tpslHeatmap(activeSymbol, 500);
      if (result.current_price > 0) {
        setData(result);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [activeSymbol]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-32 mb-2" />
        <div className="space-y-2">
          <div className="h-8 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-8 bg-[var(--color-bg-hover)] rounded" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
          <Crosshair className="w-4 h-4 text-[var(--color-neon-blue)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            TP/SL Zones
          </h3>
        </div>
        <div className="p-3 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Order book data unavailable for TP/SL estimation.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tpCount = data.tp_clusters.length;
  const slCount = data.sl_clusters.length;

  return (
    <div className="card-glass rounded-lg overflow-hidden relative">
      {loading && data && <RefreshIndicator />}
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <Crosshair className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          TP/SL Zones
        </h3>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] ml-auto">
          <span className="text-[var(--color-bull)]">{tpCount} TP</span>
          {" / "}
          <span className="text-[var(--color-bear)]">{slCount} SL</span>
        </span>
      </div>

      <div className="p-3 space-y-2">
        {/* Take Profit section */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === "tp" ? null : "tp")}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <span className="text-[12px] font-semibold text-[var(--color-bull)] uppercase">
              Take Profit Clusters ({tpCount})
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {expanded === "tp" ? "▲" : "▼"}
            </span>
          </button>
          {expanded === "tp" && data.tp_clusters.length > 0 && (
            <div className="px-3 pb-2 space-y-0.5">
              {data.tp_clusters.slice(0, 8).map((c, i) => (
                <ClusterRow key={`tp-${i}`} c={c} symbol={activeSymbol} />
              ))}
            </div>
          )}
          {expanded === "tp" && data.tp_clusters.length === 0 && (
            <div className="px-3 pb-2 text-[11px] text-[var(--color-text-muted)]">
              No significant TP clusters detected
            </div>
          )}
        </div>

        {/* Stop Loss section */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === "sl" ? null : "sl")}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <span className="text-[12px] font-semibold text-[var(--color-bear)] uppercase">
              Stop Loss Clusters ({slCount})
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {expanded === "sl" ? "▲" : "▼"}
            </span>
          </button>
          {expanded === "sl" && data.sl_clusters.length > 0 && (
            <div className="px-3 pb-2 space-y-0.5">
              {data.sl_clusters.slice(0, 8).map((c, i) => (
                <ClusterRow key={`sl-${i}`} c={c} symbol={activeSymbol} />
              ))}
            </div>
          )}
          {expanded === "sl" && data.sl_clusters.length === 0 && (
            <div className="px-3 pb-2 text-[11px] text-[var(--color-text-muted)]">
              No significant SL clusters detected
            </div>
          )}
        </div>

        {/* Round levels summary */}
        {data.round_levels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {data.round_levels
              .filter((r) => r.magnitude !== "minor")
              .slice(0, 6)
              .map((r, i) => (
                <span
                  key={i}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                  style={{
                    borderColor: r.magnitude === "major"
                      ? "color-mix(in srgb, var(--color-neon-blue) 40%, transparent)"
                      : "var(--color-border-primary)",
                    color: r.magnitude === "major"
                      ? "var(--color-neon-blue)"
                      : "var(--color-text-muted)",
                    backgroundColor: r.magnitude === "major"
                      ? "color-mix(in srgb, var(--color-neon-blue) 8%, transparent)"
                      : "transparent",
                  }}
                >
                  {formatPrice(r.price, activeSymbol)} ({r.distance_pct.toFixed(1)}%)
                </span>
              ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-[10px] font-mono text-[var(--color-text-muted)] pt-1">
          Estimated from order book depth analysis
        </div>
      </div>
    </div>
  );
}
