"use client";

import { useEffect, useState } from "react";
import { Brain, Target, ArrowUpDown, Flame } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/format";

interface SMCData {
  classification: string;
  trend: string;
  bullish_ob_count: number;
  bearish_ob_count: number;
  bullish_fvg_count: number;
  bearish_fvg_count: number;
  near_bullish_zone: boolean;
  near_bearish_zone: boolean;
  active_zones: string[];
  confidence: number;
  last_bos?: { type: string; level: number };
  last_choch?: { type: string; level: number };
}

interface HeatData {
  score: number;
  signal: string;
  description: string;
  components: {
    cot: { score: number; weight: number; signal: string };
    orderflow: { score: number; weight: number; signal: string };
    volume_profile: { score: number; weight: number; signal: string };
  };
}

interface KeyLevelsData {
  classification: string;
  pivot_point: number;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
  nearest_support: { price: number; label: string } | null;
  nearest_resistance: { price: number; label: string } | null;
  support_distance_pct: number;
  resistance_distance_pct: number;
  risk_reward_ratio: number;
  fibonacci_levels: { price: number; label: string; ratio: number }[];
}

export default function SmartMoney() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [smc, setSmc] = useState<SMCData | null>(null);
  const [levels, setLevels] = useState<KeyLevelsData | null>(null);
  const [heat, setHeat] = useState<HeatData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Ensure price data exists for this timeframe
        await api.fetchPrices(activeSymbol, activeTimeframe, 200);
        const [indData, heatData] = await Promise.allSettled([
          api.indicators(activeSymbol, activeTimeframe, 200),
          api.institutionalHeat(activeSymbol, activeTimeframe),
        ]);
        if (indData.status === "fulfilled") {
          const indicators = indData.value?.indicators || [];
          const smcInd = indicators.find((i: any) => i.name === "smart_money");
          const lvlInd = indicators.find((i: any) => i.name === "key_levels");
          if (smcInd) setSmc(smcInd.metadata as SMCData);
          if (lvlInd) setLevels(lvlInd.metadata as KeyLevelsData);
        }
        if (heatData.status === "fulfilled") setHeat(heatData.value);
      } catch {
        setSmc(null);
        setLevels(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSymbol, activeTimeframe]);

  if (loading) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-32 mb-2" />
        <div className="space-y-1.5">
          <div className="h-8 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-8 bg-[var(--color-bg-hover)] rounded" />
        </div>
      </div>
    );
  }

  const trend = smc?.trend || "neutral";
  const trendColor = trend === "bullish" ? "var(--color-bull)" : trend === "bearish" ? "var(--color-bear)" : "var(--color-text-muted)";

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Brain className="w-3.5 h-3.5 text-[var(--color-neon-purple)]" />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Smart Money & Levels
        </h3>
        {smc && (
          <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded ml-auto uppercase font-bold"
            style={{ color: trendColor, backgroundColor: `color-mix(in srgb, ${trendColor} 12%, transparent)` }}
          >
            {smc.confidence}% conf
          </span>
        )}
      </div>

      <div className="p-2 space-y-1.5">
        {/* Market Structure */}
        {smc && (
          <>
            <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-1.5 border border-[var(--color-border-primary)]">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpDown className="w-2.5 h-2.5" style={{ color: trendColor }} />
                <span className="text-[9px] font-semibold text-[var(--color-text-primary)] uppercase">Structure</span>
                <span className="text-[8px] font-mono ml-auto uppercase" style={{ color: trendColor }}>
                  {trend}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[8px] font-mono">
                {smc.last_bos && (
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--color-text-muted)]">BOS:</span>
                    <span style={{ color: smc.last_bos.type === "bullish" ? "var(--color-bull)" : "var(--color-bear)" }}>
                      {smc.last_bos.type.toUpperCase()} @ {formatPrice(smc.last_bos.level, activeSymbol)}
                    </span>
                  </div>
                )}
                {smc.last_choch && (
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--color-text-muted)]">CHoCH:</span>
                    <span style={{ color: smc.last_choch.type === "bullish" ? "var(--color-bull)" : "var(--color-bear)" }}>
                      {smc.last_choch.type.toUpperCase()} @ {formatPrice(smc.last_choch.level, activeSymbol)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Order Blocks & FVG counts */}
            <div className="grid grid-cols-2 gap-1">
              <div className="rounded-md bg-[var(--color-bg-secondary)] px-2 py-1.5 border border-[var(--color-border-primary)]">
                <div className="text-[8px] text-[var(--color-text-muted)] uppercase mb-0.5">Order Blocks</div>
                <div className="flex gap-2 text-[9px] font-mono">
                  <span className="text-[var(--color-bull)]">{smc.bullish_ob_count} Bull</span>
                  <span className="text-[var(--color-bear)]">{smc.bearish_ob_count} Bear</span>
                </div>
              </div>
              <div className="rounded-md bg-[var(--color-bg-secondary)] px-2 py-1.5 border border-[var(--color-border-primary)]">
                <div className="text-[8px] text-[var(--color-text-muted)] uppercase mb-0.5">Fair Value Gaps</div>
                <div className="flex gap-2 text-[9px] font-mono">
                  <span className="text-[var(--color-bull)]">{smc.bullish_fvg_count} Bull</span>
                  <span className="text-[var(--color-bear)]">{smc.bearish_fvg_count} Bear</span>
                </div>
              </div>
            </div>

            {/* Active zones */}
            {smc.active_zones.length > 0 && (
              <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-1.5 border border-[var(--color-border-primary)]">
                <div className="text-[8px] text-[var(--color-text-muted)] uppercase mb-0.5">Active Zones Near Price</div>
                {smc.active_zones.map((zone, i) => (
                  <div key={i} className="text-[8px] font-mono text-[var(--color-neon-amber)]">{zone}</div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Key Levels */}
        {levels && (
          <>
            {/* Nearest S/R */}
            <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-1.5 border border-[var(--color-border-primary)]">
              <div className="flex items-center gap-1.5 mb-1">
                <Target className="w-2.5 h-2.5 text-[var(--color-neon-blue)]" />
                <span className="text-[9px] font-semibold text-[var(--color-text-primary)] uppercase">Key Levels</span>
                <span className="text-[8px] font-mono ml-auto text-[var(--color-text-muted)]">
                  R/R: {typeof levels.risk_reward_ratio === "number" ? levels.risk_reward_ratio.toFixed(2) : levels.risk_reward_ratio}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[8px] font-mono">
                {levels.nearest_resistance && (
                  <div>
                    <span className="text-[var(--color-bear)]">R: {formatPrice(levels.nearest_resistance.price, activeSymbol)}</span>
                    <span className="text-[var(--color-text-muted)] ml-1">({(levels.resistance_distance_pct * 100).toFixed(2)}%)</span>
                  </div>
                )}
                {levels.nearest_support && (
                  <div>
                    <span className="text-[var(--color-bull)]">S: {formatPrice(levels.nearest_support.price, activeSymbol)}</span>
                    <span className="text-[var(--color-text-muted)] ml-1">({(levels.support_distance_pct * 100).toFixed(2)}%)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Pivot Points compact */}
            <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-1.5 border border-[var(--color-border-primary)]">
              <div className="text-[8px] text-[var(--color-text-muted)] uppercase mb-0.5">Pivots</div>
              <div className="flex items-center gap-1 text-[8px] font-mono flex-wrap">
                <span className="text-[var(--color-bear)]">R3:{formatPrice(levels.r3, activeSymbol)}</span>
                <span className="text-[var(--color-bear)]">R2:{formatPrice(levels.r2, activeSymbol)}</span>
                <span className="text-[var(--color-bear)]">R1:{formatPrice(levels.r1, activeSymbol)}</span>
                <span className="text-[var(--color-neon-amber)] font-bold">PP:{formatPrice(levels.pivot_point, activeSymbol)}</span>
                <span className="text-[var(--color-bull)]">S1:{formatPrice(levels.s1, activeSymbol)}</span>
                <span className="text-[var(--color-bull)]">S2:{formatPrice(levels.s2, activeSymbol)}</span>
                <span className="text-[var(--color-bull)]">S3:{formatPrice(levels.s3, activeSymbol)}</span>
              </div>
            </div>

            {/* Fibonacci levels */}
            {levels.fibonacci_levels && levels.fibonacci_levels.length > 0 && (
              <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-1.5 border border-[var(--color-border-primary)]">
                <div className="text-[8px] text-[var(--color-text-muted)] uppercase mb-0.5">Fibonacci</div>
                <div className="flex items-center gap-1.5 text-[8px] font-mono flex-wrap">
                  {levels.fibonacci_levels.map((fib, i) => (
                    <span key={i} className="text-[var(--color-neon-blue)]">
                      {fib.label.replace("Fib ", "")}:{formatPrice(fib.price, activeSymbol)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Institutional Heat Score */}
        {heat && (
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-1.5 border border-[var(--color-border-primary)]">
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="w-2.5 h-2.5 text-[var(--color-neon-amber)]" />
              <span className="text-[9px] font-semibold text-[var(--color-text-primary)] uppercase">
                Institutional Heat
              </span>
              <span
                className="text-[9px] font-mono font-bold ml-auto"
                style={{
                  color:
                    heat.score >= 60
                      ? "var(--color-bull)"
                      : heat.score <= 40
                        ? "var(--color-bear)"
                        : "var(--color-neon-amber)",
                }}
              >
                {heat.score.toFixed(0)}/100
              </span>
            </div>
            {/* Heat gradient bar */}
            <div className="h-2 rounded-full overflow-hidden bg-gradient-to-r from-[var(--color-bear)] via-[var(--color-neon-amber)] to-[var(--color-bull)] relative mb-1">
              <div
                className="absolute top-0 w-1 h-2 bg-white rounded-full shadow-sm transition-all duration-500"
                style={{ left: `calc(${heat.score}% - 2px)` }}
              />
            </div>
            <p className="text-[7px] text-[var(--color-text-secondary)] mb-1">
              {heat.description}
            </p>
            {/* Component breakdown */}
            <div className="grid grid-cols-3 gap-1">
              {heat.components && Object.entries(heat.components).map(([key, comp]) => (
                <div key={key} className="text-center">
                  <div className="text-[6px] text-[var(--color-text-muted)] uppercase">{key === "volume_profile" ? "Vol" : key.toUpperCase()}</div>
                  <div
                    className="text-[8px] font-mono font-bold"
                    style={{
                      color:
                        comp.score >= 60
                          ? "var(--color-bull)"
                          : comp.score <= 40
                            ? "var(--color-bear)"
                            : "var(--color-text-muted)",
                    }}
                  >
                    {comp.score.toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!smc && !levels && !heat && (
          <div className="text-[10px] text-[var(--color-text-muted)] text-center py-4">
            No data available. Fetch prices first.
          </div>
        )}
      </div>
    </div>
  );
}
