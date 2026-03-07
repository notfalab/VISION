"use client";

import { useState, useMemo } from "react";
import { Grid3X3, AlertTriangle, RefreshCw } from "lucide-react";
import Header from "@/components/layout/Header";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";

interface CorrelationData {
  symbols: string[];
  matrix: number[][];
  correlation_breaks: {
    pair: [string, string];
    historical: number;
    current: number;
    break_magnitude: number;
    significance: string;
  }[];
  period_days: number;
  group: string;
}

type Period = 30 | 60 | 90;
type Group = "forex" | "crypto" | "all";

function getCellColor(val: number): string {
  const abs = Math.abs(val);
  const opacity = Math.min(abs * 0.85, 0.8);
  if (val > 0.05) return `rgba(16, 185, 129, ${opacity})`;
  if (val < -0.05) return `rgba(239, 68, 68, ${opacity})`;
  return "transparent";
}

export default function CorrelationsMatrix() {
  const [period, setPeriod] = useState<Period>(30);
  const [group, setGroup] = useState<Group>("forex");
  const [showBreaks, setShowBreaks] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  const { data, loading, refresh } = useApiData<CorrelationData>(
    () => api.marketCorrelations(period, group),
    [period, group],
    { interval: 300_000, key: `corr:${period}:${group}` },
  );

  const breakPairs = useMemo(() => {
    if (!data?.correlation_breaks) return new Set<string>();
    const set = new Set<string>();
    for (const b of data.correlation_breaks) {
      set.add(`${b.pair[0]}:${b.pair[1]}`);
      set.add(`${b.pair[1]}:${b.pair[0]}`);
    }
    return set;
  }, [data]);

  type BreakInfo = CorrelationData["correlation_breaks"][0];
  const breakMap = useMemo(() => {
    const map = new Map<string, BreakInfo>();
    if (!data?.correlation_breaks) return map;
    for (const b of data.correlation_breaks) {
      map.set(`${b.pair[0]}:${b.pair[1]}`, b);
      map.set(`${b.pair[1]}:${b.pair[0]}`, b);
    }
    return map;
  }, [data]);

  const symbols = data?.symbols ?? [];
  const matrix = data?.matrix ?? [];

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* Title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Grid3X3 className="w-6 h-6 text-[var(--color-neon-cyan)]" />
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Correlation Matrix</h1>
            <span className="text-xs text-[var(--color-text-muted)]">
              {symbols.length}x{symbols.length} &middot; {period}d
            </span>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex gap-1 p-1 bg-[var(--color-bg-secondary)] rounded-lg">
            {([30, 60, 90] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  period === p
                    ? "bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
          <div className="flex gap-1 p-1 bg-[var(--color-bg-secondary)] rounded-lg">
            {(["forex", "crypto", "all"] as Group[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={`px-3 py-1 rounded text-xs font-semibold uppercase transition-all ${
                  group === g
                    ? "bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={showBreaks}
              onChange={(e) => setShowBreaks(e.target.checked)}
              className="rounded"
            />
            Highlight breaks
          </label>
        </div>

        {/* Correlation breaks alert */}
        {data?.correlation_breaks && data.correlation_breaks.length > 0 && (
          <div className="mb-6 p-4 bg-[var(--color-neon-amber)]/5 border border-[var(--color-neon-amber)]/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-[var(--color-neon-amber)]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-neon-amber)]">
                Correlation Breaks Detected
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.correlation_breaks.slice(0, 6).map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-[var(--color-text-primary)]">
                    {b.pair[0]} / {b.pair[1]}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {b.historical.toFixed(2)} → {b.current.toFixed(2)}
                  </span>
                  <span className={`font-semibold ${b.significance === "high" ? "text-[var(--color-neon-amber)]" : "text-[var(--color-text-secondary)]"}`}>
                    Δ{b.break_magnitude.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && !data && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[var(--color-neon-cyan)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Matrix */}
        {symbols.length > 0 && (
          <div className="overflow-x-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl p-4">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-[var(--color-bg-secondary)] z-10 w-16" />
                  {symbols.map((s) => (
                    <th
                      key={s}
                      className="px-1 py-2 text-[9px] font-bold text-[var(--color-text-muted)] uppercase"
                      style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", minWidth: 28 }}
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbols.map((row, ri) => (
                  <tr key={row}>
                    <td className="sticky left-0 bg-[var(--color-bg-secondary)] z-10 text-[9px] font-bold text-[var(--color-text-muted)] pr-2 whitespace-nowrap">
                      {row}
                    </td>
                    {matrix[ri]?.map((val, ci) => {
                      const isBreak = showBreaks && breakPairs.has(`${row}:${symbols[ci]}`);
                      const isDiag = ri === ci;
                      const isHovered = hoveredCell?.row === ri || hoveredCell?.col === ci;
                      const breakInfo = breakMap.get(`${row}:${symbols[ci]}`);

                      return (
                        <td
                          key={ci}
                          className={`relative text-center cursor-default transition-all ${
                            isHovered ? "ring-1 ring-[var(--color-neon-blue)]/40" : ""
                          } ${isBreak ? "ring-1 ring-[var(--color-neon-amber)] animate-pulse" : ""}`}
                          style={{
                            backgroundColor: isDiag ? "var(--color-neon-blue)" : getCellColor(val),
                            minWidth: 28,
                            height: 28,
                          }}
                          onMouseEnter={() => setHoveredCell({ row: ri, col: ci })}
                          onMouseLeave={() => setHoveredCell(null)}
                          title={
                            isDiag
                              ? row
                              : `${row} / ${symbols[ci]}: ${val.toFixed(3)}${
                                  breakInfo ? ` (break: ${breakInfo.historical.toFixed(2)} → ${breakInfo.current.toFixed(2)})` : ""
                                }`
                          }
                        >
                          <span className={`text-[8px] font-mono ${isDiag ? "text-white font-bold" : "text-[var(--color-text-primary)]"}`}>
                            {isDiag ? "1" : val.toFixed(1) === "0.0" ? "" : val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 text-[10px] text-[var(--color-text-muted)]">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: "rgba(239, 68, 68, 0.6)" }} />
                Strong negative
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: "transparent", border: "1px solid var(--color-border-primary)" }} />
                No correlation
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: "rgba(16, 185, 129, 0.6)" }} />
                Strong positive
              </div>
              {showBreaks && (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded ring-1 ring-[var(--color-neon-amber)]" />
                  Correlation break
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && symbols.length === 0 && (
          <div className="text-center py-16 text-[var(--color-text-muted)]">
            No correlation data available. Requires daily OHLCV data in the database.
          </div>
        )}
      </div>
    </div>
  );
}
