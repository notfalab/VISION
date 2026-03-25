"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, TrendingUp, TrendingDown, Target, Award, AlertTriangle, BarChart2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
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

export default function PerformancePage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, checkAuth } = useAuthStore();
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    (async () => {
      try {
        const data = await api.scalperJournal("XAUUSD", 90);
        setJournal(data?.entries || data || []);
      } catch {}
      setLoading(false);
    })();
  }, [authLoading, isAuthenticated]);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="w-6 h-6 border-2 border-[var(--color-neon-blue)]/30 border-t-[var(--color-neon-blue)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    router.replace("/login");
    return null;
  }

  // Compute stats
  const totalTrades = journal.reduce((s, e) => s + (e.total_trades || 0), 0);
  const totalWins = journal.reduce((s, e) => s + (e.wins || 0), 0);
  const totalPnl = journal.reduce((s, e) => s + (e.total_pnl || 0), 0);
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  const bestDay = journal.reduce((best, e) => e.total_pnl > best ? e.total_pnl : best, -Infinity);
  const worstDay = journal.reduce((worst, e) => e.total_pnl < worst ? e.total_pnl : worst, Infinity);

  // Equity curve
  const equityCurve: { date: string; equity: number }[] = [];
  let cumPnl = 0;
  for (const e of journal) {
    cumPnl += e.total_pnl || 0;
    equityCurve.push({ date: e.date, equity: cumPnl });
  }

  // Drawdown
  let peak = 0;
  const drawdownCurve = equityCurve.map(e => {
    if (e.equity > peak) peak = e.equity;
    return { date: e.date, dd: peak > 0 ? ((e.equity - peak) / peak) * 100 : 0 };
  });
  const maxDD = Math.min(...drawdownCurve.map(d => d.dd));

  // Calendar heatmap
  const pnlByDate: Record<string, number> = {};
  journal.forEach(e => { if (e.date) pnlByDate[e.date] = e.total_pnl; });

  // Win streak
  let currentStreak = 0, maxStreak = 0;
  for (const e of journal) {
    if (e.total_pnl >= 0) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
    else { currentStreak = 0; }
  }

  const maxEquity = Math.max(...equityCurve.map(e => Math.abs(e.equity)), 1);
  const maxDDabs = Math.max(...drawdownCurve.map(d => Math.abs(d.dd)), 1);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] grid-pattern">
      {/* Header */}
      <div className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-vision.png" alt="VISION" width={120} height={20} priority />
            <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              Performance
            </span>
          </div>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-neon-blue)] hover:text-[var(--color-neon-cyan)] transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Dashboard
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[var(--color-neon-blue)]/30 border-t-[var(--color-neon-blue)] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: "Total P&L", value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(1)}`, color: totalPnl >= 0 ? "var(--color-bull)" : "var(--color-bear)", icon: TrendingUp },
                { label: "Win Rate", value: `${winRate.toFixed(1)}%`, color: winRate >= 50 ? "var(--color-bull)" : "var(--color-bear)", icon: Target },
                { label: "Total Trades", value: totalTrades.toString(), color: "var(--color-neon-blue)", icon: BarChart2 },
                { label: "Best Day", value: `+${(bestDay || 0).toFixed(1)}`, color: "var(--color-bull)", icon: Award },
                { label: "Worst Day", value: (worstDay || 0).toFixed(1), color: "var(--color-bear)", icon: AlertTriangle },
                { label: "Win Streak", value: maxStreak.toString(), color: "var(--color-neon-amber)", icon: TrendingUp },
              ].map(c => {
                const Icon = c.icon;
                return (
                  <div key={c.label} className="card-glass rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3.5 h-3.5" style={{ color: c.color }} />
                      <span className="text-[9px] font-semibold text-[var(--color-text-muted)] uppercase">{c.label}</span>
                    </div>
                    <div className="text-lg font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
                  </div>
                );
              })}
            </div>

            {/* Equity curve */}
            <div className="card-glass rounded-lg p-5">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-primary)] mb-3">Equity Curve</h3>
              <div className="h-32 flex items-end gap-px">
                {equityCurve.map((e, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t transition-all"
                    style={{
                      height: `${Math.max(3, (Math.abs(e.equity) / maxEquity) * 100)}%`,
                      backgroundColor: e.equity >= 0 ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.6)",
                    }}
                    title={`${e.date}: ${e.equity.toFixed(1)}`}
                  />
                ))}
              </div>
              {equityCurve.length === 0 && (
                <p className="text-[9px] text-[var(--color-text-muted)] text-center py-8">No data yet</p>
              )}
            </div>

            {/* Drawdown */}
            <div className="card-glass rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">Drawdown</h3>
                <span className="text-[9px] font-mono text-[var(--color-bear)]">
                  Max: {maxDD.toFixed(1)}%
                </span>
              </div>
              <div className="h-16 flex items-start gap-px">
                {drawdownCurve.map((d, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-b"
                    style={{
                      height: `${Math.max(1, (Math.abs(d.dd) / maxDDabs) * 100)}%`,
                      backgroundColor: "rgba(239,68,68,0.5)",
                    }}
                    title={`${d.date}: ${d.dd.toFixed(1)}%`}
                  />
                ))}
              </div>
            </div>

            {/* Daily P&L table */}
            <div className="card-glass rounded-lg p-5">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-primary)] mb-3">Daily Results</h3>
              <div className="max-h-60 overflow-y-auto scrollbar-hide">
                <table className="w-full text-[9px] font-mono">
                  <thead>
                    <tr className="text-[var(--color-text-muted)] border-b border-[var(--color-border-primary)]">
                      <th className="text-left py-1.5">Date</th>
                      <th className="text-center">Trades</th>
                      <th className="text-center">Wins</th>
                      <th className="text-center">Win %</th>
                      <th className="text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.slice(0, 30).map((e, i) => (
                      <tr key={i} className="border-b border-[var(--color-border-primary)]/30">
                        <td className="py-1.5 text-[var(--color-text-secondary)]">{e.date || `Day ${i}`}</td>
                        <td className="text-center text-[var(--color-text-primary)]">{e.total_trades}</td>
                        <td className="text-center text-[var(--color-bull)]">{e.wins}</td>
                        <td className="text-center" style={{ color: e.win_rate >= 50 ? "var(--color-bull)" : "var(--color-bear)" }}>
                          {(e.win_rate || 0).toFixed(0)}%
                        </td>
                        <td className="text-right font-bold" style={{ color: e.total_pnl >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
                          {e.total_pnl >= 0 ? "+" : ""}{(e.total_pnl || 0).toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {journal.length === 0 && (
                  <p className="text-[9px] text-[var(--color-text-muted)] text-center py-8">No journal entries yet</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
