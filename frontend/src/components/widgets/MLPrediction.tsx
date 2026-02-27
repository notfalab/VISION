"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Activity,
  Clock,
} from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface PredictionData {
  direction: string;
  confidence: number;
  probabilities: Record<string, number>;
  top_features: { name: string; importance: number }[];
  model_age_hours: number;
}

interface RegimeData {
  regime: string;
  confidence: number;
  description: string;
  color: string;
  stability: number;
  features: Record<string, number>;
}

const DIRECTION_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof TrendingUp }
> = {
  bullish: {
    label: "BULLISH",
    color: "var(--color-bull)",
    icon: TrendingUp,
  },
  bearish: {
    label: "BEARISH",
    color: "var(--color-bear)",
    icon: TrendingDown,
  },
  neutral: {
    label: "NEUTRAL",
    color: "var(--color-neon-amber)",
    icon: Minus,
  },
};

const FEATURE_LABELS: Record<string, string> = {
  returns_1: "Returns 1",
  returns_5: "Returns 5",
  returns_10: "Returns 10",
  body_ratio: "Body Ratio",
  upper_wick_ratio: "Upper Wick",
  lower_wick_ratio: "Lower Wick",
  is_bullish: "Bullish Candle",
  ema9_dist: "EMA9 Dist",
  ema21_dist: "EMA21 Dist",
  sma50_dist: "SMA50 Dist",
  ema_cross: "EMA Cross",
  rsi: "RSI",
  macd_hist: "MACD Hist",
  macd_hist_change: "MACD Δ",
  stoch_k: "Stoch %K",
  atr_pct: "ATR %",
  bb_pctb: "BB %B",
  bb_width: "BB Width",
  volume_ratio: "Vol Ratio",
  volume_trend: "Vol Trend",
  obv_slope: "OBV Slope",
};

export default function MLPrediction() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [regime, setRegime] = useState<RegimeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [predData, regimeData] = await Promise.allSettled([
        api.mlPredict(activeSymbol, activeTimeframe),
        api.mlRegime(activeSymbol, activeTimeframe),
      ]);
      if (predData.status === "fulfilled") setPrediction(predData.value);
      if (regimeData.status === "fulfilled") setRegime(regimeData.value);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeSymbol, activeTimeframe]);

  if (loading) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-28 mb-2" />
        <div className="space-y-1.5">
          <div className="h-12 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-8 bg-[var(--color-bg-hover)] rounded" />
        </div>
      </div>
    );
  }

  if (error && !prediction && !regime) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-[var(--color-neon-purple)]" />
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            ML Prediction
          </h3>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] text-[var(--color-text-muted)]">
            ML engine warming up. Ensure price data is fetched.
          </p>
        </div>
      </div>
    );
  }

  const dir = prediction
    ? DIRECTION_CONFIG[prediction.direction] || DIRECTION_CONFIG.neutral
    : DIRECTION_CONFIG.neutral;
  const DirIcon = dir.icon;

  // Confidence ring
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const confidence = prediction?.confidence || 0;
  const dashOffset = circumference - circumference * confidence;

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Brain className="w-3.5 h-3.5 text-[var(--color-neon-purple)]" />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          ML Prediction
        </h3>
        {regime && (
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
        <button
          onClick={load}
          className="ml-auto p-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
          title="Refresh prediction"
        >
          <RefreshCw className="w-3 h-3 text-[var(--color-text-muted)]" />
        </button>
      </div>

      <div className="p-2.5 space-y-2">
        {/* Prediction direction + confidence */}
        {prediction && (
          <div className="flex items-center gap-3">
            <div
              className="relative shrink-0"
              style={{ width: 52, height: 52 }}
            >
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle
                  cx="26"
                  cy="26"
                  r={radius}
                  fill="none"
                  stroke="var(--color-bg-hover)"
                  strokeWidth="3"
                />
                <circle
                  cx="26"
                  cy="26"
                  r={radius}
                  fill="none"
                  stroke={dir.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 26 26)"
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-sm font-bold font-mono"
                  style={{ color: dir.color }}
                >
                  {Math.round(confidence * 100)}%
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <DirIcon
                  className="w-3.5 h-3.5"
                  style={{ color: dir.color }}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: dir.color }}
                >
                  Next candle: {dir.label}
                </span>
              </div>

              {/* Probability bars */}
              <div className="space-y-0.5">
                {Object.entries(prediction.probabilities).map(
                  ([direction, prob]) => {
                    const c =
                      direction === "bullish"
                        ? "var(--color-bull)"
                        : direction === "bearish"
                          ? "var(--color-bear)"
                          : "var(--color-text-muted)";
                    return (
                      <div
                        key={direction}
                        className="flex items-center gap-1"
                      >
                        <span className="text-[7px] font-mono w-10 uppercase text-[var(--color-text-muted)]">
                          {direction.slice(0, 4)}
                        </span>
                        <div className="flex-1 h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${prob * 100}%`,
                              backgroundColor: c,
                            }}
                          />
                        </div>
                        <span
                          className="text-[7px] font-mono w-8 text-right"
                          style={{ color: c }}
                        >
                          {(prob * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}

        {/* Feature importance */}
        {prediction?.top_features && prediction.top_features.length > 0 && (
          <div className="border-t border-[var(--color-border-primary)] pt-1.5">
            <div className="text-[8px] text-[var(--color-text-muted)] uppercase mb-1 flex items-center gap-1">
              <Activity className="w-2.5 h-2.5" />
              Top Features
            </div>
            <div className="space-y-0.5">
              {prediction.top_features.slice(0, 5).map((feat, i) => {
                const maxImp = prediction.top_features[0]?.importance || 1;
                const pct = (feat.importance / maxImp) * 100;
                return (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-[7px] font-mono w-16 truncate text-[var(--color-text-muted)]">
                      {FEATURE_LABELS[feat.name] || feat.name}
                    </span>
                    <div className="flex-1 h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--color-neon-blue)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[7px] font-mono w-8 text-right text-[var(--color-text-muted)]">
                      {(feat.importance * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Regime details */}
        {regime && regime.regime !== "unknown" && (
          <div className="border-t border-[var(--color-border-primary)] pt-1.5">
            <div className="rounded-md bg-[var(--color-bg-secondary)] px-2 py-1.5 border border-[var(--color-border-primary)]">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: regime.color }}
                />
                <span className="text-[8px] font-semibold text-[var(--color-text-primary)] uppercase">
                  Regime: {regime.regime.replace(/_/g, " ")}
                </span>
                <span className="text-[7px] font-mono ml-auto text-[var(--color-text-muted)]">
                  {((regime.confidence ?? 0) * 100).toFixed(0)}% •
                  Stability {((regime.stability ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-[7px] text-[var(--color-text-secondary)]">
                {regime.description}
              </p>
            </div>
          </div>
        )}

        {/* Model age footer */}
        {prediction && (
          <div className="flex items-center gap-1 text-[7px] text-[var(--color-text-muted)]">
            <Clock className="w-2.5 h-2.5" />
            <span>
              Model age: {prediction.model_age_hours < 1
                ? "< 1h"
                : `${(prediction.model_age_hours ?? 0).toFixed(0)}h`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
