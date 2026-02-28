"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Activity,
  Gauge,
  LineChart,
  Waves,
  ArrowUpDown,
  Target,
  Zap,
  Brain,
  Clock,
} from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface IndicatorData {
  name: string;
  values: Record<string, number>;
  signals: string[];
  metadata: Record<string, unknown>;
}

const INDICATOR_CONFIG: Record<
  string,
  { title: string; icon: typeof Activity; category: "trend" | "momentum" | "volatility" | "volume" | "smart_money" }
> = {
  moving_averages: { title: "Moving Averages", icon: LineChart, category: "trend" },
  macd: { title: "MACD", icon: Activity, category: "trend" },
  rsi: { title: "RSI", icon: Gauge, category: "momentum" },
  stochastic_rsi: { title: "Stochastic RSI", icon: Zap, category: "momentum" },
  bollinger_bands: { title: "Bollinger Bands", icon: Waves, category: "volatility" },
  atr: { title: "ATR", icon: ArrowUpDown, category: "volatility" },
  volume_spike: { title: "Volume Spikes", icon: BarChart3, category: "volume" },
  obv: { title: "OBV", icon: TrendingUp, category: "volume" },
  ad_line: { title: "A/D Line", icon: Target, category: "volume" },
  smart_money: { title: "Smart Money (SMC)", icon: Brain, category: "smart_money" },
  key_levels: { title: "Key Levels", icon: Target, category: "smart_money" },
  session_analysis: { title: "Session Analysis", icon: Clock, category: "smart_money" },
};

function getSignalType(ind: IndicatorData): "bullish" | "bearish" | "neutral" {
  const joined = (ind.signals || []).join(" ").toLowerCase();
  if (
    joined.includes("bullish") ||
    joined.includes("accumulation") ||
    joined.includes("oversold") ||
    joined.includes("strong_uptrend")
  )
    return "bullish";
  if (
    joined.includes("bearish") ||
    joined.includes("distribution") ||
    joined.includes("overbought") ||
    joined.includes("strong_downtrend") ||
    joined.includes("death_cross")
  )
    return "bearish";
  return "neutral";
}

function describeIndicator(ind: IndicatorData): {
  value: string;
  description: string;
  badge: string;
} {
  const val = ind.values?.value;
  const meta = ind.metadata || {};
  const signals = ind.signals || [];

  switch (ind.name) {
    case "rsi": {
      const rsiVal = val?.toFixed(1) || "?";
      const cls = (meta.classification as string) || "neutral";
      const desc =
        cls === "overbought"
          ? "Overbought territory — pullback likely"
          : cls === "oversold"
            ? "Oversold territory — bounce likely"
            : cls === "bullish_momentum"
              ? "Bullish momentum building"
              : cls === "bearish_momentum"
                ? "Bearish momentum building"
                : "Neutral momentum zone";
      return { value: rsiVal, description: desc, badge: cls.replace("_", " ") };
    }

    case "macd": {
      const hist = (meta.histogram as number)?.toFixed(2) || "0";
      const cls = (meta.classification as string) || "neutral";
      const crossover = meta.crossover as string | undefined;
      let desc = cls.replace(/_/g, " ");
      if (crossover) desc = crossover.replace(/_/g, " ") + " — strong signal";
      return {
        value: `H: ${hist}`,
        description: desc.charAt(0).toUpperCase() + desc.slice(1),
        badge: crossover ? crossover.replace("_", " ") : cls.replace("_", " "),
      };
    }

    case "bollinger_bands": {
      const pctB = ((meta.percent_b as number) * 100)?.toFixed(0) || "?";
      const cls = (meta.classification as string) || "within_bands";
      const isSqueeze = meta.is_squeeze as boolean;
      const desc = isSqueeze
        ? "Volatility squeeze — breakout imminent"
        : cls === "above_upper_band"
          ? "Above upper band — extended, reversal possible"
          : cls === "near_upper_band"
            ? "Near upper band — uptrend strong"
            : cls === "below_lower_band"
              ? "Below lower band — oversold bounce possible"
              : cls === "near_lower_band"
                ? "Near lower band — downtrend pressure"
                : "Within normal bands";
      return { value: `%B: ${pctB}%`, description: desc, badge: isSqueeze ? "SQUEEZE" : cls.replace(/_/g, " ") };
    }

    case "moving_averages": {
      const cls = (meta.classification as string) || "neutral";
      const crossover = meta.crossover as string | undefined;
      const above20 = meta.above_sma20 as boolean;
      const above50 = meta.above_sma50 as boolean;
      const ema9 = (meta.ema9 as number)?.toFixed(2);
      let desc = cls.replace(/_/g, " ");
      if (crossover === "golden_cross") desc = "Golden Cross — major bullish signal";
      else if (crossover === "death_cross") desc = "Death Cross — major bearish signal";
      else if (cls.includes("ema_crossover")) desc = cls.replace(/_/g, " ") + " detected";
      const badges = [];
      if (above20) badges.push(">SMA20");
      if (above50) badges.push(">SMA50");
      return {
        value: `EMA9: ${ema9}`,
        description: desc.charAt(0).toUpperCase() + desc.slice(1),
        badge: crossover ? crossover.replace("_", " ") : badges.join(" ") || cls.replace(/_/g, " "),
      };
    }

    case "atr": {
      const atrVal = val?.toFixed(2) || "?";
      const atrPct = (meta.atr_percent as number)?.toFixed(2) || "?";
      const cls = (meta.classification as string) || "normal_volatility";
      const stopDist = (meta.stop_loss_distance as number)?.toFixed(2) || "?";
      return {
        value: `${atrVal} (${atrPct}%)`,
        description: `${cls.replace(/_/g, " ").charAt(0).toUpperCase()}${cls.replace(/_/g, " ").slice(1)} — Stop: $${stopDist}`,
        badge: cls.replace(/_/g, " "),
      };
    }

    case "stochastic_rsi": {
      const kVal = val?.toFixed(1) || "?";
      const dVal = ind.values?.secondary_value?.toFixed(1) || "?";
      const cls = (meta.classification as string) || "neutral";
      const crossover = meta.crossover as string | undefined;
      let desc = cls.replace(/_/g, " ");
      if (crossover) desc += ` + ${crossover.replace(/_/g, " ")}`;
      return {
        value: `K:${kVal} D:${dVal}`,
        description: desc.charAt(0).toUpperCase() + desc.slice(1),
        badge: cls.replace(/_/g, " "),
      };
    }

    case "volume_spike": {
      const dataPoints = ind.values?.data_points || 0;
      if (dataPoints === 0) {
        return { value: "Normal", description: "No volume spikes detected", badge: "normal" };
      }
      const ratio = val?.toFixed(1) || "?";
      const cls = signals[0] || "neutral";
      return {
        value: `${ratio}x avg`,
        description:
          cls === "accumulation"
            ? "Volume spike + price up — institutional buying"
            : cls === "distribution"
              ? "Volume spike + price down — institutional selling"
              : "High volume, no clear direction",
        badge: cls,
      };
    }

    case "obv": {
      const obvVal = val?.toFixed(0) || "?";
      const div = signals.find((s) => s.includes("divergence"));
      if (div) {
        return {
          value: obvVal,
          description: div.includes("bearish")
            ? "Price up but OBV down — bearish divergence (reversal warning)"
            : "Price down but OBV up — bullish divergence (accumulation)",
          badge: div.replace("_", " "),
        };
      }
      return {
        value: obvVal,
        description: val && val > 0 ? "Positive — buyers dominating volume" : "Negative — sellers dominating volume",
        badge: val && val > 0 ? "buyers" : "sellers",
      };
    }

    case "ad_line": {
      const div = signals.find((s) => s.includes("divergence"));
      if (div) {
        return {
          value: val?.toFixed(0) || "?",
          description: div.includes("bearish")
            ? "Money flowing out despite price holding — distribution"
            : "Money flowing in despite price dropping — accumulation",
          badge: div.replace("_", " "),
        };
      }
      return {
        value: val?.toFixed(0) || "?",
        description:
          val && val > 0 ? "Positive money flow — closes near highs" : "Negative money flow — closes near lows",
        badge: val && val > 0 ? "accumulation" : "distribution",
      };
    }

    case "smart_money": {
      const cls = (meta.classification as string) || "neutral";
      const conf = (meta.confidence as number)?.toFixed(0) || "?";
      const trend = (meta.trend as string) || "neutral";
      const obCount = ((meta.bullish_ob_count as number) || 0) + ((meta.bearish_ob_count as number) || 0);
      const fvgCount = ((meta.bullish_fvg_count as number) || 0) + ((meta.bearish_fvg_count as number) || 0);
      return {
        value: `${conf}% conf`,
        description: `${trend} structure | ${obCount} OBs | ${fvgCount} FVGs — ${cls.replace(/_/g, " ")}`,
        badge: cls.replace(/_/g, " "),
      };
    }

    case "key_levels": {
      const rr = (meta.risk_reward_ratio as number)?.toFixed(1) || "?";
      const cls = (meta.classification as string) || "between_levels";
      const ns = meta.nearest_support as any;
      const nr = meta.nearest_resistance as any;
      return {
        value: `R/R: ${rr}`,
        description: `${cls.replace(/_/g, " ")} | S: ${ns?.price?.toFixed(2) || "?"} R: ${nr?.price?.toFixed(2) || "?"}`,
        badge: cls.replace(/_/g, " "),
      };
    }

    case "session_analysis": {
      const session = (meta.current_session as string) || "off_hours";
      const overlap = meta.in_overlap as boolean;
      const confluence = meta.session_confluence as boolean;
      const bias = (meta.current_session_bias as string) || "neutral";
      return {
        value: session.replace("_", " ").toUpperCase(),
        description: `${overlap ? "London-NY overlap (peak vol)" : `${session.replace("_", " ")} session`} | Bias: ${bias}${confluence ? " | Sessions aligned" : ""}`,
        badge: overlap ? "OVERLAP" : session,
      };
    }

    default:
      return {
        value: val?.toFixed(2) || "N/A",
        description: signals.join(", ") || "No signals",
        badge: signals[0] || "neutral",
      };
  }
}

function IndicatorCard({ ind }: { ind: IndicatorData }) {
  const config = INDICATOR_CONFIG[ind.name];
  const signal = getSignalType(ind);
  const desc = describeIndicator(ind);
  const Icon = config?.icon || Activity;

  const signalColor =
    signal === "bullish"
      ? "var(--color-bull)"
      : signal === "bearish"
        ? "var(--color-bear)"
        : "var(--color-text-muted)";

  return (
    <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-2 border border-[var(--color-border-primary)] hover:border-[var(--color-border-secondary)] transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: signalColor }} />
        <span className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
          {config?.title || ind.name}
        </span>
        <span
          className="text-[10px] font-mono px-1 py-0.5 rounded ml-auto uppercase tracking-wide"
          style={{
            color: signalColor,
            backgroundColor: `color-mix(in srgb, ${signalColor} 10%, transparent)`,
          }}
        >
          {desc.badge}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-mono font-bold" style={{ color: signalColor }}>
          {desc.value}
        </span>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-0.5">{desc.description}</p>
    </div>
  );
}

function SummaryBar({ indicators }: { indicators: IndicatorData[] }) {
  let bull = 0;
  let bear = 0;
  let neutral = 0;
  for (const ind of indicators) {
    const s = getSignalType(ind);
    if (s === "bullish") bull++;
    else if (s === "bearish") bear++;
    else neutral++;
  }
  const total = indicators.length;
  const bullPct = total > 0 ? (bull / total) * 100 : 0;
  const bearPct = total > 0 ? (bear / total) * 100 : 0;

  return (
    <div className="px-3 py-1.5 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center gap-3 text-[11px] font-mono">
        <span className="text-[var(--color-bull)]">{bull} BULL</span>
        <span className="text-[var(--color-bear)]">{bear} BEAR</span>
        <span className="text-[var(--color-text-muted)]">{neutral} NEUTRAL</span>
        <div className="flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden ml-2">
          <div className="h-full flex">
            <div
              className="h-full bg-[var(--color-bull)]"
              style={{ width: `${bullPct}%` }}
            />
            <div
              className="h-full bg-[var(--color-bear)]"
              style={{ width: `${bearPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IndicatorPanel() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [indicators, setIndicators] = useState<IndicatorData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Ensure price data exists for this timeframe
        await api.fetchPrices(activeSymbol, activeTimeframe, 200);
        const result = await api.indicators(activeSymbol, activeTimeframe, 200);
        setIndicators(result?.indicators || []);
      } catch {
        setIndicators([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSymbol, activeTimeframe]);

  // Group indicators by category
  const categories = {
    trend: indicators.filter((i) => INDICATOR_CONFIG[i.name]?.category === "trend"),
    momentum: indicators.filter((i) => INDICATOR_CONFIG[i.name]?.category === "momentum"),
    volatility: indicators.filter((i) => INDICATOR_CONFIG[i.name]?.category === "volatility"),
    volume: indicators.filter((i) => INDICATOR_CONFIG[i.name]?.category === "volume"),
    smart_money: indicators.filter((i) => INDICATOR_CONFIG[i.name]?.category === "smart_money"),
  };

  const CATEGORY_LABELS: Record<string, string> = {
    trend: "TREND",
    momentum: "MOMENTUM",
    volatility: "VOLATILITY",
    volume: "VOLUME FLOW",
    smart_money: "SMART MONEY",
  };

  return (
    <div className="card-glass rounded-lg overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-[var(--color-neon-purple)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Technical Analysis — {activeSymbol}
        </h3>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] ml-auto">
          {indicators.length} indicators
        </span>
      </div>

      {indicators.length > 0 && <SummaryBar indicators={indicators} />}

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-sm text-[var(--color-text-muted)] text-center py-4 animate-pulse">
            Computing {activeSymbol} indicators...
          </div>
        ) : indicators.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <AlertCircle className="w-5 h-5 text-[var(--color-text-muted)]" />
            <span className="text-sm text-[var(--color-text-muted)] text-center">
              No data. Fetch price data to compute indicators.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {(Object.entries(categories) as [string, IndicatorData[]][]).map(
              ([cat, items]) =>
                items.length > 0 && (
                  <div key={cat}>
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest font-semibold mb-1 px-0.5">
                      {CATEGORY_LABELS[cat]}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
                      {items.map((ind, i) => (
                        <IndicatorCard key={i} ind={ind} />
                      ))}
                    </div>
                  </div>
                ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
