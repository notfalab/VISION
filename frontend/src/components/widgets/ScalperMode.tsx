"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Crosshair,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Brain,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  BookOpen,
  Zap,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

type Tab = "signals" | "journal" | "learning";

interface Signal {
  id?: number;
  symbol: string;
  timeframe: string;
  direction: string;
  status: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward_ratio: number;
  confidence: number;
  composite_score: number;
  ml_confidence?: number;
  regime_at_signal?: string;
  signal_reasons?: {
    bullish_indicators?: string[];
    bearish_indicators?: string[];
    confluence_count?: number;
    ml_agrees?: boolean;
    regime_compatible?: boolean;
    loss_filter_applied?: boolean;
  };
  mtf_confluence?: boolean;
  agreeing_timeframes?: string[];
  exit_price?: number;
  outcome_pnl?: number;
  outcome_pnl_pct?: number;
  loss_category?: string;
  loss_analysis?: {
    category: string;
    detail: string;
  };
  generated_at?: string;
  closed_at?: string;
}

interface JournalData {
  entries: Signal[];
  total: number;
  summary: { wins: number; losses: number; expired: number };
}

interface LossPattern {
  id: string;
  category: string;
  conditions: Record<string, string>;
  frequency: number;
  avg_loss_pct: number;
  recommendation: string;
  is_active: boolean;
}

interface LossData {
  patterns: LossPattern[];
  total_analyzed: number;
  total_losses: number;
  total_wins: number;
  win_rate: number;
  adjusted_win_rate: number;
  improvement: number;
  active_filters: number;
  loss_breakdown: Record<string, { count: number; percentage: number }>;
}

const TF_OPTIONS = ["5m", "15m", "30m"] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "rgba(100, 200, 255, 0.1)", text: "var(--color-neon-blue)", label: "PENDING" },
  active: { bg: "rgba(255, 200, 50, 0.1)", text: "var(--color-neon-amber)", label: "ACTIVE" },
  win: { bg: "rgba(0, 200, 100, 0.1)", text: "var(--color-bull)", label: "WIN" },
  loss: { bg: "rgba(255, 50, 80, 0.1)", text: "var(--color-bear)", label: "LOSS" },
  expired: { bg: "rgba(100, 100, 100, 0.1)", text: "var(--color-text-muted)", label: "EXPIRED" },
};

const LOSS_CATEGORY_ICONS: Record<string, string> = {
  false_breakout: "🔄",
  regime_mismatch: "🔀",
  low_confluence: "📉",
  overextended: "⚡",
  weak_volume: "📊",
  against_trend: "↕️",
  news_event: "📰",
  unknown: "❓",
};

export default function ScalperMode() {
  const { activeSymbol } = useMarketStore();
  const [tab, setTab] = useState<Tab>("signals");
  const [selectedTf, setSelectedTf] = useState("15m");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Signals tab state
  const [signals, setSignals] = useState<Signal[]>([]);
  const [scanResult, setScanResult] = useState<Signal[]>([]);

  // Journal tab state
  const [journal, setJournal] = useState<JournalData | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);

  // Loss learning tab state
  const [lossData, setLossData] = useState<LossData | null>(null);

  const loadSignals = useCallback(async () => {
    try {
      const data = await api.scalperSignals(activeSymbol, undefined, undefined, 20);
      setSignals(data.signals || []);
    } catch {
      // Silent — no signals yet
    }
  }, [activeSymbol]);

  const loadJournal = useCallback(async () => {
    try {
      const [j, a] = await Promise.allSettled([
        api.scalperJournal(activeSymbol),
        api.scalperAnalytics(activeSymbol),
      ]);
      if (j.status === "fulfilled") setJournal(j.value);
      if (a.status === "fulfilled") setAnalytics(a.value);
    } catch {}
  }, [activeSymbol]);

  const loadLossPatterns = useCallback(async () => {
    try {
      const data = await api.scalperLossPatterns(activeSymbol);
      setLossData(data);
    } catch {}
  }, [activeSymbol]);

  useEffect(() => {
    loadSignals();
  }, [loadSignals]);

  useEffect(() => {
    if (tab === "journal") loadJournal();
    if (tab === "learning") loadLossPatterns();
  }, [tab, loadJournal, loadLossPatterns]);

  // Auto-refresh signals every 60s
  useEffect(() => {
    const iv = setInterval(loadSignals, 60000);
    return () => clearInterval(iv);
  }, [loadSignals]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const data = await api.scalperScan(activeSymbol, selectedTf);
      const newSignals = data.signals || [];
      setScanResult(newSignals);

      if (newSignals.length > 0) {
        for (const sig of newSignals) {
          const dir = sig.direction === "long" ? "BUY" : "SELL";
          const emoji = sig.direction === "long" ? "🟢" : "🔴";
          toast.success(
            `${emoji} ${dir} ${sig.symbol} @ ${sig.entry_price.toLocaleString()} | ` +
            `SL ${sig.stop_loss.toLocaleString()} | TP ${sig.take_profit.toLocaleString()} | ` +
            `${(sig.confidence * 100).toFixed(0)}% conf`,
            { duration: 8000 }
          );
        }
      } else {
        toast.info("No signals found — conditions not met", { duration: 3000 });
      }
    } catch (e: any) {
      toast.error(e.message || "Scan failed", { duration: 4000 });
    } finally {
      setScanning(false);
    }
  };

  const handleScanAll = async () => {
    setScanning(true);
    try {
      const data = await api.scalperScanAll(activeSymbol);
      const newSignals = data.signals || [];
      setScanResult(newSignals);
      loadSignals();

      if (newSignals.length > 0) {
        for (const sig of newSignals) {
          const dir = sig.direction === "long" ? "BUY" : "SELL";
          const emoji = sig.direction === "long" ? "🟢" : "🔴";
          const mtf = sig.mtf_confluence ? " [MTF]" : "";
          toast.success(
            `${emoji} ${dir} ${sig.symbol} ${sig.timeframe}${mtf} @ ${sig.entry_price.toLocaleString()} | ` +
            `${(sig.confidence * 100).toFixed(0)}%`,
            { duration: 8000 }
          );
        }
        toast.info(`${data.timeframes_scanned.join(", ")} scanned — ${newSignals.length} signal(s)`, { duration: 4000 });
      } else {
        toast.info("No signals across all timeframes", { duration: 3000 });
      }
    } catch (e: any) {
      toast.error(e.message || "Multi-TF scan failed", { duration: 4000 });
    } finally {
      setScanning(false);
    }
  };

  const allSignals = [...scanResult, ...signals.filter(s => !scanResult.find(r => r.id === s.id))];

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Crosshair className="w-3.5 h-3.5 text-[var(--color-neon-cyan)]" />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Scalper Mode
        </h3>
        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded uppercase font-bold text-[var(--color-neon-cyan)]"
          style={{
            backgroundColor: "rgba(0, 200, 255, 0.1)",
            border: "1px solid rgba(0, 200, 255, 0.2)",
          }}>
          LIVE
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleScanAll}
            disabled={scanning}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase hover:bg-[var(--color-bg-hover)] transition-colors"
            style={{ color: "var(--color-neon-green)" }}
            title="Scan all timeframes"
          >
            <Zap className={`w-2.5 h-2.5 ${scanning ? "animate-pulse" : ""}`} />
            Scan All
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-border-primary)]">
        {([
          { key: "signals" as Tab, icon: Target, label: "Signals" },
          { key: "journal" as Tab, icon: BookOpen, label: "Journal" },
          { key: "learning" as Tab, icon: Brain, label: "Learning" },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[8px] font-semibold uppercase tracking-wider transition-colors ${
              tab === t.key
                ? "text-[var(--color-neon-cyan)] border-b border-[var(--color-neon-cyan)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <t.icon className="w-2.5 h-2.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-2.5">
        {tab === "signals" && (
          <SignalsTab
            signals={allSignals}
            selectedTf={selectedTf}
            setSelectedTf={setSelectedTf}
            onScan={handleScan}
            scanning={scanning}
          />
        )}
        {tab === "journal" && (
          <JournalTab journal={journal} analytics={analytics} />
        )}
        {tab === "learning" && (
          <LearningTab data={lossData} />
        )}
      </div>
    </div>
  );
}

/* ── Signals Tab ── */
function SignalsTab({
  signals,
  selectedTf,
  setSelectedTf,
  onScan,
  scanning,
}: {
  signals: Signal[];
  selectedTf: string;
  setSelectedTf: (tf: string) => void;
  onScan: () => void;
  scanning: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* TF selector + Scan button */}
      <div className="flex items-center gap-1.5">
        {TF_OPTIONS.map(tf => (
          <button
            key={tf}
            onClick={() => setSelectedTf(tf)}
            className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-colors ${
              selectedTf === tf
                ? "bg-[var(--color-neon-cyan)] text-black"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[var(--color-bg-hover)]"
            }`}
          >
            {tf}
          </button>
        ))}
        <button
          onClick={onScan}
          disabled={scanning}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold uppercase bg-[var(--color-bg-hover)] hover:bg-[var(--color-neon-cyan)] hover:text-black transition-all"
          style={{ color: scanning ? "var(--color-text-muted)" : "var(--color-neon-green)" }}
        >
          <RefreshCw className={`w-2.5 h-2.5 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning..." : "Scan"}
        </button>
      </div>

      {/* Signal cards */}
      {signals.length === 0 ? (
        <div className="text-center py-4">
          <Target className="w-6 h-6 mx-auto mb-1.5 text-[var(--color-text-muted)] opacity-40" />
          <p className="text-[9px] text-[var(--color-text-muted)]">
            No signals yet. Click Scan to analyze.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {signals.slice(0, 5).map((sig, i) => (
            <SignalCard key={sig.id || i} signal={sig} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const isLong = signal.direction === "long";
  const dirColor = isLong ? "var(--color-bull)" : "var(--color-bear)";
  const DirIcon = isLong ? TrendingUp : TrendingDown;
  const status = STATUS_STYLES[signal.status] || STATUS_STYLES.pending;
  const reasons = signal.signal_reasons || {};

  return (
    <div
      className="rounded-md border p-2 transition-colors"
      style={{
        borderColor: `color-mix(in srgb, ${dirColor} 30%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${dirColor} 5%, transparent)`,
      }}
    >
      {/* Direction + Status + Confidence */}
      <div className="flex items-center gap-1.5 mb-1">
        <DirIcon className="w-3 h-3" style={{ color: dirColor }} />
        <span className="text-[10px] font-bold uppercase" style={{ color: dirColor }}>
          {isLong ? "BUY" : "SELL"}
        </span>
        <span className="text-[7px] font-mono px-1 py-0.5 rounded uppercase"
          style={{
            color: status.text,
            backgroundColor: status.bg,
          }}>
          {status.label}
        </span>

        {signal.mtf_confluence && (
          <span className="text-[6px] font-mono px-1 py-0.5 rounded uppercase font-bold"
            style={{
              color: "var(--color-neon-green)",
              backgroundColor: "rgba(0, 200, 100, 0.1)",
              border: "1px solid rgba(0, 200, 100, 0.2)",
            }}>
            MTF
          </span>
        )}

        <span className="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">
          {signal.timeframe}
        </span>

        <span className="ml-auto text-[11px] font-bold font-mono" style={{ color: dirColor }}>
          {(signal.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Entry / SL / TP */}
      <div className="grid grid-cols-3 gap-1 mb-1">
        <div className="text-center">
          <div className="text-[6px] text-[var(--color-text-muted)] uppercase">Entry</div>
          <div className="text-[9px] font-mono font-bold text-[var(--color-text-primary)]">
            {signal.entry_price.toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[6px] text-[var(--color-bear)] uppercase flex items-center justify-center gap-0.5">
            <Shield className="w-2 h-2" /> SL
          </div>
          <div className="text-[9px] font-mono font-bold text-[var(--color-bear)]">
            {signal.stop_loss.toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[6px] text-[var(--color-bull)] uppercase flex items-center justify-center gap-0.5">
            <Target className="w-2 h-2" /> TP
          </div>
          <div className="text-[9px] font-mono font-bold text-[var(--color-bull)]">
            {signal.take_profit.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Risk/Reward + Reasons */}
      <div className="flex items-center gap-1 text-[7px] text-[var(--color-text-muted)]">
        <span>R:R {signal.risk_reward_ratio}</span>
        <span>•</span>
        <span>Score {signal.composite_score}</span>
        {reasons.confluence_count && (
          <>
            <span>•</span>
            <span>{reasons.confluence_count} confluences</span>
          </>
        )}
        {reasons.loss_filter_applied && (
          <>
            <span>•</span>
            <span className="text-[var(--color-neon-amber)]">filtered</span>
          </>
        )}
      </div>

      {/* PnL for completed signals */}
      {signal.outcome_pnl != null && (
        <div className="mt-1 pt-1 border-t border-[var(--color-border-primary)] flex items-center gap-1">
          <span
            className="text-[9px] font-mono font-bold"
            style={{ color: signal.outcome_pnl >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
          >
            {signal.outcome_pnl >= 0 ? "+" : ""}{signal.outcome_pnl.toFixed(2)}
            ({signal.outcome_pnl_pct?.toFixed(3)}%)
          </span>
          {signal.loss_category && (
            <span className="ml-auto text-[7px] text-[var(--color-neon-amber)]">
              {LOSS_CATEGORY_ICONS[signal.loss_category] || "❓"} {signal.loss_category.replace(/_/g, " ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Journal Tab ── */
function JournalTab({ journal, analytics }: { journal: JournalData | null; analytics: any }) {
  if (!journal && !analytics) {
    return (
      <div className="text-center py-4">
        <BookOpen className="w-6 h-6 mx-auto mb-1.5 text-[var(--color-text-muted)] opacity-40" />
        <p className="text-[9px] text-[var(--color-text-muted)]">
          No completed signals yet. Scan to generate signals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Stats summary */}
      {analytics && (
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: "Win Rate", value: `${analytics.win_rate || 0}%`, color: analytics.win_rate > 50 ? "var(--color-bull)" : "var(--color-bear)" },
            { label: "Total", value: analytics.completed || 0, color: "var(--color-text-primary)" },
            { label: "P&L", value: analytics.total_pnl?.toFixed(1) || "0", color: (analytics.total_pnl || 0) >= 0 ? "var(--color-bull)" : "var(--color-bear)" },
            { label: "Profit F.", value: analytics.profit_factor === Infinity ? "∞" : analytics.profit_factor?.toFixed(1) || "—", color: "var(--color-neon-cyan)" },
          ].map(s => (
            <div key={s.label} className="text-center rounded-md bg-[var(--color-bg-secondary)] p-1.5 border border-[var(--color-border-primary)]">
              <div className="text-[6px] text-[var(--color-text-muted)] uppercase">{s.label}</div>
              <div className="text-[11px] font-bold font-mono" style={{ color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Per-timeframe breakdown */}
      {analytics?.by_timeframe && Object.keys(analytics.by_timeframe).length > 0 && (
        <div className="flex gap-1">
          {Object.entries(analytics.by_timeframe).map(([tf, stats]: [string, any]) => (
            <div key={tf} className="flex-1 rounded-md bg-[var(--color-bg-hover)] p-1.5 text-center">
              <div className="text-[7px] font-bold text-[var(--color-text-muted)] uppercase">{tf}</div>
              <div className="text-[9px] font-mono" style={{ color: stats.win_rate > 50 ? "var(--color-bull)" : "var(--color-bear)" }}>
                {stats.win_rate}% ({stats.wins}W/{stats.losses}L)
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Journal entries */}
      {journal?.entries && journal.entries.length > 0 && (
        <div className="space-y-1">
          {journal.entries.slice(0, 8).map((entry, i) => {
            const isWin = entry.status === "win";
            const isLoss = entry.status === "loss";
            const statusColor = isWin ? "var(--color-bull)" : isLoss ? "var(--color-bear)" : "var(--color-text-muted)";
            const StatusIcon = isWin ? CheckCircle2 : isLoss ? XCircle : Clock;

            return (
              <div key={i} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                <StatusIcon className="w-3 h-3 shrink-0" style={{ color: statusColor }} />
                <span className="text-[8px] font-bold uppercase" style={{ color: entry.direction === "long" ? "var(--color-bull)" : "var(--color-bear)" }}>
                  {entry.direction === "long" ? "BUY" : "SELL"}
                </span>
                <span className="text-[7px] font-mono text-[var(--color-text-muted)]">{entry.timeframe}</span>
                <span className="text-[8px] font-mono text-[var(--color-text-secondary)]">
                  @{entry.entry_price.toLocaleString()}
                </span>
                <ChevronRight className="w-2 h-2 text-[var(--color-text-muted)]" />
                <span className="text-[8px] font-mono" style={{ color: statusColor }}>
                  {entry.exit_price ? `@${entry.exit_price.toLocaleString()}` : entry.status}
                </span>
                {entry.outcome_pnl != null && (
                  <span className="ml-auto text-[8px] font-mono font-bold" style={{ color: statusColor }}>
                    {entry.outcome_pnl >= 0 ? "+" : ""}{entry.outcome_pnl.toFixed(1)}
                  </span>
                )}
                {entry.loss_category && (
                  <span className="text-[6px]">
                    {LOSS_CATEGORY_ICONS[entry.loss_category]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Loss Learning Tab ── */
function LearningTab({ data }: { data: LossData | null }) {
  if (!data || data.total_analyzed === 0) {
    return (
      <div className="text-center py-4">
        <Brain className="w-6 h-6 mx-auto mb-1.5 text-[var(--color-text-muted)] opacity-40" />
        <p className="text-[9px] text-[var(--color-text-muted)]">
          Loss learning activates after enough completed signals.
        </p>
        <p className="text-[8px] text-[var(--color-text-muted)] mt-1">
          The engine will analyze losses and build adaptive filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Win rate comparison */}
      <div className="rounded-md bg-[var(--color-bg-secondary)] p-2 border border-[var(--color-border-primary)]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] text-[var(--color-text-muted)] uppercase font-semibold">Win Rate Impact</span>
          <span className="text-[7px] font-mono text-[var(--color-neon-green)]">
            {data.active_filters} filter{data.active_filters !== 1 ? "s" : ""} active
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-center flex-1">
            <div className="text-[6px] text-[var(--color-text-muted)] uppercase">Current</div>
            <div className="text-[13px] font-bold font-mono" style={{
              color: data.win_rate > 50 ? "var(--color-bull)" : "var(--color-bear)",
            }}>
              {data.win_rate}%
            </div>
          </div>
          <ChevronRight className="w-3 h-3 text-[var(--color-neon-green)]" />
          <div className="text-center flex-1">
            <div className="text-[6px] text-[var(--color-text-muted)] uppercase">With Filters</div>
            <div className="text-[13px] font-bold font-mono text-[var(--color-neon-green)]">
              {data.adjusted_win_rate}%
            </div>
          </div>
          {data.improvement > 0 && (
            <div className="text-center">
              <div className="text-[6px] text-[var(--color-text-muted)] uppercase">Improvement</div>
              <div className="text-[11px] font-bold font-mono text-[var(--color-neon-green)]">
                +{data.improvement}%
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loss breakdown */}
      {Object.keys(data.loss_breakdown).length > 0 && (
        <div>
          <div className="text-[8px] text-[var(--color-text-muted)] uppercase font-semibold mb-1 flex items-center gap-1">
            <BarChart3 className="w-2.5 h-2.5" />
            Loss Breakdown
          </div>
          <div className="space-y-0.5">
            {Object.entries(data.loss_breakdown)
              .sort(([, a]: any, [, b]: any) => b.count - a.count)
              .map(([cat, stats]: [string, any]) => (
                <div key={cat} className="flex items-center gap-1">
                  <span className="text-[8px] w-3 text-center">{LOSS_CATEGORY_ICONS[cat]}</span>
                  <span className="text-[7px] font-mono w-20 truncate text-[var(--color-text-muted)]">
                    {cat.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--color-bear)]"
                      style={{ width: `${stats.percentage}%`, opacity: 0.7 }}
                    />
                  </div>
                  <span className="text-[7px] font-mono w-6 text-right text-[var(--color-bear)]">
                    {stats.count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Active patterns */}
      {data.patterns.length > 0 && (
        <div>
          <div className="text-[8px] text-[var(--color-text-muted)] uppercase font-semibold mb-1 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5 text-[var(--color-neon-amber)]" />
            Active Loss Patterns
          </div>
          <div className="space-y-1">
            {data.patterns.map(p => (
              <div
                key={p.id}
                className="rounded-md p-1.5 border"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-neon-amber) 30%, transparent)",
                  backgroundColor: "color-mix(in srgb, var(--color-neon-amber) 5%, transparent)",
                }}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[8px]">{LOSS_CATEGORY_ICONS[p.category]}</span>
                  <span className="text-[8px] font-bold uppercase text-[var(--color-neon-amber)]">
                    {p.category.replace(/_/g, " ")}
                  </span>
                  <span className="ml-auto text-[7px] font-mono text-[var(--color-bear)]">
                    {p.frequency}x in last {data.total_analyzed}
                  </span>
                </div>
                <p className="text-[7px] text-[var(--color-text-secondary)] leading-relaxed">
                  {p.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats footer */}
      <div className="flex items-center gap-1 text-[7px] text-[var(--color-text-muted)]">
        <Brain className="w-2.5 h-2.5" />
        <span>Analyzed {data.total_analyzed} signals • {data.total_losses} losses studied</span>
      </div>
    </div>
  );
}
