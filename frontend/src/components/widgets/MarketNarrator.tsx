"use client";

import { useEffect, useState, useCallback } from "react";
import RefreshIndicator from "@/components/RefreshIndicator";
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  ShieldAlert,
} from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface Prediction {
  direction: string;
  probability: number;
  entry_zone?: string;
  target_1?: string;
  target_2?: string;
  stop_loss?: string;
  risk_reward?: string;
}

interface TFAnalysis {
  bias: string;
  strength: number;
}

interface NarrativeData {
  symbol: string;
  narrative: string;
  key_drivers: { factor: string; impact: string; direction: string }[];
  outlook: string;
  confidence: number;
  prediction?: Prediction | null;
  timeframe_analysis?: Record<string, TFAnalysis>;
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

const DIR_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  LONG: { label: "LONG", color: "var(--color-bull)", bg: "color-mix(in srgb, var(--color-bull) 15%, transparent)" },
  SHORT: { label: "SHORT", color: "var(--color-bear)", bg: "color-mix(in srgb, var(--color-bear) 15%, transparent)" },
  NEUTRAL: { label: "WAIT", color: "var(--color-neon-amber)", bg: "color-mix(in srgb, var(--color-neon-amber) 15%, transparent)" },
};

const TF_ORDER = ["15m", "1h", "4h", "1d"];

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
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-32 mb-2" />
        <div className="space-y-2">
          <div className="h-20 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-6 bg-[var(--color-bg-hover)] rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const outlook = OUTLOOK_CONFIG[data.outlook] || OUTLOOK_CONFIG.Neutral;
  const OutlookIcon = outlook.icon;
  const pred = data.prediction;
  const dirCfg = pred ? (DIR_CONFIG[pred.direction] || DIR_CONFIG.NEUTRAL) : null;
  const tfAnalysis = data.timeframe_analysis || {};

  return (
    <div className="card-glass rounded-lg overflow-hidden relative">
      {loading && data && <RefreshIndicator />}
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
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
      </div>

      <div className="p-3 space-y-2.5">
        {/* Prediction Badge */}
        {pred && dirCfg && (
          <div
            className="rounded-md px-3 py-2 border flex items-center justify-between"
            style={{ borderColor: dirCfg.color, backgroundColor: dirCfg.bg }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold font-mono" style={{ color: dirCfg.color }}>
                {dirCfg.label}
              </span>
              <span className="text-[13px] font-mono" style={{ color: dirCfg.color }}>
                {Math.round((pred.probability ?? 0) * 100)}% prob
              </span>
            </div>
            {pred.risk_reward && (
              <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
                R:R {pred.risk_reward}
              </span>
            )}
          </div>
        )}

        {/* Prediction Levels */}
        {pred && (pred.entry_zone || pred.target_1 || pred.stop_loss) && (
          <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
            {pred.entry_zone && (
              <div className="rounded bg-[var(--color-bg-secondary)] px-2 py-1 text-center">
                <div className="text-[var(--color-text-muted)] text-[9px] uppercase">Entry</div>
                <div className="text-[var(--color-neon-cyan)]">{pred.entry_zone}</div>
              </div>
            )}
            {pred.target_1 && (
              <div className="rounded bg-[var(--color-bg-secondary)] px-2 py-1 text-center">
                <div className="text-[var(--color-text-muted)] text-[9px] uppercase flex items-center justify-center gap-0.5"><Target className="w-2.5 h-2.5" /> TP1</div>
                <div className="text-[var(--color-bull)]">{pred.target_1}</div>
              </div>
            )}
            {pred.stop_loss && (
              <div className="rounded bg-[var(--color-bg-secondary)] px-2 py-1 text-center">
                <div className="text-[var(--color-text-muted)] text-[9px] uppercase flex items-center justify-center gap-0.5"><ShieldAlert className="w-2.5 h-2.5" /> SL</div>
                <div className="text-[var(--color-bear)]">{pred.stop_loss}</div>
              </div>
            )}
          </div>
        )}

        {/* Narrative */}
        <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
          {data.narrative}
        </p>

        {/* Multi-Timeframe Bias */}
        {Object.keys(tfAnalysis).length > 0 && (
          <div className="flex gap-1">
            {TF_ORDER.map((tf) => {
              const tfa = tfAnalysis[tf];
              if (!tfa) return null;
              const biasColor = tfa.bias === "bullish"
                ? "var(--color-bull)"
                : tfa.bias === "bearish"
                  ? "var(--color-bear)"
                  : "var(--color-text-muted)";
              return (
                <div
                  key={tf}
                  className="flex-1 rounded px-1.5 py-1 text-center border"
                  style={{
                    borderColor: `color-mix(in srgb, ${biasColor} 30%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${biasColor} 8%, transparent)`,
                  }}
                >
                  <div className="text-[9px] font-mono text-[var(--color-text-muted)] uppercase">{tf}</div>
                  <div className="text-[10px] font-bold font-mono uppercase" style={{ color: biasColor }}>
                    {tfa.bias === "bullish" ? "▲" : tfa.bias === "bearish" ? "▼" : "—"}{" "}
                    {Math.round((tfa.strength ?? 0) * 100)}%
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
