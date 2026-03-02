"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Trophy,
  Skull,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";

interface Analytics {
  symbol: string;
  total_signals: number;
  completed: number;
  wins: number;
  losses: number;
  pending: number;
  active: number;
  expired: number;
  win_rate: number;
  avg_pnl: number;
  avg_pnl_pct: number;
  total_pnl: number;
  best_trade: number;
  worst_trade: number;
  avg_rr: number;
  profit_factor: number;
  by_timeframe: Record<
    string,
    { total: number; wins: number; losses: number; win_rate: number; avg_pnl: number }
  >;
  by_direction: Record<
    string,
    { total: number; wins: number; win_rate: number; avg_pnl: number }
  >;
  equity_curve: { date: string; pnl: number }[];
}

const ALL_SYMBOLS = ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF"];

export default function PerformanceDashboard() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const [data, setData] = useState<Analytics | null>(null);
  const [globalData, setGlobalData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [viewMode, setViewMode] = useState<"symbol" | "global">("global");

  // Fetch analytics for active symbol
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const result = await api.scalperAnalytics(activeSymbol);
        setData(result as Analytics);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSymbol]);

  // Fetch global analytics (all symbols combined)
  useEffect(() => {
    const loadGlobal = async () => {
      try {
        const results = await Promise.allSettled(
          ALL_SYMBOLS.map((s) => api.scalperAnalytics(s))
        );

        const merged: Analytics = {
          symbol: "ALL",
          total_signals: 0,
          completed: 0,
          wins: 0,
          losses: 0,
          pending: 0,
          active: 0,
          expired: 0,
          win_rate: 0,
          avg_pnl: 0,
          avg_pnl_pct: 0,
          total_pnl: 0,
          best_trade: -Infinity,
          worst_trade: Infinity,
          avg_rr: 0,
          profit_factor: 0,
          by_timeframe: {},
          by_direction: {},
          equity_curve: [],
        };

        let totalRR = 0;
        let grossWins = 0;
        let grossLosses = 0;

        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const a = r.value as Analytics;
          merged.total_signals += a.total_signals || 0;
          merged.completed += a.completed || 0;
          merged.wins += a.wins || 0;
          merged.losses += a.losses || 0;
          merged.pending += a.pending || 0;
          merged.active += a.active || 0;
          merged.expired += a.expired || 0;
          merged.total_pnl += a.total_pnl || 0;
          if ((a.best_trade || 0) > merged.best_trade) merged.best_trade = a.best_trade || 0;
          if ((a.worst_trade || 0) < merged.worst_trade) merged.worst_trade = a.worst_trade || 0;
          totalRR += (a.avg_rr || 0) * (a.completed || 0);

          // Merge equity curves
          for (const pt of (a.equity_curve || [])) {
            merged.equity_curve.push(pt);
          }

          // Accumulate for profit factor
          for (const pt of (a.equity_curve || [])) {
            if (pt.pnl > 0) grossWins += pt.pnl;
            else grossLosses += Math.abs(pt.pnl);
          }

          // Merge by_timeframe
          for (const [tf, stats] of Object.entries(a.by_timeframe || {})) {
            if (!merged.by_timeframe[tf]) {
              merged.by_timeframe[tf] = { total: 0, wins: 0, losses: 0, win_rate: 0, avg_pnl: 0 };
            }
            merged.by_timeframe[tf].total += stats.total || 0;
            merged.by_timeframe[tf].wins += stats.wins || 0;
            merged.by_timeframe[tf].losses += stats.losses || 0;
          }

          // Merge by_direction
          for (const [dir, stats] of Object.entries(a.by_direction || {})) {
            if (!merged.by_direction[dir]) {
              merged.by_direction[dir] = { total: 0, wins: 0, win_rate: 0, avg_pnl: 0 };
            }
            merged.by_direction[dir].total += stats.total || 0;
            merged.by_direction[dir].wins += stats.wins || 0;
          }
        }

        merged.win_rate = merged.completed > 0 ? Math.round((merged.wins / merged.completed) * 1000) / 10 : 0;
        merged.avg_pnl = merged.completed > 0 ? Math.round((merged.total_pnl / merged.completed) * 100) / 100 : 0;
        merged.avg_rr = merged.completed > 0 ? Math.round((totalRR / merged.completed) * 100) / 100 : 0;
        merged.profit_factor = grossLosses > 0 ? Math.round((grossWins / grossLosses) * 100) / 100 : merged.wins > 0 ? Infinity : 0;
        if (merged.best_trade === -Infinity) merged.best_trade = 0;
        if (merged.worst_trade === Infinity) merged.worst_trade = 0;

        // Recalc win rates in sub-groups
        for (const tf of Object.keys(merged.by_timeframe)) {
          const s = merged.by_timeframe[tf];
          s.win_rate = s.total > 0 ? Math.round((s.wins / s.total) * 1000) / 10 : 0;
        }
        for (const dir of Object.keys(merged.by_direction)) {
          const s = merged.by_direction[dir];
          s.win_rate = s.total > 0 ? Math.round((s.wins / s.total) * 1000) / 10 : 0;
        }

        // Sort equity curve by date
        merged.equity_curve.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setGlobalData(merged);
      } catch {
        // Silently fail for global
      }
    };
    loadGlobal();
  }, []);

  const analytics = viewMode === "global" ? globalData : data;

  if (loading && !analytics) {
    return (
      <div className="card-glass rounded-lg p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[var(--color-bg-hover)] rounded w-1/3" />
          <div className="h-32 bg-[var(--color-bg-hover)] rounded" />
        </div>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div className="card-glass rounded-lg p-4">
        <p className="text-xs text-[var(--color-bear)]">Failed to load performance data</p>
      </div>
    );
  }

  if (!analytics || analytics.completed === 0) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[var(--color-neon-purple)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase">Performance</h3>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">No completed signals yet</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Performance data will appear after signals resolve</p>
        </div>
      </div>
    );
  }

  const pnlPositive = analytics.total_pnl >= 0;
  const pfText = analytics.profit_factor === Infinity ? "∞" : analytics.profit_factor.toFixed(2);

  // Compute drawdown from equity curve
  const drawdownData = (() => {
    if (!analytics.equity_curve.length) return [];
    let peak = 0;
    return analytics.equity_curve.map((pt) => {
      if (pt.pnl > peak) peak = pt.pnl;
      const dd = peak > 0 ? ((pt.pnl - peak) / peak) * 100 : 0;
      return {
        date: new Date(pt.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        drawdown: Math.round(dd * 100) / 100,
      };
    });
  })();

  // Timeframe bar data
  const tfData = Object.entries(analytics.by_timeframe).map(([tf, s]) => ({
    name: tf,
    winRate: s.win_rate,
    total: s.total,
  }));

  // Direction pie data
  const dirData = Object.entries(analytics.by_direction).map(([dir, s]) => ({
    name: dir === "long" ? "Long" : "Short",
    value: s.total,
    winRate: s.win_rate,
    color: dir === "long" ? "var(--color-bull)" : "var(--color-bear)",
  }));

  // Win/Loss pie
  const winLossData = [
    { name: "Wins", value: analytics.wins, color: "var(--color-bull)" },
    { name: "Losses", value: analytics.losses, color: "var(--color-bear)" },
    ...(analytics.expired > 0 ? [{ name: "Expired", value: analytics.expired, color: "var(--color-text-muted)" }] : []),
  ];

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[var(--color-neon-purple)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase">Performance</h3>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("global")}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
              viewMode === "global"
                ? "bg-[var(--color-neon-purple)]/20 text-[var(--color-neon-purple)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            ALL
          </button>
          <button
            onClick={() => setViewMode("symbol")}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
              viewMode === "symbol"
                ? "bg-[var(--color-neon-purple)]/20 text-[var(--color-neon-purple)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {activeSymbol}
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KPICard
            label="Win Rate"
            value={`${analytics.win_rate}%`}
            icon={<Target className="w-3.5 h-3.5" />}
            color={analytics.win_rate >= 50 ? "var(--color-bull)" : "var(--color-bear)"}
            sub={`${analytics.wins}W / ${analytics.losses}L`}
          />
          <KPICard
            label="Total P&L"
            value={`${pnlPositive ? "+" : ""}${analytics.total_pnl.toFixed(2)}`}
            icon={pnlPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            color={pnlPositive ? "var(--color-bull)" : "var(--color-bear)"}
            sub={`${analytics.completed} trades`}
          />
          <KPICard
            label="Profit Factor"
            value={pfText}
            icon={<ArrowUpRight className="w-3.5 h-3.5" />}
            color={analytics.profit_factor >= 1.5 ? "var(--color-bull)" : analytics.profit_factor >= 1 ? "var(--color-neon-amber)" : "var(--color-bear)"}
            sub={`Avg R:R ${analytics.avg_rr}`}
          />
          <KPICard
            label="Best / Worst"
            value={`+${analytics.best_trade.toFixed(0)}`}
            icon={<Trophy className="w-3.5 h-3.5" />}
            color="var(--color-neon-amber)"
            sub={<span className="text-[var(--color-bear)]"><Skull className="w-2.5 h-2.5 inline mr-0.5" />{analytics.worst_trade.toFixed(0)}</span>}
          />
        </div>

        {/* Equity Curve */}
        {analytics.equity_curve.length > 1 && (
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase mb-2">Equity Curve</p>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={analytics.equity_curve.map((pt) => ({
                    date: new Date(pt.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                    pnl: pt.pnl,
                  }))}
                >
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-primary)",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "JetBrains Mono",
                    }}
                    labelStyle={{ color: "#e2e8f0" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "P&L"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="pnl"
                    stroke={pnlPositive ? "var(--color-bull)" : "var(--color-bear)"}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Drawdown */}
        {drawdownData.length > 1 && (
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase mb-2">Drawdown</p>
            <div className="h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={drawdownData}>
                  <XAxis dataKey="date" hide />
                  <YAxis
                    tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-primary)",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "JetBrains Mono",
                    }}
                    labelStyle={{ color: "#e2e8f0" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    formatter={(value) => [`${Number(value ?? 0).toFixed(2)}%`, "Drawdown"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="drawdown"
                    stroke="var(--color-bear)"
                    strokeWidth={1.5}
                    dot={false}
                    fill="var(--color-bear)"
                    fillOpacity={0.1}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Bottom row: Win/Loss pie + Timeframe bars + Direction */}
        {(() => {
          const hasTf = tfData.length > 0;
          const hasDir = dirData.length > 0;
          const cols = 1 + (hasTf ? 1 : 0) + (hasDir ? 1 : 0);
          const gridClass = cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
          return (
            <div className={`grid ${gridClass} gap-3`}>
              {/* Win/Loss Donut with center label + legend */}
              <div>
                <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase mb-1 text-center">W/L Ratio</p>
                <div className="h-[100px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={winLossData}
                        cx="50%"
                        cy="45%"
                        innerRadius={25}
                        outerRadius={38}
                        dataKey="value"
                        stroke="none"
                      >
                        {winLossData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-bg-elevated)",
                          border: "1px solid var(--color-border-primary)",
                          borderRadius: 8,
                          fontSize: 10,
                          fontFamily: "JetBrains Mono",
                        }}
                        labelStyle={{ color: "#e2e8f0" }}
                        itemStyle={{ color: "#e2e8f0" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label — win rate % */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none", paddingBottom: 10 }}>
                    <span
                      className="text-sm font-mono font-bold"
                      style={{ color: analytics.win_rate >= 50 ? "var(--color-bull)" : "var(--color-bear)" }}
                    >
                      {analytics.win_rate}%
                    </span>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex items-center justify-center gap-3 -mt-1">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--color-bull)" }} />
                    <span className="text-[9px] font-mono text-[var(--color-text-secondary)]">{analytics.wins}W</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--color-bear)" }} />
                    <span className="text-[9px] font-mono text-[var(--color-text-secondary)]">{analytics.losses}L</span>
                  </span>
                  {analytics.expired > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--color-text-muted)" }} />
                      <span className="text-[9px] font-mono text-[var(--color-text-secondary)]">{analytics.expired}E</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Timeframe Win Rate Bars */}
              {hasTf && (
                <div>
                  <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase mb-1 text-center">By Timeframe</p>
                  <div className="h-[100px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tfData}>
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-bg-elevated)",
                            border: "1px solid var(--color-border-primary)",
                            borderRadius: 8,
                            fontSize: 10,
                            fontFamily: "JetBrains Mono",
                          }}
                          labelStyle={{ color: "#e2e8f0" }}
                          itemStyle={{ color: "#e2e8f0" }}
                          formatter={(value) => [`${Number(value ?? 0)}%`, "Win Rate"]}
                        />
                        <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
                          {tfData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.winRate >= 50 ? "var(--color-bull)" : "var(--color-bear)"}
                              opacity={0.8}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Inline legend with totals */}
                  <div className="flex items-center justify-center gap-2 mt-0.5">
                    {tfData.map((tf) => (
                      <span key={tf.name} className="text-[8px] font-mono text-[var(--color-text-muted)]">
                        {tf.name}: {tf.total}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Direction */}
              {hasDir && (
                <div>
                  <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase mb-1 text-center">Long vs Short</p>
                  <div className="space-y-3 pt-2">
                    {dirData.map((d) => (
                      <div key={d.name}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-mono font-semibold flex items-center gap-0.5" style={{ color: d.color }}>
                            {d.name === "Long" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {d.name}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                            {d.winRate}% <span className="text-[var(--color-text-muted)]">({d.value})</span>
                          </span>
                        </div>
                        <div className="h-3 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${d.winRate}%`,
                              backgroundColor: d.color,
                              opacity: 0.8,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-bg-hover)]/50 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[9px] font-semibold text-[var(--color-text-muted)] uppercase">{label}</span>
      </div>
      <p className="text-lg font-mono font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5">{sub}</p>
    </div>
  );
}
