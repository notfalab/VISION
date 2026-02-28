"use client";

import { useEffect, useState } from "react";
import { Layers, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface MTFData {
  timeframes: Record<string, {
    available: boolean;
    indicators: Record<string, {
      classification: string;
      signal: string;
      value: number;
    }>;
  }>;
  confluence: Record<string, {
    alignment: string;
    score: number;
  }>;
  overall: {
    direction: string;
    score: number;
    bullish_count: number;
    bearish_count: number;
  };
}

const TF_LABELS: Record<string, string> = { "1h": "1H", "4h": "4H", "1d": "1D" };
const IND_LABELS: Record<string, string> = {
  moving_averages: "Trend (MA)",
  macd: "MACD",
  rsi: "RSI",
  smart_money: "SMC",
};

export default function MTFConfluence() {
  const { activeSymbol } = useMarketStore();
  const [data, setData] = useState<MTFData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Pre-fetch prices for all MTF timeframes so the backend has data to analyze
        await Promise.allSettled([
          api.fetchPrices(activeSymbol, "1h", 200),
          api.fetchPrices(activeSymbol, "4h", 200),
          api.fetchPrices(activeSymbol, "1d", 200),
        ]);
        const result = await api.mtfConfluence(activeSymbol);
        setData(result);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSymbol]);

  const overall = data?.overall;
  const overallColor = overall?.direction.includes("bullish")
    ? "var(--color-bull)"
    : overall?.direction.includes("bearish")
      ? "var(--color-bear)"
      : "var(--color-neon-amber)";

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <Layers className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          MTF Confluence
        </h3>
        {overall && (
          <span
            className="text-[12px] font-mono px-1.5 py-0.5 rounded ml-auto uppercase font-bold"
            style={{ color: overallColor, backgroundColor: `color-mix(in srgb, ${overallColor} 12%, transparent)` }}
          >
            {overall.direction.replace(/_/g, " ")}
          </span>
        )}
      </div>

      <div className="p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-4">
            <Loader2 className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
            <span className="text-sm text-[var(--color-text-muted)]">Analyzing timeframes...</span>
          </div>
        ) : !data ? (
          <div className="text-sm text-[var(--color-text-muted)] text-center py-4">
            No MTF data available
          </div>
        ) : (
          <>
            {/* Matrix: rows=indicators, cols=timeframes */}
            <div className="rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_36px_36px_36px] md:grid-cols-[1fr_40px_40px_40px] gap-0 px-2 py-1 border-b border-[var(--color-border-primary)]">
                <span className="text-[12px] text-[var(--color-text-muted)] uppercase">Indicator</span>
                {["1h", "4h", "1d"].map(tf => (
                  <span key={tf} className="text-[12px] text-[var(--color-text-muted)] uppercase text-center">
                    {TF_LABELS[tf]}
                  </span>
                ))}
              </div>

              {/* Data rows */}
              {Object.keys(IND_LABELS).map(ind => (
                <div key={ind} className="grid grid-cols-[1fr_36px_36px_36px] md:grid-cols-[1fr_40px_40px_40px] gap-0 px-2 py-1 border-b border-[var(--color-border-primary)] last:border-b-0">
                  <span className="text-[12px] font-mono text-[var(--color-text-secondary)]">{IND_LABELS[ind]}</span>
                  {["1h", "4h", "1d"].map(tf => {
                    const tfData = data.timeframes[tf];
                    if (!tfData?.available || !tfData.indicators[ind]) {
                      return <span key={tf} className="text-center text-[12px] text-[var(--color-text-muted)]">—</span>;
                    }
                    const signal = tfData.indicators[ind].signal;
                    return (
                      <div key={tf} className="flex justify-center">
                        <SignalDot signal={signal} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Confluence scores */}
            {data.confluence && Object.keys(data.confluence).length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {Object.entries(data.confluence).map(([ind, conf]) => {
                  const color = conf.alignment.includes("bullish") ? "var(--color-bull)"
                    : conf.alignment.includes("bearish") ? "var(--color-bear)" : "var(--color-text-muted)";
                  return (
                    <div key={ind} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-[var(--color-text-muted)] w-14 shrink-0">
                        {IND_LABELS[ind] || ind}
                      </span>
                      <div className="flex-1 h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${conf.score}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-[11px] font-mono w-6 text-right" style={{ color }}>
                        {conf.score}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SignalDot({ signal }: { signal: string }) {
  if (signal === "bullish") return <TrendingUp className="w-4 h-4 text-[var(--color-bull)]" />;
  if (signal === "bearish") return <TrendingDown className="w-4 h-4 text-[var(--color-bear)]" />;
  return <Minus className="w-4 h-4 text-[var(--color-text-muted)]" />;
}
