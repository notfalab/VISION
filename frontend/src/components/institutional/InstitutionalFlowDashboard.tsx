"use client";

import { useMemo } from "react";
import { Building2, TrendingUp, TrendingDown, Minus, Activity, RefreshCw, Flame } from "lucide-react";
import Header from "@/components/layout/Header";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";

interface SymbolSummary {
  symbol: string;
  heat_score: number | null;
  heat_label: string | null;
  divergence_score: number | null;
  divergence_signal: string | null;
  institutional_bias: string | null;
  retail_bias: string | null;
}

function HeatBadge({ score, label }: { score: number | null; label: string | null }) {
  if (score === null) return <span className="text-xs text-[var(--color-text-muted)]">--</span>;
  const color =
    score >= 70 ? "text-[var(--color-bull)] bg-[var(--color-bull)]/10" :
    score >= 40 ? "text-[var(--color-neon-amber)] bg-[var(--color-neon-amber)]/10" :
    "text-[var(--color-text-muted)] bg-[var(--color-bg-hover)]";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      <Flame className="w-3 h-3" />
      {score}
      <span className="font-normal text-[10px] opacity-70">{label}</span>
    </span>
  );
}

function BiasArrow({ bias }: { bias: string | null }) {
  if (!bias || bias === "neutral") return <Minus className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />;
  if (bias.includes("bullish")) return <TrendingUp className="w-3.5 h-3.5 text-[var(--color-bull)]" />;
  return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
}

function SignalBadge({ signal }: { signal: string | null }) {
  if (!signal || signal === "neutral") {
    return <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-hover)] px-2 py-0.5 rounded">Neutral</span>;
  }
  const isBullish = signal.includes("bullish");
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
      isBullish ? "text-[var(--color-bull)] bg-[var(--color-bull)]/10" : "text-red-500 bg-red-500/10"
    }`}>
      {signal.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  );
}

export default function InstitutionalFlowDashboard() {
  const { data, loading, refresh } = useApiData<{ symbols: SymbolSummary[]; count: number }>(
    () => api.institutionalSummary(),
    [],
    { interval: 60_000, key: "inst-flow" },
  );

  const symbols = data?.symbols ?? [];

  const sortedByHeat = useMemo(
    () => [...symbols].sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0)),
    [symbols],
  );

  const sortedByDivergence = useMemo(
    () => [...symbols].filter((s) => s.divergence_score !== null).sort((a, b) => Math.abs(b.divergence_score ?? 0) - Math.abs(a.divergence_score ?? 0)),
    [symbols],
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-[var(--color-neon-purple)]" />
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Institutional Flow</h1>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[var(--color-neon-purple)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Institutional Heat Scores ── */}
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4 flex items-center gap-2">
              <Flame className="w-4 h-4 text-[var(--color-neon-amber)]" />
              Institutional Heat Scores
            </h2>
            <div className="space-y-2">
              {sortedByHeat.map((s) => (
                <div
                  key={s.symbol}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <span className="text-sm font-bold text-[var(--color-text-primary)] w-20">{s.symbol}</span>
                  <div className="flex-1 mx-4">
                    <div className="h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${s.heat_score ?? 0}%`,
                          background: (s.heat_score ?? 0) >= 70
                            ? "var(--color-bull)"
                            : (s.heat_score ?? 0) >= 40
                            ? "var(--color-neon-amber)"
                            : "var(--color-text-muted)",
                        }}
                      />
                    </div>
                  </div>
                  <HeatBadge score={s.heat_score} label={s.heat_label} />
                </div>
              ))}
            </div>
          </div>

          {/* ── Divergence Signals ── */}
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--color-neon-cyan)]" />
              Divergence Signals
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="text-left py-2 px-2">Symbol</th>
                    <th className="text-center py-2 px-2">Signal</th>
                    <th className="text-center py-2 px-2">Institutional</th>
                    <th className="text-center py-2 px-2">Retail</th>
                    <th className="text-right py-2 px-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByDivergence.map((s) => (
                    <tr key={s.symbol} className="border-t border-[var(--color-border-primary)] hover:bg-[var(--color-bg-hover)]">
                      <td className="py-2 px-2 font-bold text-[var(--color-text-primary)]">{s.symbol}</td>
                      <td className="py-2 px-2 text-center"><SignalBadge signal={s.divergence_signal} /></td>
                      <td className="py-2 px-2 text-center"><BiasArrow bias={s.institutional_bias} /></td>
                      <td className="py-2 px-2 text-center"><BiasArrow bias={s.retail_bias} /></td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-[var(--color-text-secondary)]">
                        {s.divergence_score != null ? Math.abs(s.divergence_score).toFixed(0) : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Summary Cards ── */}
          <div className="lg:col-span-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--color-neon-purple)]" />
              Institutional Bias Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {symbols.map((s) => {
                const isBullish = s.institutional_bias?.includes("bullish");
                const isBearish = s.institutional_bias?.includes("bearish");
                return (
                  <div
                    key={s.symbol}
                    className={`p-3 rounded-lg border text-center transition-colors ${
                      isBullish
                        ? "border-[var(--color-bull)]/30 bg-[var(--color-bull)]/5"
                        : isBearish
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-[var(--color-border-primary)] bg-[var(--color-bg-card)]"
                    }`}
                  >
                    <div className="text-xs font-bold text-[var(--color-text-primary)] mb-1">{s.symbol}</div>
                    <BiasArrow bias={s.institutional_bias} />
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-1 capitalize">
                      {s.institutional_bias?.replace(/_/g, " ") ?? "neutral"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
