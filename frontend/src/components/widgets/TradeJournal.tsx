"use client";

import { memo, useEffect, useState } from "react";
import { BookOpen, TrendingUp, TrendingDown, Target } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface JournalEntry {
  date: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
  best_trade_pnl: number;
  worst_trade_pnl: number;
  avg_rr: number;
}

interface Analytics {
  total_signals: number;
  win_rate: number;
  avg_pnl: number;
  best_pnl: number;
  worst_pnl: number;
  avg_rr: number;
}

function TradeJournal() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("30d");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      api.scalperJournal(activeSymbol, 50),
      api.scalperAnalytics(activeSymbol),
    ]).then(([jRes, aRes]) => {
      if (cancelled) return;
      if (jRes.status === "fulfilled") setJournal(jRes.value?.entries || jRes.value || []);
      if (aRes.status === "fulfilled") setAnalytics(aRes.value);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeSymbol]);

  const filtered = period === "all" ? journal : journal.slice(0, period === "7d" ? 7 : 30);
  const totalPnl = filtered.reduce((s, e) => s + (e.total_pnl || 0), 0);
  const totalTrades = filtered.reduce((s, e) => s + (e.total_trades || 0), 0);
  const totalWins = filtered.reduce((s, e) => s + (e.wins || 0), 0);
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

  // Simple equity curve from cumulative P&L
  const equityCurve = filtered.map((e, i) =>
    filtered.slice(0, i + 1).reduce((s, x) => s + (x.total_pnl || 0), 0)
  );
  const maxEquity = Math.max(...equityCurve.map(Math.abs), 1);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-[var(--color-neon-blue)]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
            Trade Journal
          </span>
        </div>
        <div className="flex gap-1">
          {(["7d", "30d", "all"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-1.5 py-0.5 text-[8px] font-mono rounded ${
                period === p ? "bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-20 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-[var(--color-neon-blue)]/30 border-t-[var(--color-neon-blue)] rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "Trades", value: totalTrades.toString(), color: "var(--color-text-primary)" },
              { label: "Win Rate", value: `${winRate.toFixed(0)}%`, color: winRate >= 50 ? "var(--color-bull)" : "var(--color-bear)" },
              { label: "P&L", value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(1)}`, color: totalPnl >= 0 ? "var(--color-bull)" : "var(--color-bear)" },
              { label: "Avg R:R", value: (analytics?.avg_rr || 0).toFixed(1), color: "var(--color-neon-amber)" },
            ].map(s => (
              <div key={s.label} className="text-center p-1.5 rounded bg-[var(--color-bg-primary)]/50">
                <div className="text-[8px] text-[var(--color-text-muted)] uppercase">{s.label}</div>
                <div className="text-[11px] font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Mini equity curve */}
          {equityCurve.length > 1 && (
            <div className="h-12 flex items-end gap-px">
              {equityCurve.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${Math.max(5, (Math.abs(v) / maxEquity) * 100)}%`,
                    backgroundColor: v >= 0 ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)",
                  }}
                />
              ))}
            </div>
          )}

          {/* Recent entries */}
          {filtered.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-hide">
              {filtered.slice(0, 10).map((e, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1 rounded text-[9px] font-mono bg-[var(--color-bg-primary)]/30">
                  <span className="text-[var(--color-text-muted)]">{e.date?.slice(5) || `Day ${i + 1}`}</span>
                  <span className="text-[var(--color-text-secondary)]">{e.total_trades || 0}t</span>
                  <span className={e.total_pnl >= 0 ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}>
                    {e.total_pnl >= 0 ? "+" : ""}{(e.total_pnl || 0).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <p className="text-[9px] text-[var(--color-text-muted)] text-center py-4">No journal entries yet</p>
          )}
        </>
      )}
    </div>
  );
}

export default memo(TradeJournal);
