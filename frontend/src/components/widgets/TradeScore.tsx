"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  HelpCircle,
  Shield,
  Layers,
  Globe,
  BarChart3,
} from "lucide-react";
import { useMarketStore, getMarketType } from "@/stores/market";
import { api } from "@/lib/api";

interface RegimeData {
  regime: string;
  confidence: number;
  color: string;
  description: string;
}

interface CompositeResult {
  composite_score: number;
  direction: string;
  confidence: number;
  breakdown: {
    technical: {
      score: number;
      bullish_count: number;
      bearish_count: number;
      neutral_count: number;
      indicators: {
        name: string;
        signal: string;
        weight: number;
        classification: string;
      }[];
    };
    mtf_confluence: {
      direction: string;
      bonus: number;
    };
    macro: {
      direction: string;
      score: number;
      bullish: number;
      bearish: number;
    } | null;
    cot: {
      bullish_signals: number;
      bearish_signals: number;
      signals: string[];
    } | null;
  };
}

const INDICATOR_LABELS: Record<string, string> = {
  moving_averages: "MA",
  macd: "MACD",
  rsi: "RSI",
  stochastic_rsi: "StochRSI",
  bollinger_bands: "BB",
  atr: "ATR",
  volume_spike: "Vol",
  obv: "OBV",
  ad_line: "A/D",
  smart_money: "SMC",
  key_levels: "Levels",
  session_analysis: "Session",
};

const DIRECTION_CONFIG: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  strong_buy: { label: "STRONG BUY", color: "var(--color-bull)", icon: TrendingUp },
  buy: { label: "BUY", color: "var(--color-bull)", icon: TrendingUp },
  neutral: { label: "NEUTRAL", color: "var(--color-neon-amber)", icon: AlertTriangle },
  sell: { label: "SELL", color: "var(--color-bear)", icon: TrendingDown },
  strong_sell: { label: "STRONG SELL", color: "var(--color-bear)", icon: TrendingDown },
};

export default function TradeScore() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [result, setResult] = useState<CompositeResult | null>(null);
  const [regime, setRegime] = useState<RegimeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        // Ensure price data exists for this timeframe
        await api.fetchPrices(activeSymbol, activeTimeframe, 200);
        const [compositeData, regimeData] = await Promise.allSettled([
          api.compositeScore(activeSymbol, activeTimeframe),
          api.mlRegime(activeSymbol, activeTimeframe),
        ]);
        if (compositeData.status === "fulfilled") setResult(compositeData.value);
        if (regimeData.status === "fulfilled") setRegime(regimeData.value);
      } catch {
        // Fallback to basic indicators
        try {
          const data = await api.indicators(activeSymbol, activeTimeframe, 200);
          const indicators = data?.indicators || [];
          setResult(computeFallbackScore(indicators, activeSymbol));
        } catch {
          setError(true);
          setResult(null);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSymbol, activeTimeframe]);

  if (loading) {
    return (
      <div className="card-glass rounded-lg p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-3.5 h-3.5 rounded-full bg-[var(--color-bg-hover)] animate-pulse" />
          <div className="h-3 bg-[var(--color-bg-hover)] rounded w-24 animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-[var(--color-bg-hover)] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-[var(--color-bg-hover)] rounded w-20 animate-pulse" />
            <div className="h-2 bg-[var(--color-bg-hover)] rounded w-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Composite Score
          </h3>
        </div>
        <div className="p-3 text-center">
          <HelpCircle className="w-6 h-6 text-[var(--color-text-muted)] mx-auto mb-1" />
          <p className="text-[10px] text-[var(--color-text-muted)]">
            No data for {activeSymbol}. Fetch prices first.
          </p>
        </div>
      </div>
    );
  }

  const config = DIRECTION_CONFIG[result.direction] || DIRECTION_CONFIG.neutral;
  const ScoreIcon = config.icon;
  const scoreColor = config.color;

  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * result.composite_score) / 100;

  const tech = result.breakdown?.technical;
  const mtf = result.breakdown?.mtf_confluence;
  const macro = result.breakdown?.macro;
  const cot = result.breakdown?.cot;
  const indicators = tech?.indicators || [];

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Zap className="w-3.5 h-3.5" style={{ color: scoreColor }} />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Composite Score
        </h3>
        {regime && regime.regime !== "unknown" && (
          <span
            className="text-[7px] font-mono px-1.5 py-0.5 rounded uppercase font-bold"
            style={{
              color: regime.color,
              backgroundColor: `color-mix(in srgb, ${regime.color} 15%, transparent)`,
              border: `1px solid color-mix(in srgb, ${regime.color} 30%, transparent)`,
            }}
          >
            {regime.regime.replace(/_/g, " ")}
          </span>
        )}
        <span
          className="text-[8px] font-mono px-1.5 py-0.5 rounded ml-auto uppercase font-bold"
          style={{
            color: scoreColor,
            backgroundColor: `color-mix(in srgb, ${scoreColor} 12%, transparent)`,
          }}
        >
          {result.confidence}% conf
        </span>
      </div>

      <div className="p-3 space-y-2">
        {/* Score ring + direction */}
        <div className="flex items-center gap-3">
          <div className="relative shrink-0" style={{ width: 60, height: 60 }}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r={radius} fill="none" stroke="var(--color-bg-hover)" strokeWidth="3.5" />
              <circle
                cx="30" cy="30" r={radius}
                fill="none" stroke={scoreColor} strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={dashOffset}
                transform="rotate(-90 30 30)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-base font-bold font-mono" style={{ color: scoreColor }}>
                {result.composite_score}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ScoreIcon className="w-3.5 h-3.5" style={{ color: scoreColor }} />
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: scoreColor }}>
                {config.label}
              </span>
            </div>
            <p className="text-[9px] text-[var(--color-text-secondary)] leading-relaxed">
              {result.composite_score >= 65
                ? `Strong institutional alignment on ${activeSymbol}. ${tech?.bullish_count || 0}/${indicators.length} indicators bullish.`
                : result.composite_score <= 35
                  ? `Distribution detected on ${activeSymbol}. ${tech?.bearish_count || 0}/${indicators.length} indicators bearish.`
                  : `Mixed signals on ${activeSymbol}. Wait for confirmation.`}
            </p>
          </div>
        </div>

        {/* Factor breakdown bars */}
        <div className="space-y-1 pt-1 border-t border-[var(--color-border-primary)]">
          <FactorBar icon={BarChart3} label="Technical" value={tech?.score || 50}
            detail={`${tech?.bullish_count || 0}B ${tech?.bearish_count || 0}S ${tech?.neutral_count || 0}N`} />
          {mtf && (
            <FactorBar icon={Layers} label="MTF"
              value={mtf.direction.includes("bullish") ? 75 : mtf.direction.includes("bearish") ? 25 : 50}
              detail={mtf.direction.replace(/_/g, " ").toUpperCase()} />
          )}
          {macro && (
            <FactorBar icon={Globe} label="Macro" value={macro.score || 50}
              detail={`${macro.direction?.toUpperCase()} (${macro.bullish}B/${macro.bearish}S)`} />
          )}
          {cot && (
            <FactorBar icon={Shield} label="COT"
              value={cot.bullish_signals > cot.bearish_signals ? 70 : cot.bearish_signals > cot.bullish_signals ? 30 : 50}
              detail={cot.signals?.[0]?.substring(0, 35) || "No signals"} />
          )}
        </div>

        {/* Indicator dots grid */}
        {indicators.length > 0 && (
          <div className="border-t border-[var(--color-border-primary)] pt-1.5">
            <div className="grid grid-cols-4 gap-x-1 gap-y-0.5">
              {indicators.map((ind, i) => (
                <div key={i} className="flex items-center gap-1" title={`${ind.name}: ${ind.classification}`}>
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        ind.signal === "bullish" ? "var(--color-bull)"
                          : ind.signal === "bearish" ? "var(--color-bear)"
                            : "var(--color-text-muted)",
                    }}
                  />
                  <span className="text-[7px] font-mono text-[var(--color-text-muted)] truncate">
                    {INDICATOR_LABELS[ind.name] || ind.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FactorBar({
  icon: Icon, label, value, detail,
}: {
  icon: typeof TrendingUp; label: string; value: number; detail: string;
}) {
  const color = value >= 60 ? "var(--color-bull)" : value <= 40 ? "var(--color-bear)" : "var(--color-neon-amber)";
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-2.5 h-2.5 shrink-0" style={{ color }} />
      <span className="text-[8px] font-semibold text-[var(--color-text-muted)] w-12 shrink-0 uppercase">{label}</span>
      <div className="flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[7px] font-mono w-24 text-right shrink-0 truncate" style={{ color }}>{detail}</span>
    </div>
  );
}

function computeFallbackScore(indicators: any[], symbol: string): CompositeResult {
  const WEIGHTS: Record<string, number> = {
    moving_averages: 2.0, macd: 1.5, rsi: 1.0, stochastic_rsi: 0.75,
    bollinger_bands: 1.0, atr: 0.5, volume_spike: 1.5, obv: 1.0, ad_line: 1.0,
  };
  let bullW = 0, bearW = 0, totalW = 0;
  const breakdown: any[] = [];
  for (const ind of indicators) {
    const weight = WEIGHTS[ind.name] || 1.0;
    const cls = ind.metadata?.classification || "";
    const joined = (ind.signals || []).join(" ").toLowerCase();
    let signal = "neutral";
    if (joined.includes("bullish") || joined.includes("accumulation") || cls.includes("bullish") || cls.includes("uptrend")) signal = "bullish";
    else if (joined.includes("bearish") || joined.includes("distribution") || cls.includes("bearish") || cls.includes("downtrend")) signal = "bearish";
    totalW += weight;
    if (signal === "bullish") bullW += weight;
    else if (signal === "bearish") bearW += weight;
    breakdown.push({ name: ind.name, signal, weight, classification: cls });
  }
  const score = totalW > 0 ? Math.round(((bullW + (totalW - bullW - bearW) * 0.5) / totalW) * 100) : 50;
  const direction = score >= 65 ? "strong_buy" : score >= 55 ? "buy" : score <= 35 ? "strong_sell" : score <= 45 ? "sell" : "neutral";
  const bullCount = breakdown.filter((b: any) => b.signal === "bullish").length;
  const bearCount = breakdown.filter((b: any) => b.signal === "bearish").length;
  const confidence = Math.round(Math.max(bullCount, bearCount) / Math.max(breakdown.length, 1) * 100);
  return {
    composite_score: score, direction, confidence,
    breakdown: {
      technical: { score, bullish_count: bullCount, bearish_count: bearCount, neutral_count: breakdown.length - bullCount - bearCount, indicators: breakdown },
      mtf_confluence: { direction: "mixed", bonus: 0 },
      macro: null, cot: null,
    },
  };
}
