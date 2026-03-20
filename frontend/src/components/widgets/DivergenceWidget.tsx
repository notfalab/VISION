"use client";

import { memo } from "react";
import { GitBranch, AlertTriangle } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

interface DivData {
  symbol: string;
  retail_long_pct: number;
  retail_short_pct: number;
  retail_bias: string;
  institutional_score: number;
  institutional_bias: string;
  divergence_score: number;
  signal: string;
  signal_strength: number;
  has_cot: boolean;
  has_orderflow: boolean;
}

const SIGNAL_CONFIG: Record<string, { label: string; color: string }> = {
  bullish_divergence: { label: "BULLISH DIVERGENCE", color: "var(--color-bull)" },
  bearish_divergence: { label: "BEARISH DIVERGENCE", color: "var(--color-bear)" },
  strong_divergence: { label: "STRONG DIVERGENCE", color: "var(--color-neon-purple)" },
  aligned: { label: "ALIGNED", color: "var(--color-neon-cyan)" },
  neutral: { label: "NEUTRAL", color: "var(--color-text-muted)" },
};

function DivergenceWidget() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const { data, loading } = useApiData<DivData>(
    () => api.divergence(activeSymbol),
    [activeSymbol],
    { interval: 120_000, key: `divergence:${activeSymbol}` },
  );

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-36 mb-2" />
        <div className="h-20 bg-[var(--color-bg-hover)] rounded" />
      </div>
    );
  }

  if (!data) return null;

  const sig = SIGNAL_CONFIG[data.signal] || SIGNAL_CONFIG.neutral;
  const isDiverging = data.signal.includes("divergence");

  // Divergence meter: -100 to +100, centered at 0
  const divPct = ((data.divergence_score + 100) / 200) * 100; // 0-100%
  const divColor = data.divergence_score > 20
    ? "var(--color-bull)"
    : data.divergence_score < -20
      ? "var(--color-bear)"
      : "var(--color-text-muted)";

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <GitBranch className="w-4 h-4 text-[var(--color-neon-purple)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Inst. vs Retail
        </h3>
        <span
          className="text-[11px] font-mono px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-1"
          style={{
            color: sig.color,
            backgroundColor: `color-mix(in srgb, ${sig.color} 12%, transparent)`,
          }}
        >
          {isDiverging && <AlertTriangle className="w-3 h-3" />}
          {sig.label}
        </span>
      </div>

      <div className="p-3.5 space-y-2">
        {/* Dual gauge: Retail vs Institutional */}
        <div className="grid grid-cols-2 gap-3">
          {/* Retail */}
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
            <div className="text-[11px] text-[var(--color-text-muted)] uppercase mb-1">Retail</div>
            <div className="flex h-2 rounded-full overflow-hidden mb-1">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${data.retail_long_pct}%`, backgroundColor: "var(--color-bull)" }}
              />
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${data.retail_short_pct}%`, backgroundColor: "var(--color-bear)" }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-[var(--color-bull)]">L {(data.retail_long_pct ?? 0).toFixed(0)}%</span>
              <span className="text-[var(--color-bear)]">S {(data.retail_short_pct ?? 0).toFixed(0)}%</span>
            </div>
          </div>

          {/* Institutional */}
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
            <div className="text-[11px] text-[var(--color-text-muted)] uppercase mb-1">Institutional</div>
            <div className="flex h-2 rounded-full overflow-hidden mb-1">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.max(0, 50 + data.institutional_score / 2)}%`,
                  backgroundColor: "var(--color-bull)",
                }}
              />
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.max(0, 50 - data.institutional_score / 2)}%`,
                  backgroundColor: "var(--color-bear)",
                }}
              />
            </div>
            <div className="text-center">
              <span
                className="text-[10px] font-mono uppercase font-bold"
                style={{
                  color: data.institutional_bias === "bullish"
                    ? "var(--color-bull)"
                    : data.institutional_bias === "bearish"
                      ? "var(--color-bear)"
                      : "var(--color-text-muted)",
                }}
              >
                {data.institutional_bias}
              </span>
            </div>
          </div>
        </div>

        {/* Divergence meter */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[var(--color-text-muted)] uppercase">Divergence Score</span>
            <span className="text-sm font-mono font-bold" style={{ color: divColor }}>
              {(data.divergence_score ?? 0) > 0 ? "+" : ""}{(data.divergence_score ?? 0).toFixed(0)}
            </span>
          </div>
          {/* Centered bar */}
          <div className="relative h-2 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--color-text-muted)] opacity-30" />
            <div
              className="absolute top-0 bottom-0 rounded-full transition-all duration-300"
              style={{
                left: data.divergence_score >= 0 ? "50%" : `${divPct}%`,
                width: `${Math.abs(data.divergence_score) / 2}%`,
                backgroundColor: divColor,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-[var(--color-text-muted)] mt-0.5">
            <span>-100</span>
            <span>0</span>
            <span>+100</span>
          </div>
        </div>

        {/* Data sources */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--color-text-muted)]">
          <span className={data.has_cot ? "text-[var(--color-neon-cyan)]" : ""}>
            COT: {data.has_cot ? "YES" : "N/A"}
          </span>
          <span>•</span>
          <span className={data.has_orderflow ? "text-[var(--color-neon-cyan)]" : ""}>
            Flow: {data.has_orderflow ? "YES" : "N/A"}
          </span>
          <span>•</span>
          <span>Str: {((data.signal_strength ?? 0) * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

export default memo(DivergenceWidget);
