"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, Gauge } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface VolData {
  current_vol: number;
  current_vol_pct: number;
  regime: string;
  regime_color: string;
  percentile: number;
  term_structure: string;
  term_structure_ratio: number;
  implied_move: number;
  implied_move_pct: number;
  last_close: number;
  forecast: { period: number; vol: number }[];
  rolling_vols: Record<string, number>;
  history: { timestamp: string; vol: number }[];
}

const REGIME_LABELS: Record<string, string> = {
  low: "LOW VOL",
  normal: "NORMAL",
  high: "HIGH VOL",
  extreme: "EXTREME",
};

export default function VolatilityForecast() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [data, setData] = useState<VolData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.volatilityForecast(activeSymbol, activeTimeframe);
      if (result && result.regime) setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeSymbol, activeTimeframe]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-32 mb-2" />
        <div className="h-24 bg-[var(--color-bg-hover)] rounded" />
      </div>
    );
  }

  if (!data || data.regime === "unknown") {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
          <Activity className="w-4 h-4 text-[var(--color-neon-amber)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Volatility Forecast
          </h3>
        </div>
        <div className="p-3 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Insufficient data for forecast</p>
        </div>
      </div>
    );
  }

  const regimeColor = data.regime_color || "var(--color-text-muted)";

  // Gauge angle: 0-180 degrees based on percentile
  const gaugeAngle = (data.percentile / 100) * 180;

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <Activity className="w-4 h-4 text-[var(--color-neon-amber)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Volatility Forecast
        </h3>
        <span
          className="text-[11px] font-mono px-1.5 py-0.5 rounded uppercase font-bold"
          style={{
            color: regimeColor,
            backgroundColor: `color-mix(in srgb, ${regimeColor} 15%, transparent)`,
            border: `1px solid color-mix(in srgb, ${regimeColor} 30%, transparent)`,
          }}
        >
          {REGIME_LABELS[data.regime] || data.regime}
        </span>
      </div>

      <div className="p-3.5 space-y-2">
        {/* Percentile gauge */}
        <div className="flex items-center gap-4">
          <div className="relative" style={{ width: 80, height: 44 }}>
            <svg width="80" height="44" viewBox="0 0 80 44">
              {/* Background arc */}
              <path
                d="M 8 40 A 32 32 0 0 1 72 40"
                fill="none"
                stroke="var(--color-bg-hover)"
                strokeWidth="6"
                strokeLinecap="round"
              />
              {/* Colored arc */}
              <path
                d="M 8 40 A 32 32 0 0 1 72 40"
                fill="none"
                stroke={regimeColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(gaugeAngle / 180) * 100.5} 100.5`}
              />
              {/* Needle */}
              <line
                x1="40"
                y1="40"
                x2={40 + 24 * Math.cos(Math.PI - (gaugeAngle * Math.PI) / 180)}
                y2={40 - 24 * Math.sin((gaugeAngle * Math.PI) / 180)}
                stroke={regimeColor}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="40" cy="40" r="3" fill={regimeColor} />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-bold font-mono" style={{ color: regimeColor }}>
              {data.percentile.toFixed(0)}%
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)]">
              Volatility percentile (vs 90d)
            </div>
          </div>
        </div>

        {/* Implied move */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]">
          <div className="text-[12px] text-[var(--color-text-muted)] uppercase mb-1">
            Implied Move (Next Session)
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-mono text-[var(--color-text-primary)]">
              ±{data.implied_move.toFixed(2)}
            </span>
            <span className="text-[12px] font-mono text-[var(--color-text-muted)]">
              ({data.implied_move_pct.toFixed(3)}%)
            </span>
          </div>
          <div className="text-[11px] font-mono text-[var(--color-text-muted)] mt-0.5">
            Range: {(data.last_close - data.implied_move).toFixed(2)} — {(data.last_close + data.implied_move).toFixed(2)}
          </div>
        </div>

        {/* Term structure */}
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)] uppercase">Term Structure:</span>
          <span
            style={{
              color: data.term_structure === "backwardation"
                ? "var(--color-bear)"
                : data.term_structure === "contango"
                  ? "var(--color-bull)"
                  : "var(--color-text-muted)",
            }}
          >
            {data.term_structure.toUpperCase()} ({data.term_structure_ratio.toFixed(2)}x)
          </span>
        </div>

        {/* Rolling vols */}
        {data.rolling_vols && Object.keys(data.rolling_vols).length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {Object.entries(data.rolling_vols).map(([label, vol]) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-[var(--color-text-muted)] uppercase">{label}</div>
                <div className="text-[12px] font-mono font-bold text-[var(--color-text-primary)]">
                  {(vol * 100).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Forecast trend */}
        {data.forecast && data.forecast.length > 0 && (
          <div className="border-t border-[var(--color-border-primary)] pt-1.5">
            <div className="text-[11px] text-[var(--color-text-muted)] uppercase mb-1">
              Forecast (next {data.forecast.length} periods)
            </div>
            <div className="flex items-end gap-px h-6">
              {data.forecast.map((f, i) => {
                const maxFVol = Math.max(...data.forecast.map((x) => x.vol));
                const h = maxFVol > 0 ? (f.vol / maxFVol) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm transition-all"
                    style={{
                      height: `${h}%`,
                      backgroundColor: regimeColor,
                      opacity: 0.4 + (i / data.forecast.length) * 0.6,
                    }}
                    title={`+${f.period}: ${(f.vol * 100).toFixed(3)}%`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
