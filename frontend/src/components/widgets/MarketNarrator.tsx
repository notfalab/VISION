"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
} from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface NarrativeData {
  symbol: string;
  narrative: string;
  key_drivers: { factor: string; impact: string; direction: string }[];
  outlook: string;
  confidence: number;
  timestamp: string | null;
}

const OUTLOOK_CONFIG: Record<string, { color: string; icon: typeof TrendingUp }> = {
  Bullish: { color: "var(--color-bull)", icon: TrendingUp },
  Bearish: { color: "var(--color-bear)", icon: TrendingDown },
  Neutral: { color: "var(--color-neon-amber)", icon: Minus },
};

const IMPACT_COLORS: Record<string, string> = {
  high: "var(--color-neon-purple)",
  medium: "var(--color-neon-blue)",
  low: "var(--color-text-muted)",
};

export default function MarketNarrator() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [data, setData] = useState<NarrativeData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.narrator(activeSymbol, activeTimeframe);
      if (result) setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeSymbol, activeTimeframe]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 300000); // 5 min
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-32 mb-2" />
        <div className="space-y-2">
          <div className="h-16 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-6 bg-[var(--color-bg-hover)] rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const outlook = OUTLOOK_CONFIG[data.outlook] || OUTLOOK_CONFIG.Neutral;
  const OutlookIcon = outlook.icon;

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <BookOpen className="w-4 h-4 text-[var(--color-neon-purple)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Market Narrator
        </h3>
        <span
          className="text-[11px] font-mono px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-1"
          style={{
            color: outlook.color,
            backgroundColor: `color-mix(in srgb, ${outlook.color} 12%, transparent)`,
          }}
        >
          <OutlookIcon className="w-3 h-3" />
          {data.outlook}
        </span>
        <button
          onClick={load}
          className="ml-auto p-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
          title="Refresh narrative"
        >
          <RefreshCw className={`w-4 h-4 text-[var(--color-text-muted)] ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-3.5 space-y-2">
        {/* Narrative */}
        <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
          {data.narrative}
        </p>

        {/* Key Drivers */}
        {data.key_drivers && data.key_drivers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.key_drivers.map((driver, i) => {
              const dirColor = driver.direction === "bullish"
                ? "var(--color-bull)"
                : driver.direction === "bearish"
                  ? "var(--color-bear)"
                  : "var(--color-text-muted)";
              return (
                <span
                  key={i}
                  className="text-[11px] font-mono px-2 py-0.5 rounded-full border"
                  style={{
                    color: dirColor,
                    borderColor: `color-mix(in srgb, ${dirColor} 30%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${dirColor} 8%, transparent)`,
                  }}
                >
                  {driver.factor}
                  <span className="ml-1 opacity-60">{driver.impact}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Confidence */}
        {data.confidence > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-muted)] uppercase">Confidence</span>
            <div className="flex-1 h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(data.confidence ?? 0) * 100}%`,
                  backgroundColor: outlook.color,
                }}
              />
            </div>
            <span className="text-[11px] font-mono" style={{ color: outlook.color }}>
              {Math.round((data.confidence ?? 0) * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
