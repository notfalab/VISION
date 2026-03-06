"use client";

import { useState, memo } from "react";
import {
  Crosshair,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Minus,
} from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

interface Factor {
  score: number;
  weight: number;
  detail: string;
}

interface ZoneResult {
  label: string;
  type: string;
  high: number;
  low: number;
  touches: number;
  retest_probability: number;
  reversal_probability: number;
  break_probability: number;
  bounce_probability: number;
  verdict: string;
  confidence: number;
  retest_factors: Record<string, Factor>;
  break_factors: Record<string, Factor>;
}

interface RetestData {
  symbol: string;
  timeframe: string;
  current_price: number;
  regime: string;
  trend: string;
  zones: ZoneResult[];
  count: number;
}

const VERDICT_CONFIG: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  likely_retest_bounce: { label: "BOUNCE", color: "var(--color-bull)", icon: ShieldCheck },
  likely_retest_break: { label: "BREAK", color: "var(--color-bear)", icon: ShieldAlert },
  uncertain_outcome: { label: "UNCERTAIN", color: "var(--color-neon-amber)", icon: Minus },
  unlikely_retest: { label: "UNLIKELY", color: "var(--color-text-muted)", icon: Minus },
};

const ZONE_TYPE_COLORS: Record<string, string> = {
  support: "var(--color-bull)",
  demand: "var(--color-bull)",
  resistance: "var(--color-bear)",
  supply: "var(--color-bear)",
  order_block: "var(--color-neon-blue)",
  fvg: "var(--color-neon-purple)",
};

function probColor(v: number): string {
  if (v >= 70) return "var(--color-bull)";
  if (v >= 40) return "var(--color-neon-amber)";
  return "var(--color-bear)";
}

function ProbBar({ label, value }: { label: string; value: number }) {
  const color = probColor(value);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-[52px] text-[var(--color-text-muted)] shrink-0">{label}</span>
      <div className="flex-1 h-[6px] rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-[32px] text-right font-mono tabular-nums" style={{ color }}>
        {Math.round(value)}%
      </span>
    </div>
  );
}

function FactorRow({ name, factor }: { name: string; factor: Factor }) {
  const pct = Math.round(factor.score);
  return (
    <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
      <span className="w-[70px] capitalize shrink-0">{name.replace(/_/g, " ")}</span>
      <div className="flex-1 h-[3px] rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: probColor(factor.score) }}
        />
      </div>
      <span className="w-[50px] text-right truncate">{factor.detail}</span>
    </div>
  );
}

function ZoneCard({ zone, expanded, onToggle }: { zone: ZoneResult; expanded: boolean; onToggle: () => void }) {
  const verdict = VERDICT_CONFIG[zone.verdict] || VERDICT_CONFIG.uncertain_outcome;
  const VerdictIcon = verdict.icon;
  const dotColor = ZONE_TYPE_COLORS[zone.type] || "var(--color-text-muted)";

  return (
    <div className="border border-[var(--color-border-primary)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
        <span className="text-[11px] font-mono text-[var(--color-text-primary)] truncate flex-1">
          {zone.label}
        </span>
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0"
          style={{ color: verdict.color, backgroundColor: `color-mix(in srgb, ${verdict.color} 12%, transparent)` }}
        >
          <VerdictIcon size={10} />
          {verdict.label}
        </span>
      </div>

      {/* Probability bars */}
      <div className="px-3 pb-2 space-y-1.5">
        <ProbBar label="Retest" value={zone.retest_probability} />
        <ProbBar label="Reversal" value={zone.reversal_probability} />
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-[52px] text-[var(--color-text-muted)] shrink-0">Outcome</span>
          <div className="flex-1 h-[6px] rounded-full overflow-hidden flex">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${zone.bounce_probability}%`,
                backgroundColor: "var(--color-bull)",
              }}
            />
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${zone.break_probability}%`,
                backgroundColor: "var(--color-bear)",
              }}
            />
          </div>
          <span className="w-[70px] text-right font-mono tabular-nums text-[10px] shrink-0">
            <span style={{ color: "var(--color-bull)" }}>{Math.round(zone.bounce_probability)}%</span>
            {" / "}
            <span style={{ color: "var(--color-bear)" }}>{Math.round(zone.break_probability)}%</span>
          </span>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-1.5 flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border-t border-[var(--color-border-primary)] transition-colors"
      >
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        <span>Factor Breakdown</span>
        <span className="ml-auto font-mono tabular-nums">{Math.round(zone.confidence)}% conf</span>
      </button>

      {/* Factor breakdown */}
      {expanded && (
        <div className="px-3 pb-2 space-y-2 border-t border-[var(--color-border-primary)]">
          <div className="pt-2">
            <div className="text-[10px] text-[var(--color-text-muted)] font-semibold mb-1">Retest Factors</div>
            <div className="space-y-1">
              {Object.entries(zone.retest_factors).map(([name, factor]) => (
                <FactorRow key={name} name={name} factor={factor} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--color-text-muted)] font-semibold mb-1">Break/Bounce Factors</div>
            <div className="space-y-1">
              {Object.entries(zone.break_factors).map(([name, factor]) => (
                <FactorRow key={name} name={name} factor={factor} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ZoneRetestProbability() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const { data, loading, error } = useApiData<RetestData>(
    async () => {
      await api.fetchPrices(activeSymbol, activeTimeframe, 500);
      return api.zoneRetestProbability(activeSymbol, activeTimeframe);
    },
    [activeSymbol, activeTimeframe],
    { interval: 120_000, key: `zoneRetest:${activeSymbol}:${activeTimeframe}` },
  );

  if (loading) {
    return (
      <div className="card-glass rounded-lg p-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-4 h-4 rounded-full bg-[var(--color-bg-hover)] animate-pulse" />
          <div className="h-3 bg-[var(--color-bg-hover)] rounded w-32 animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[var(--color-bg-hover)] rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
          <Crosshair size={14} className="text-[var(--color-neon-blue)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Zone Retest Probability</span>
        </div>
        <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
          Unable to load zone data
        </div>
      </div>
    );
  }

  const zones = data.zones || [];

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <Crosshair size={14} className="text-[var(--color-neon-blue)]" />
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">Zone Retest Probability</span>
        <div className="ml-auto flex items-center gap-2">
          {data.trend && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-text-muted)]">
              {data.trend === "bullish" ? (
                <TrendingUp size={10} className="text-[var(--color-bull)]" />
              ) : data.trend === "bearish" ? (
                <TrendingDown size={10} className="text-[var(--color-bear)]" />
              ) : null}
              {data.regime?.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      {/* Zone cards */}
      {zones.length === 0 ? (
        <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
          No active zones detected
        </div>
      ) : (
        <div className="p-2 space-y-2">
          {zones.slice(0, 6).map((zone, i) => (
            <ZoneCard
              key={`${zone.type}-${zone.low}-${zone.high}`}
              zone={zone}
              expanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
          ))}
          {/* Legend */}
          <div className="flex items-center justify-center gap-4 pt-1 pb-1 text-[9px] text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--color-bull)" }} />
              Bounce
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--color-bear)" }} />
              Break
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ZoneRetestProbability);
