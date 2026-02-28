"use client";

import { useEffect, useState } from "react";
import { Globe, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface MacroIndicator {
  value: number;
  gold_signal: string;
  explanation: string;
  [key: string]: unknown;
}

interface MacroSummary {
  treasury_10y?: MacroIndicator;
  yield_curve?: MacroIndicator & { spread_2y_10y: number; inverted: boolean };
  fed_rate?: MacroIndicator;
  cpi?: MacroIndicator & { mom_change_pct: number };
  inflation?: MacroIndicator;
  macro_score?: {
    score: number;
    bullish_count: number;
    bearish_count: number;
    neutral_count: number;
    direction: string;
  };
}

const INDICATOR_LABELS: Record<string, string> = {
  treasury_10y: "US 10Y Yield",
  yield_curve: "Yield Curve",
  fed_rate: "Fed Funds Rate",
  cpi: "CPI Index",
  inflation: "Annual Inflation",
};

function SignalDot({ signal }: { signal: string }) {
  const color =
    signal === "bullish"
      ? "var(--color-bull)"
      : signal === "bearish"
        ? "var(--color-bear)"
        : "var(--color-text-muted)";
  return (
    <div
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function formatMacroValue(key: string, ind: MacroIndicator): string {
  if (key === "treasury_10y") return `${ind.value}%`;
  if (key === "yield_curve") return `${(ind as any).spread_2y_10y}%`;
  if (key === "fed_rate") return `${ind.value}%`;
  if (key === "cpi") return `${ind.value}`;
  if (key === "inflation") return `${Number(ind.value).toFixed(2)}%`;
  return `${ind.value}`;
}

export default function GoldMacro() {
  const [data, setData] = useState<MacroSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.goldMacroSummary();
        setData(result);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const score = data?.macro_score;
  const indicators = data
    ? Object.entries(data).filter(([k]) => k !== "macro_score" && INDICATOR_LABELS[k])
    : [];

  const scoreColor =
    score?.direction === "bullish"
      ? "var(--color-bull)"
      : score?.direction === "bearish"
        ? "var(--color-bear)"
        : "var(--color-neon-amber)";

  return (
    <div className="card-glass rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <Globe className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Gold Macro Analysis
        </h3>
        {score && (
          <span
            className="text-[13px] font-mono px-1.5 py-0.5 rounded ml-auto uppercase"
            style={{
              color: scoreColor,
              backgroundColor: `color-mix(in srgb, ${scoreColor} 10%, transparent)`,
            }}
          >
            {score.direction} ({score.score})
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-6">
            <Loader2 className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
            <span className="text-sm text-[var(--color-text-muted)]">
              Fetching macro data... (rate-limited, ~1 min)
            </span>
          </div>
        ) : !data || indicators.length === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)] text-center py-6">
            Macro data loading... refresh in a moment.
          </div>
        ) : (
          <>
            {/* Score bar */}
            {score && (
              <div className="rounded-md bg-[var(--color-bg-secondary)] p-3 border border-[var(--color-border-primary)] mb-1">
                <div className="flex items-center gap-3 text-[13px] font-mono">
                  <span style={{ color: scoreColor }} className="font-bold uppercase">
                    Macro: {score.direction}
                  </span>
                  <span className="text-[var(--color-bull)]">{score.bullish_count}B</span>
                  <span className="text-[var(--color-bear)]">{score.bearish_count}S</span>
                  <span className="text-[var(--color-text-muted)]">{score.neutral_count}N</span>
                  <div className="flex-1 h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                    <div className="h-full flex">
                      <div
                        className="h-full bg-[var(--color-bull)]"
                        style={{ width: `${(score.bullish_count / Math.max(score.bullish_count + score.bearish_count + score.neutral_count, 1)) * 100}%` }}
                      />
                      <div
                        className="h-full bg-[var(--color-bear)]"
                        style={{ width: `${(score.bearish_count / Math.max(score.bullish_count + score.bearish_count + score.neutral_count, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Individual indicators */}
            {indicators.map(([key, ind]) => {
              const indicator = ind as MacroIndicator;
              const signal = indicator.gold_signal;
              return (
                <div
                  key={key}
                  className="rounded-md bg-[var(--color-bg-secondary)] px-3 py-2 border border-[var(--color-border-primary)]"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <SignalDot signal={signal} />
                    <span className="text-[13px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                      {INDICATOR_LABELS[key]}
                    </span>
                    <span className="text-sm font-mono font-bold ml-auto" style={{
                      color: signal === "bullish" ? "var(--color-bull)" : signal === "bearish" ? "var(--color-bear)" : "var(--color-text-secondary)"
                    }}>
                      {formatMacroValue(key, indicator)}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
                    {indicator.explanation}
                  </p>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
