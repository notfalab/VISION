"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
  Calendar,
  BarChart3,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/* ─── Types ─── */
interface DashboardData {
  learning: {
    version: number;
    min_confidence: number;
    min_composite_score: number;
    min_confluence: number;
    rolling_win_rate_50: number;
    rolling_win_rate_200: number;
  };
  open_positions: number;
  today: { trades: number; wins: number; pnl: number; win_rate: number };
  all_time: {
    total_trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    total_pnl: number;
  };
  equity_curve: { date: string; pnl: number }[];
}

interface Position {
  id: number;
  symbol: string;
  timeframe: string;
  direction: string;
  status: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  exit_price: number | null;
  risk_reward_ratio: number;
  confidence: number;
  composite_score: number;
  regime: string | null;
  pnl: number | null;
  pnl_pct: number | null;
  loss_category: string | null;
  learning_version: number;
  opened_at: string | null;
  closed_at: string | null;
  indicator_snapshot: Record<string, unknown> | null;
  signal_reasons: Record<string, unknown> | null;
}

interface JournalEntry {
  id: number;
  date: string;
  total_trades: number;
  wins: number;
  losses: number;
  expired: number;
  win_rate: number;
  total_pnl: number;
  best_trade_pnl: number;
  worst_trade_pnl: number;
  avg_confidence: number;
  avg_rr: number;
  symbols_traded: string[];
  notes: string | null;
  learning_version: number;
}

interface LearningVersion {
  version: number;
  min_confidence: number;
  min_composite_score: number;
  min_confluence: number;
  rolling_win_rate_50: number;
  rolling_win_rate_200: number;
  total_trades: number;
  adjustments_log: string[];
  is_active: boolean;
  created_at: string;
}

/* ─── Helper ─── */
async function adminFetch<T>(path: string): Promise<T> {
  const token = localStorage.getItem("vision_token");
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}

async function adminPost<T>(path: string): Promise<T> {
  const token = localStorage.getItem("vision_token");
  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}

function wrColor(wr: number) {
  if (wr >= 80) return "text-emerald-400";
  if (wr >= 60) return "text-yellow-400";
  return "text-red-400";
}

function pnlColor(pnl: number) {
  if (pnl > 0) return "text-emerald-400";
  if (pnl < 0) return "text-red-400";
  return "text-[var(--color-text-muted)]";
}

/* ─── Tabs ─── */
type Tab = "overview" | "positions" | "history" | "journal" | "learning";

export default function AdminSignalsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  // Data
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<Position[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [learning, setLearning] = useState<LearningVersion[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyOutcome, setHistoryOutcome] = useState<string>("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Admin guard
  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/");
  }, [user, router]);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await adminFetch<DashboardData>(
        "/api/v1/admin/signals/dashboard"
      );
      setDashboard(data);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  const loadPositions = useCallback(async () => {
    try {
      const data = await adminFetch<Position[]>(
        "/api/v1/admin/signals/positions?status=open&limit=100"
      );
      setOpenPositions(data);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", String(historyPage));
      params.set("limit", "50");
      if (historyOutcome) params.set("outcome", historyOutcome);
      const data = await adminFetch<{ results: Position[] }>(
        `/api/v1/admin/signals/history?${params}`
      );
      setHistory(data.results || []);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [historyPage, historyOutcome]);

  const loadJournal = useCallback(async () => {
    try {
      const data = await adminFetch<JournalEntry[]>(
        "/api/v1/admin/signals/journal?limit=30"
      );
      setJournal(data);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  const loadLearning = useCallback(async () => {
    try {
      const data = await adminFetch<LearningVersion[]>(
        "/api/v1/admin/signals/learning"
      );
      setLearning(data);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (user?.role !== "admin") return;
    setLoading(true);
    Promise.all([loadDashboard(), loadPositions()]).finally(() =>
      setLoading(false)
    );
  }, [user, loadDashboard, loadPositions]);

  // Tab data load
  useEffect(() => {
    if (tab === "history") loadHistory();
    if (tab === "journal") loadJournal();
    if (tab === "learning") loadLearning();
  }, [tab, loadHistory, loadJournal, loadLearning]);

  const handleResetLearning = async () => {
    if (!confirm("Reset learning state to defaults? This cannot be undone."))
      return;
    try {
      await adminPost("/api/v1/admin/signals/learning/reset");
      toast.success("Learning state reset");
      loadLearning();
      loadDashboard();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (!user || user.role !== "admin") return null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { key: "positions", label: "Open Positions", icon: <Crosshair className="w-4 h-4" /> },
    { key: "history", label: "Trade History", icon: <Target className="w-4 h-4" /> },
    { key: "journal", label: "Daily Journal", icon: <Calendar className="w-4 h-4" /> },
    { key: "learning", label: "Learning", icon: <Brain className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      {/* Header */}
      <div className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Admin
          </Link>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[var(--color-neon-blue)]" />
            <h1 className="text-lg font-bold font-mono">Signals Lab</h1>
          </div>
          <button
            onClick={() => {
              loadDashboard();
              loadPositions();
              if (tab === "history") loadHistory();
              if (tab === "journal") loadJournal();
              if (tab === "learning") loadLearning();
            }}
            className="ml-auto flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-neon-cyan)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-[var(--color-neon-blue)] text-[var(--color-neon-blue)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading && !dashboard ? (
          <div className="text-center py-20 text-[var(--color-text-muted)]">
            Loading...
          </div>
        ) : (
          <>
            {tab === "overview" && dashboard && <OverviewTab data={dashboard} />}
            {tab === "positions" && (
              <PositionsTab positions={openPositions} onRefresh={loadPositions} />
            )}
            {tab === "history" && (
              <HistoryTab
                positions={history}
                page={historyPage}
                outcome={historyOutcome}
                onPageChange={setHistoryPage}
                onOutcomeChange={setHistoryOutcome}
                expandedRow={expandedRow}
                onExpandRow={setExpandedRow}
              />
            )}
            {tab === "journal" && <JournalTab entries={journal} />}
            {tab === "learning" && (
              <LearningTab versions={learning} onReset={handleResetLearning} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ Tab Components ═══════════════════ */

function KPI({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold font-mono ${color || ""}`}>{value}</p>
      {sub && (
        <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{sub}</p>
      )}
    </div>
  );
}

function OverviewTab({ data }: { data: DashboardData }) {
  const at = data.all_time;
  const td = data.today;
  const lr = data.learning;

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPI
          label="Win Rate (all)"
          value={`${at.win_rate}%`}
          color={wrColor(at.win_rate)}
          sub={`${at.wins}W / ${at.losses}L`}
        />
        <KPI
          label="Total P&L"
          value={`${at.total_pnl >= 0 ? "+" : ""}${at.total_pnl.toFixed(1)}`}
          color={pnlColor(at.total_pnl)}
          sub={`${at.total_trades} trades`}
        />
        <KPI label="Open" value={data.open_positions} sub="positions" />
        <KPI
          label="Today"
          value={td.trades}
          sub={`${td.wins}W — ${td.pnl >= 0 ? "+" : ""}${td.pnl.toFixed(1)} pts`}
          color={pnlColor(td.pnl)}
        />
        <KPI
          label="WR 50"
          value={`${(lr.rolling_win_rate_50 * 100).toFixed(0)}%`}
          color={wrColor(lr.rolling_win_rate_50 * 100)}
          sub="last 50 trades"
        />
        <KPI
          label="Learning v"
          value={`v${lr.version}`}
          sub={`conf>=${lr.min_confidence.toFixed(2)}`}
        />
      </div>

      {/* Equity Curve (simple ASCII-style bar visualization) */}
      {data.equity_curve.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
          <h3 className="text-xs font-mono font-bold text-[var(--color-text-secondary)] mb-3">
            Equity Curve (cumulative P&L)
          </h3>
          <div className="flex items-end gap-[2px] h-32">
            {(() => {
              const pts = data.equity_curve;
              const vals = pts.map((p) => p.pnl);
              const max = Math.max(...vals, 1);
              const min = Math.min(...vals, 0);
              const range = max - min || 1;
              // Show last 100 entries max
              const display = pts.slice(-100);
              return display.map((p, i) => {
                const h = ((p.pnl - min) / range) * 100;
                return (
                  <div
                    key={i}
                    className={`flex-1 min-w-[2px] rounded-t ${
                      p.pnl >= 0 ? "bg-emerald-500/70" : "bg-red-500/70"
                    }`}
                    style={{ height: `${Math.max(h, 2)}%` }}
                    title={`${p.date?.split("T")[0] || ""}: ${p.pnl.toFixed(1)}`}
                  />
                );
              });
            })()}
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-[var(--color-text-muted)]">
            <span>
              {data.equity_curve[0]?.date?.split("T")[0] || ""}
            </span>
            <span>
              {data.equity_curve[data.equity_curve.length - 1]?.date?.split("T")[0] || ""}
            </span>
          </div>
        </div>
      )}

      {/* Learning State summary */}
      <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
        <h3 className="text-xs font-mono font-bold text-[var(--color-text-secondary)] mb-3">
          Active Learning Parameters
        </h3>
        <div className="grid grid-cols-3 gap-4 text-sm font-mono">
          <div>
            <span className="text-[var(--color-text-muted)]">Min Confidence:</span>{" "}
            <span className="text-[var(--color-neon-cyan)]">
              {(lr.min_confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div>
            <span className="text-[var(--color-text-muted)]">Min Score:</span>{" "}
            <span className="text-[var(--color-neon-cyan)]">
              {lr.min_composite_score}
            </span>
          </div>
          <div>
            <span className="text-[var(--color-text-muted)]">Min Confluence:</span>{" "}
            <span className="text-[var(--color-neon-cyan)]">
              {lr.min_confluence}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionsTab({
  positions,
  onRefresh,
}: {
  positions: Position[];
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono font-bold">
          Open Positions ({positions.length})
        </h2>
        <button
          onClick={onRefresh}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-neon-cyan)] flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {positions.length === 0 ? (
        <p className="text-center py-10 text-sm text-[var(--color-text-muted)]">
          No open positions
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border-primary)]">
          <table className="w-full text-xs font-mono">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr className="text-[var(--color-text-muted)]">
                <th className="text-left px-3 py-2">Symbol</th>
                <th className="text-left px-3 py-2">Dir</th>
                <th className="text-right px-3 py-2">Entry</th>
                <th className="text-right px-3 py-2">TP</th>
                <th className="text-right px-3 py-2">SL</th>
                <th className="text-right px-3 py-2">R:R</th>
                <th className="text-right px-3 py-2">Conf</th>
                <th className="text-right px-3 py-2">Score</th>
                <th className="text-left px-3 py-2">TF</th>
                <th className="text-left px-3 py-2">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-primary)]">
              {positions.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--color-bg-hover)]">
                  <td className="px-3 py-2 font-bold">{p.symbol}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        p.direction === "long"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {p.direction === "long" ? (
                        <TrendingUp className="w-3.5 h-3.5 inline" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 inline" />
                      )}{" "}
                      {p.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{p.entry_price}</td>
                  <td className="px-3 py-2 text-right text-emerald-400">
                    {p.take_profit}
                  </td>
                  <td className="px-3 py-2 text-right text-red-400">
                    {p.stop_loss}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.risk_reward_ratio.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(p.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.composite_score.toFixed(0)}
                  </td>
                  <td className="px-3 py-2">{p.timeframe}</td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">
                    {p.opened_at
                      ? new Date(p.opened_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoryTab({
  positions,
  page,
  outcome,
  onPageChange,
  onOutcomeChange,
  expandedRow,
  onExpandRow,
}: {
  positions: Position[];
  page: number;
  outcome: string;
  onPageChange: (p: number) => void;
  onOutcomeChange: (o: string) => void;
  expandedRow: number | null;
  onExpandRow: (id: number | null) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-mono font-bold">Trade History</h2>
        <select
          value={outcome}
          onChange={(e) => {
            onOutcomeChange(e.target.value);
            onPageChange(1);
          }}
          className="text-xs font-mono bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded px-2 py-1 text-[var(--color-text-primary)]"
        >
          <option value="">All outcomes</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
          <option value="expired">Expired</option>
        </select>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-2 py-1 rounded border border-[var(--color-border-primary)] disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-[var(--color-text-muted)]">Page {page}</span>
          <button
            disabled={positions.length < 50}
            onClick={() => onPageChange(page + 1)}
            className="px-2 py-1 rounded border border-[var(--color-border-primary)] disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>

      {positions.length === 0 ? (
        <p className="text-center py-10 text-sm text-[var(--color-text-muted)]">
          No closed positions yet
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border-primary)]">
          <table className="w-full text-xs font-mono">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr className="text-[var(--color-text-muted)]">
                <th className="w-6 px-2 py-2"></th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Symbol</th>
                <th className="text-left px-3 py-2">Dir</th>
                <th className="text-right px-3 py-2">Entry</th>
                <th className="text-right px-3 py-2">Exit</th>
                <th className="text-right px-3 py-2">P&L</th>
                <th className="text-right px-3 py-2">Conf</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Loss Cat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-primary)]">
              {positions.map((p) => (
                <>
                  <tr
                    key={p.id}
                    onClick={() =>
                      onExpandRow(expandedRow === p.id ? null : p.id)
                    }
                    className="hover:bg-[var(--color-bg-hover)] cursor-pointer"
                  >
                    <td className="px-2 py-2 text-[var(--color-text-muted)]">
                      {expandedRow === p.id ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">
                      {p.closed_at
                        ? new Date(p.closed_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-bold">{p.symbol}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          p.direction === "long"
                            ? "text-emerald-400"
                            : "text-red-400"
                        }
                      >
                        {p.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{p.entry_price}</td>
                    <td className="px-3 py-2 text-right">
                      {p.exit_price ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-bold ${pnlColor(
                        p.pnl ?? 0
                      )}`}
                    >
                      {p.pnl != null
                        ? `${p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(p.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase ${
                          p.status === "win"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : p.status === "loss"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">
                      {p.loss_category || "—"}
                    </td>
                  </tr>
                  {expandedRow === p.id && (
                    <tr key={`${p.id}-expand`}>
                      <td
                        colSpan={10}
                        className="px-6 py-3 bg-[var(--color-bg-secondary)] text-[10px]"
                      >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <span className="text-[var(--color-text-muted)]">
                              R:R:
                            </span>{" "}
                            {p.risk_reward_ratio.toFixed(2)}
                          </div>
                          <div>
                            <span className="text-[var(--color-text-muted)]">
                              Score:
                            </span>{" "}
                            {p.composite_score.toFixed(1)}
                          </div>
                          <div>
                            <span className="text-[var(--color-text-muted)]">
                              Regime:
                            </span>{" "}
                            {p.regime || "—"}
                          </div>
                          <div>
                            <span className="text-[var(--color-text-muted)]">
                              TF:
                            </span>{" "}
                            {p.timeframe}
                          </div>
                          <div>
                            <span className="text-[var(--color-text-muted)]">
                              P&L %:
                            </span>{" "}
                            {p.pnl_pct != null ? `${p.pnl_pct.toFixed(3)}%` : "—"}
                          </div>
                          <div>
                            <span className="text-[var(--color-text-muted)]">
                              Learning v:
                            </span>{" "}
                            {p.learning_version}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JournalTab({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-center py-10 text-sm text-[var(--color-text-muted)]">
        No journal entries yet. They are generated daily at 22:00 UTC.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((j) => (
        <div
          key={j.id}
          className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-mono font-bold">{j.date}</h3>
            <span
              className={`text-sm font-mono font-bold ${wrColor(j.win_rate)}`}
            >
              {j.win_rate.toFixed(0)}% WR
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono mb-2">
            <div>
              <span className="text-[var(--color-text-muted)]">Trades:</span>{" "}
              {j.total_trades}
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">W/L/E:</span>{" "}
              <span className="text-emerald-400">{j.wins}</span>/
              <span className="text-red-400">{j.losses}</span>/
              <span className="text-yellow-400">{j.expired}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">P&L:</span>{" "}
              <span className={pnlColor(j.total_pnl)}>
                {j.total_pnl >= 0 ? "+" : ""}
                {j.total_pnl.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Avg R:R:</span>{" "}
              {j.avg_rr.toFixed(1)}
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">
                Learning v:
              </span>{" "}
              {j.learning_version}
            </div>
          </div>
          {j.notes && (
            <p className="text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-border-primary)] pt-2 mt-2">
              {j.notes}
            </p>
          )}
          {j.symbols_traded?.length > 0 && (
            <div className="flex gap-1 mt-2">
              {j.symbols_traded.map((s) => (
                <span
                  key={s}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LearningTab({
  versions,
  onReset,
}: {
  versions: LearningVersion[];
  onReset: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono font-bold">
          Learning Evolution ({versions.length} versions)
        </h2>
        <button
          onClick={onReset}
          className="text-xs px-3 py-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-mono"
        >
          Reset to Defaults
        </button>
      </div>

      {versions.length === 0 ? (
        <p className="text-center py-10 text-sm text-[var(--color-text-muted)]">
          No learning data yet. The engine creates its first version after 20+
          closed trades.
        </p>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => (
            <div
              key={v.version}
              className={`rounded-lg border p-4 ${
                v.is_active
                  ? "border-[var(--color-neon-blue)]/50 bg-[var(--color-neon-blue)]/5"
                  : "border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold">
                    v{v.version}
                  </span>
                  {v.is_active && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)]">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {v.created_at
                    ? new Date(v.created_at).toLocaleString()
                    : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono">
                <div>
                  <span className="text-[var(--color-text-muted)]">
                    Min Conf:
                  </span>{" "}
                  {(v.min_confidence * 100).toFixed(0)}%
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">
                    Min Score:
                  </span>{" "}
                  {v.min_composite_score}
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">
                    Confluence:
                  </span>{" "}
                  {v.min_confluence}
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">WR50:</span>{" "}
                  <span className={wrColor(v.rolling_win_rate_50 * 100)}>
                    {(v.rolling_win_rate_50 * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">
                    Trades:
                  </span>{" "}
                  {v.total_trades}
                </div>
              </div>
              {v.adjustments_log?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[var(--color-border-primary)]">
                  <p className="text-[10px] text-[var(--color-text-muted)] mb-1">
                    Adjustments:
                  </p>
                  {v.adjustments_log.map((a, i) => (
                    <p
                      key={i}
                      className="text-[10px] text-[var(--color-neon-cyan)]/80"
                    >
                      {a}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
