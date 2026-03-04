"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart3 } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface VPLevel {
  price: number;
  volume: number;
  normalized: number;
  buy_volume: number;
  sell_volume: number;
  is_poc: boolean;
  in_value_area: boolean;
}

interface VPData {
  levels: VPLevel[];
  poc: number;
  vah: number;
  val: number;
  total_volume: number;
}

export default function VolumeProfileWidget() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [data, setData] = useState<VPData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tf, setTf] = useState<string>(activeTimeframe);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.volumeProfile(activeSymbol, tf, 200, 40);
      if (result && result.levels) setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeSymbol, tf]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-28 mb-2" />
        <div className="h-40 bg-[var(--color-bg-hover)] rounded" />
      </div>
    );
  }

  if (!data || !data.levels?.length) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
          <BarChart3 className="w-4 h-4 text-[var(--color-neon-cyan)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Volume Profile
          </h3>
        </div>
        <div className="p-3 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Insufficient data</p>
        </div>
      </div>
    );
  }

  const maxVol = Math.max(...data.levels.map((l) => l.volume));

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <BarChart3 className="w-4 h-4 text-[var(--color-neon-cyan)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Volume Profile
        </h3>
        {/* TF selector */}
        <div className="flex gap-0.5 ml-auto">
          {["1h", "4h", "1d"].map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
                tf === t
                  ? "bg-[var(--color-neon-cyan)] text-black font-bold"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        {/* Key levels */}
        <div className="flex justify-between text-[11px] font-mono mb-1">
          <span className="text-[var(--color-text-muted)]">
            VAL <span className="text-[var(--color-bear)]">{data.val?.toFixed(2)}</span>
          </span>
          <span className="text-[var(--color-neon-amber)] font-bold">
            POC {data.poc?.toFixed(2)}
          </span>
          <span className="text-[var(--color-text-muted)]">
            VAH <span className="text-[var(--color-bull)]">{data.vah?.toFixed(2)}</span>
          </span>
        </div>

        {/* Volume bars (horizontal) */}
        <div className="space-y-px max-h-[200px] overflow-y-auto">
          {data.levels.map((level, i) => {
            const buyPct = level.volume > 0 ? (level.buy_volume / level.volume) * 100 : 50;
            const widthPct = maxVol > 0 ? (level.volume / maxVol) * 100 : 0;

            return (
              <div key={i} className="flex items-center gap-1 group">
                <span className="text-[9px] font-mono w-14 text-right text-[var(--color-text-muted)] shrink-0">
                  {level.price.toFixed(2)}
                </span>
                <div
                  className="flex h-[6px] rounded-sm overflow-hidden transition-all"
                  style={{
                    width: `${widthPct}%`,
                    minWidth: "2px",
                    opacity: level.in_value_area ? 1 : 0.5,
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${buyPct}%`,
                      backgroundColor: level.is_poc
                        ? "var(--color-neon-amber)"
                        : "var(--color-bull)",
                    }}
                  />
                  <div
                    className="h-full"
                    style={{
                      width: `${100 - buyPct}%`,
                      backgroundColor: level.is_poc
                        ? "color-mix(in srgb, var(--color-neon-amber) 60%, var(--color-bear))"
                        : "var(--color-bear)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border-primary)]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[var(--color-neon-amber)]" /> POC
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[var(--color-bull)]" /> Buy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[var(--color-bear)]" /> Sell
          </span>
          <span className="ml-auto font-mono">
            Vol: {(data.total_volume / 1000).toFixed(1)}K
          </span>
        </div>
      </div>
    </div>
  );
}
