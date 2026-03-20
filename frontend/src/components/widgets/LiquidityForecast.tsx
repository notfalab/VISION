"use client";

import { memo } from "react";
import { Droplets, Magnet } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import RefreshIndicator from "@/components/RefreshIndicator";
import { useApiData } from "@/hooks/useApiData";


interface LiqLevel {
  price: number;
  predicted_liquidity: number;
  confidence: number;
  type: string;
}

interface LiqMagnet {
  price: number;
  strength: number;
  type: string;
}

interface LiqData {
  levels: LiqLevel[];
  magnets: LiqMagnet[];
  current_price: number;
  price_min: number;
  price_max: number;
}

function LiquidityForecast() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const activeTimeframe = useMarketStore((s) => s.activeTimeframe);
  const { data, loading } = useApiData<LiqData>(
    () => api.liquidityForecast(activeSymbol, activeTimeframe, 200),
    [activeSymbol, activeTimeframe],
    { interval: 120_000, key: `liqForecast:${activeSymbol}:${activeTimeframe}` },
  );

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-36 mb-2" />
        <div className="h-40 bg-[var(--color-bg-hover)] rounded" />
      </div>
    );
  }

  if (!data || !data.levels?.length) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
          <Droplets className="w-4 h-4 text-[var(--color-neon-blue)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Liquidity Forecast
          </h3>
        </div>
        <div className="p-3 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Insufficient data</p>
        </div>
      </div>
    );
  }

  // Sort levels by price descending (high to low for vertical display)
  const sortedLevels = [...data.levels].sort((a, b) => b.price - a.price);
  const maxLiq = Math.max(...data.levels.map((l) => l.predicted_liquidity));

  return (
    <div className="card-glass rounded-lg overflow-hidden relative">
      {loading && data && <RefreshIndicator />}
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <Droplets className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Liquidity Forecast
        </h3>
      </div>

      <div className="p-3 space-y-2">
        {/* Magnets (top liquidity targets) */}
        {data.magnets && data.magnets.length > 0 && (
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
            <div className="text-[11px] text-[var(--color-text-muted)] uppercase mb-1 flex items-center gap-1">
              <Magnet className="w-3.5 h-3.5" />
              Liquidity Magnets
            </div>
            <div className="grid grid-cols-2 gap-1">
              {data.magnets.map((m, i) => {
                const typeColor = m.type === "buy"
                  ? "var(--color-bull)"
                  : m.type === "sell"
                    ? "var(--color-bear)"
                    : "var(--color-neon-blue)";
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: typeColor }}
                    />
                    <span className="text-[11px] font-mono text-[var(--color-text-primary)]">
                      {(m.price ?? 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                      {((m.strength ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Vertical heatmap */}
        <div className="max-h-[200px] overflow-y-auto space-y-px">
          {sortedLevels.map((level, i) => {
            const typeColor = level.type === "buy"
              ? "var(--color-bull)"
              : level.type === "sell"
                ? "var(--color-bear)"
                : "var(--color-neon-blue)";

            const barWidth = maxLiq > 0 ? (level.predicted_liquidity / maxLiq) * 100 : 0;
            const isCurrentPrice = data.current_price > 0 &&
              Math.abs(level.price - data.current_price) / data.current_price < 0.003;

            return (
              <div
                key={i}
                className={`flex items-center gap-1 ${isCurrentPrice ? "bg-[var(--color-bg-hover)] rounded" : ""}`}
              >
                <span className={`text-[9px] font-mono w-14 text-right shrink-0 ${
                  isCurrentPrice ? "text-[var(--color-neon-amber)] font-bold" : "text-[var(--color-text-muted)]"
                }`}>
                  {isCurrentPrice ? "►" : ""}{(level.price ?? 0).toFixed(2)}
                </span>
                <div
                  className="h-[5px] rounded-sm transition-all"
                  style={{
                    width: `${barWidth}%`,
                    minWidth: barWidth > 0 ? "2px" : "0",
                    backgroundColor: typeColor,
                    opacity: 0.3 + level.confidence * 0.7,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border-primary)]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[var(--color-bull)]" /> Buy Liq
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[var(--color-bear)]" /> Sell Liq
          </span>
          <span className="ml-auto font-mono">
            {data.levels.length} levels
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(LiquidityForecast);
