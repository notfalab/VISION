"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowDownUp,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface FlowData {
  delta: number;
  delta_pct: number;
  imbalance_ratio: number;
  total_bid_volume: number;
  total_ask_volume: number;
  spread: number;
  spread_pct: number;
  signal: string;
  signal_strength: number;
  buy_walls: { price: number; quantity: number; strength: number }[];
  sell_walls: { price: number; quantity: number; strength: number }[];
  absorption: { type: string; description: string; strength: number }[];
  depth_imbalances: {
    level: number;
    bid_qty: number;
    ask_qty: number;
    delta: number;
  }[];
}

const SIGNAL_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof TrendingUp }
> = {
  strong_buy_pressure: {
    label: "STRONG BUY PRESSURE",
    color: "var(--color-bull)",
    icon: TrendingUp,
  },
  buy_pressure: {
    label: "BUY PRESSURE",
    color: "var(--color-bull)",
    icon: TrendingUp,
  },
  balanced: {
    label: "BALANCED",
    color: "var(--color-text-muted)",
    icon: ArrowDownUp,
  },
  sell_pressure: {
    label: "SELL PRESSURE",
    color: "var(--color-bear)",
    icon: TrendingDown,
  },
  strong_sell_pressure: {
    label: "STRONG SELL PRESSURE",
    color: "var(--color-bear)",
    icon: TrendingDown,
  },
};

export default function OrderFlow() {
  const { activeSymbol } = useMarketStore();
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await api.orderFlow(activeSymbol);
      setData(result);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeSymbol]);

  useEffect(() => {
    load();
    // Auto-refresh every 30s
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-24 mb-2" />
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
          <ArrowDownUp className="w-4 h-4 text-[var(--color-neon-blue)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Order Flow
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

  const sig = SIGNAL_CONFIG[data.signal] || SIGNAL_CONFIG.balanced;
  const SigIcon = sig.icon;
  const totalVol = data.total_bid_volume + data.total_ask_volume;
  const bidPct = totalVol > 0 ? (data.total_bid_volume / totalVol) * 100 : 50;

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <ArrowDownUp className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Order Flow
        </h3>
        <span
          className="text-[11px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ml-auto"
          style={{
            color: sig.color,
            backgroundColor: `color-mix(in srgb, ${sig.color} 12%, transparent)`,
          }}
        >
          {sig.label}
        </span>
        <button
          onClick={load}
          className="p-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
          title="Refresh"
        >
          <RefreshCw
            className={`w-4 h-4 text-[var(--color-text-muted)] ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <div className="p-3.5 space-y-2">
        {/* Delta bar */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[var(--color-text-muted)] uppercase">
              Volume Delta
            </span>
            <span
              className="text-sm font-mono font-bold"
              style={{ color: data.delta >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
            >
              {data.delta >= 0 ? "+" : ""}
              {(data.delta_pct ?? 0).toFixed(1)}%
            </span>
          </div>
          {/* Bid/Ask bar */}
          <div className="flex h-2 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${bidPct}%`,
                backgroundColor: "var(--color-bull)",
              }}
            />
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${100 - bidPct}%`,
                backgroundColor: "var(--color-bear)",
              }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[11px] font-mono text-[var(--color-bull)]">
              BID {bidPct.toFixed(0)}%
            </span>
            <span className="text-[11px] font-mono text-[var(--color-bear)]">
              ASK {(100 - bidPct).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Depth imbalance mini bars (top 5 levels) */}
        {data.depth_imbalances?.length > 0 && (
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
            <div className="text-[12px] text-[var(--color-text-muted)] uppercase mb-1">
              Depth Imbalance (Top 5)
            </div>
            <div className="space-y-0.5">
              {data.depth_imbalances.slice(0, 5).map((level) => {
                const total = level.bid_qty + level.ask_qty;
                const bidW = total > 0 ? (level.bid_qty / total) * 100 : 50;
                return (
                  <div key={level.level} className="flex items-center gap-1">
                    <span className="text-[11px] font-mono w-3 text-[var(--color-text-muted)]">
                      {level.level}
                    </span>
                    <div className="flex-1 flex h-1 rounded-full overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${bidW}%`,
                          backgroundColor: "var(--color-bull)",
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${100 - bidW}%`,
                          backgroundColor: "var(--color-bear)",
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-mono w-8 text-right"
                      style={{
                        color: level.delta >= 0 ? "var(--color-bull)" : "var(--color-bear)",
                      }}
                    >
                      {level.delta >= 0 ? "+" : ""}
                      {level.delta.toFixed(0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Walls */}
        {(data.buy_walls?.length > 0 || data.sell_walls?.length > 0) && (
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
            <div className="text-[12px] text-[var(--color-text-muted)] uppercase mb-1 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Walls Detected
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {data.buy_walls.slice(0, 3).map((w, i) => (
                <div
                  key={`b${i}`}
                  className="text-[11px] font-mono text-[var(--color-bull)]"
                >
                  BUY ${w.price.toFixed(2)} ({w.strength}x)
                </div>
              ))}
              {data.sell_walls.slice(0, 3).map((w, i) => (
                <div
                  key={`s${i}`}
                  className="text-[11px] font-mono text-[var(--color-bear)]"
                >
                  SELL ${w.price.toFixed(2)} ({w.strength}x)
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Absorption alerts */}
        {data.absorption?.length > 0 && (
          <div className="space-y-0.5">
            {data.absorption.map((abs, i) => (
              <div
                key={i}
                className="rounded-md px-2 py-1 border text-[11px] font-mono"
                style={{
                  borderColor:
                    abs.type === "bid_absorption"
                      ? "color-mix(in srgb, var(--color-bull) 30%, transparent)"
                      : "color-mix(in srgb, var(--color-bear) 30%, transparent)",
                  backgroundColor:
                    abs.type === "bid_absorption"
                      ? "color-mix(in srgb, var(--color-bull) 8%, transparent)"
                      : "color-mix(in srgb, var(--color-bear) 8%, transparent)",
                  color:
                    abs.type === "bid_absorption"
                      ? "var(--color-bull)"
                      : "var(--color-bear)",
                }}
              >
                ⚡ {abs.description}
              </div>
            ))}
          </div>
        )}

        {/* Stats footer */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--color-text-muted)]">
          <span>
            Imb: {(data.imbalance_ratio ?? 0).toFixed(2)}
          </span>
          <span>•</span>
          <span>
            Spread: {(data.spread_pct ?? 0).toFixed(3)}%
          </span>
          <span>•</span>
          <span>
            Str: {((data.signal_strength ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}
