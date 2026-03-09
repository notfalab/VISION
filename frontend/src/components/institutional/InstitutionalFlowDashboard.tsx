"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  RefreshCw,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronRight,
  Waves,
  Fish,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import Header from "@/components/layout/Header";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";

// ── Types ──

interface SymbolSummary {
  symbol: string;
  heat_score: number | null;
  heat_label: string | null;
  divergence_score: number | null;
  divergence_signal: string | null;
  institutional_bias: string | null;
  retail_bias: string | null;
}

interface FlowData {
  delta: number;
  delta_pct: number;
  imbalance_ratio: number;
  total_bid_volume: number;
  total_ask_volume: number;
  spread: number;
  signal: string;
  signal_strength: number;
  buy_walls: { price: number; quantity: number; strength: string }[];
  sell_walls: { price: number; quantity: number; strength: string }[];
  absorption: { type: string; description: string; strength: string }[];
  depth_imbalances: { level: number; bid_qty: number; ask_qty: number; delta: number }[];
}

interface WhaleTransfer {
  tx_hash?: string;
  value: number;
  unit: string;
  exchange?: string;
  direction?: string;
  timestamp: string;
  chain?: string;
}

interface CotData {
  date: string;
  net_commercial: number;
  net_noncommercial: number;
  open_interest: number;
}

// ── Helpers ──

function getFlowSignalColor(signal: string): string {
  if (signal.includes("strong_buy")) return "#10b981";
  if (signal.includes("buy")) return "#34d399";
  if (signal.includes("strong_sell")) return "#ef4444";
  if (signal.includes("sell")) return "#f87171";
  return "#6b7280";
}

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return v.toFixed(0);
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Delta Bar Component ──

function DeltaBar({ bidPct, askPct, size = "md" }: { bidPct: number; askPct: number; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-1.5" : "h-2.5";
  return (
    <div className={`flex ${h} rounded-full overflow-hidden bg-[var(--color-bg-hover)]`}>
      <div
        className="bg-[var(--color-bull)] transition-all duration-500"
        style={{ width: `${bidPct}%` }}
      />
      <div
        className="bg-red-500 transition-all duration-500"
        style={{ width: `${askPct}%` }}
      />
    </div>
  );
}

// ── Flow Scanner Row ──

function FlowScannerRow({
  symbol,
  flow,
  expanded,
  onToggle,
}: {
  symbol: string;
  flow: FlowData | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!flow) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 text-xs">
        <span className="font-bold text-[var(--color-text-primary)] w-20">{symbol}</span>
        <span className="text-[var(--color-text-muted)] text-[10px]">Loading...</span>
      </div>
    );
  }

  const total = flow.total_bid_volume + flow.total_ask_volume;
  const bidPct = total > 0 ? (flow.total_bid_volume / total) * 100 : 50;
  const askPct = 100 - bidPct;
  const signalColor = getFlowSignalColor(flow.signal);

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--color-bg-hover)] transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
        )}
        <span className="text-xs font-bold text-[var(--color-text-primary)] w-20 flex-shrink-0">
          {symbol}
        </span>
        <div className="flex-1 min-w-[100px]">
          <DeltaBar bidPct={bidPct} askPct={askPct} />
        </div>
        <span
          className="text-[10px] font-mono font-bold flex-shrink-0 w-14 text-right"
          style={{ color: flow.delta_pct > 0 ? "#10b981" : flow.delta_pct < 0 ? "#ef4444" : "#6b7280" }}
        >
          {flow.delta_pct > 0 ? "+" : ""}
          {flow.delta_pct.toFixed(1)}%
        </span>
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: signalColor }}
          title={flow.signal.replace(/_/g, " ")}
        />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 ml-6 border-l border-[var(--color-border-primary)]">
          <div className="grid grid-cols-3 gap-2 mb-2 text-[10px]">
            <div>
              <span className="text-[var(--color-text-muted)]">Imbalance</span>
              <div className="font-mono font-bold text-[var(--color-text-primary)]">
                {flow.imbalance_ratio.toFixed(2)}x
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Strength</span>
              <div className="font-mono font-bold text-[var(--color-text-primary)]">
                {(flow.signal_strength * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Spread</span>
              <div className="font-mono font-bold text-[var(--color-text-primary)]">
                {flow.spread.toFixed(flow.spread < 1 ? 5 : 2)}
              </div>
            </div>
          </div>

          {/* Buy/Sell walls */}
          {(flow.buy_walls?.length > 0 || flow.sell_walls?.length > 0) && (
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Walls Detected
              </div>
              <div className="space-y-0.5">
                {flow.buy_walls?.slice(0, 3).map((w, i) => (
                  <div key={`b${i}`} className="flex items-center gap-2 text-[10px]">
                    <span className="text-[var(--color-bull)]">BID</span>
                    <span className="font-mono text-[var(--color-text-secondary)]">
                      {w.price.toFixed(2)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{formatVolume(w.quantity)}</span>
                  </div>
                ))}
                {flow.sell_walls?.slice(0, 3).map((w, i) => (
                  <div key={`s${i}`} className="flex items-center gap-2 text-[10px]">
                    <span className="text-red-500">ASK</span>
                    <span className="font-mono text-[var(--color-text-secondary)]">
                      {w.price.toFixed(2)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{formatVolume(w.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Absorption */}
          {flow.absorption?.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Absorption
              </div>
              {flow.absorption.slice(0, 2).map((a, i) => (
                <div key={i} className="text-[10px] text-[var(--color-neon-amber)]">
                  {a.description}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Whale Feed Item ──

function WhaleItem({ t, symbol }: { t: WhaleTransfer; symbol: string }) {
  const isInflow = t.direction === "inflow";
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-bg-hover)] transition-colors">
      <div
        className={`p-1 rounded ${isInflow ? "bg-red-500/10" : "bg-[var(--color-bull)]/10"}`}
      >
        {isInflow ? (
          <ArrowDownRight className="w-3 h-3 text-red-500" />
        ) : (
          <ArrowUpRight className="w-3 h-3 text-[var(--color-bull)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-[var(--color-text-primary)]">
          {symbol} — {formatVolume(t.value)} {t.unit}
        </div>
        <div className="text-[9px] text-[var(--color-text-muted)] truncate">
          {t.exchange ? `${isInflow ? "→" : "←"} ${t.exchange}` : t.chain || "on-chain"}
        </div>
      </div>
      <span className="text-[9px] text-[var(--color-text-muted)] flex-shrink-0">
        {timeAgo(t.timestamp)}
      </span>
    </div>
  );
}

// ── Main Component ──

const FLOW_SYMBOLS = [
  "XAUUSD", "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD",
  "USDJPY", "SOLUSD", "AUDUSD", "XRPUSD", "NAS100",
];

const WHALE_CRYPTOS = ["BTCUSD", "ETHUSD", "SOLUSD"];

export default function InstitutionalFlowDashboard() {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [flowData, setFlowData] = useState<Record<string, FlowData | null>>({});
  const [whaleTransfers, setWhaleTransfers] = useState<{ symbol: string; transfers: WhaleTransfer[] }[]>([]);
  const [cotData, setCotData] = useState<CotData[]>([]);

  // ── Institutional summary ──
  const { data: instData, loading: instLoading, refresh: instRefresh } = useApiData<{
    symbols: SymbolSummary[];
    count: number;
  }>(
    () => api.institutionalSummary(FLOW_SYMBOLS.join(",")),
    [],
    { interval: 60_000, key: "inst-flow-all" },
  );

  const symbols = instData?.symbols ?? [];

  // ── Fetch order flow for all symbols ──
  useEffect(() => {
    let cancelled = false;

    async function loadFlows() {
      const results: Record<string, FlowData | null> = {};
      // Load in small batches to avoid overwhelming
      for (let i = 0; i < FLOW_SYMBOLS.length; i += 3) {
        if (cancelled) break;
        const batch = FLOW_SYMBOLS.slice(i, i + 3);
        const promises = batch.map(async (sym) => {
          try {
            const data = await api.orderFlow(sym);
            return { sym, data };
          } catch {
            return { sym, data: null };
          }
        });
        const batchResults = await Promise.all(promises);
        for (const { sym, data } of batchResults) {
          results[sym] = data;
        }
        if (!cancelled) setFlowData((prev) => ({ ...prev, ...results }));
      }
    }

    loadFlows();
    const interval = setInterval(loadFlows, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ── Fetch whale data ──
  useEffect(() => {
    let cancelled = false;
    async function loadWhales() {
      const results: { symbol: string; transfers: WhaleTransfer[] }[] = [];
      for (const sym of WHALE_CRYPTOS) {
        try {
          const data = await api.cryptoWhales(sym, 10);
          if (data?.transfers?.length) {
            results.push({ symbol: sym, transfers: data.transfers });
          }
        } catch {}
      }
      if (!cancelled) setWhaleTransfers(results);
    }
    loadWhales();
    const interval = setInterval(loadWhales, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ── Fetch COT data for gold ──
  useEffect(() => {
    async function loadCOT() {
      try {
        const data = await api.cotReport("XAUUSD", 12);
        if (data?.reports) setCotData(data.reports.slice(0, 12).reverse());
      } catch {}
    }
    loadCOT();
  }, []);

  // ── Sorted by flow delta ──
  const sortedFlowSymbols = useMemo(() => {
    return [...FLOW_SYMBOLS].sort((a, b) => {
      const fa = flowData[a];
      const fb = flowData[b];
      return Math.abs(fb?.delta_pct ?? 0) - Math.abs(fa?.delta_pct ?? 0);
    });
  }, [flowData]);

  // ── Heat score chart data ──
  const heatChartData = useMemo(() => {
    return symbols
      .filter((s) => s.heat_score != null && s.heat_score > 0)
      .sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0))
      .map((s) => ({
        symbol: s.symbol,
        score: s.heat_score ?? 0,
        fill:
          (s.heat_score ?? 0) >= 70
            ? "#10b981"
            : (s.heat_score ?? 0) >= 40
            ? "#f59e0b"
            : "#6b7280",
      }));
  }, [symbols]);

  // ── All whale transfers merged and sorted ──
  const allWhales = useMemo(() => {
    const all: (WhaleTransfer & { symbol: string })[] = [];
    for (const { symbol, transfers } of whaleTransfers) {
      for (const t of transfers) {
        all.push({ ...t, symbol });
      }
    }
    return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
  }, [whaleTransfers]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* ── Title ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-neon-purple)]/10">
              <Building2 className="w-5 h-5 text-[var(--color-neon-purple)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--color-text-primary)]">
                Institutional Flow
              </h1>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                Order flow scanner • Heat scores • Whale tracking • COT positioning
              </p>
            </div>
          </div>
          <button
            onClick={instRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors border border-[var(--color-border-primary)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${instLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Market Pulse Header ── */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {FLOW_SYMBOLS.slice(0, 8).map((sym) => {
            const flow = flowData[sym];
            const inst = symbols.find((s) => s.symbol === sym);
            const total = (flow?.total_bid_volume ?? 0) + (flow?.total_ask_volume ?? 0);
            const bidPct = total > 0 ? ((flow?.total_bid_volume ?? 0) / total) * 100 : 50;

            return (
              <div
                key={sym}
                className="flex-shrink-0 px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg min-w-[140px]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-[var(--color-text-primary)]">{sym}</span>
                  {inst?.heat_score != null && inst.heat_score > 0 && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color:
                          inst.heat_score >= 70
                            ? "#10b981"
                            : inst.heat_score >= 40
                            ? "#f59e0b"
                            : "#6b7280",
                        backgroundColor:
                          inst.heat_score >= 70
                            ? "rgba(16,185,129,0.1)"
                            : inst.heat_score >= 40
                            ? "rgba(245,158,11,0.1)"
                            : "rgba(107,114,128,0.1)",
                      }}
                    >
                      {inst.heat_score}
                    </span>
                  )}
                </div>
                <DeltaBar bidPct={bidPct} askPct={100 - bidPct} size="sm" />
                <div className="flex justify-between mt-1 text-[9px] font-mono text-[var(--color-text-muted)]">
                  <span className="text-[var(--color-bull)]">
                    {bidPct.toFixed(0)}%
                  </span>
                  <span className="text-red-500">
                    {(100 - bidPct).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 3-Column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* ── Col 1: Order Flow Scanner ── */}
          <div className="lg:col-span-5 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-primary)]">
              <Waves className="w-4 h-4 text-[var(--color-neon-cyan)]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Order Flow Scanner
              </span>
              <span className="text-[9px] text-[var(--color-text-muted)] ml-auto">
                Sorted by |Delta|
              </span>
            </div>
            <div className="divide-y divide-[var(--color-border-primary)] max-h-[600px] overflow-y-auto">
              {sortedFlowSymbols.map((sym) => (
                <FlowScannerRow
                  key={sym}
                  symbol={sym}
                  flow={flowData[sym] ?? null}
                  expanded={expandedSymbol === sym}
                  onToggle={() => setExpandedSymbol(expandedSymbol === sym ? null : sym)}
                />
              ))}
            </div>
          </div>

          {/* ── Col 2: Heat Scores + COT ── */}
          <div className="lg:col-span-4 space-y-5">
            {/* Heat Score Leaderboard */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-primary)]">
                <Flame className="w-4 h-4 text-[var(--color-neon-amber)]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Heat Scores
                </span>
              </div>
              <div className="p-3">
                {heatChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(heatChartData.length * 32, 100)}>
                    <BarChart data={heatChartData} layout="vertical" margin={{ left: 0, right: 10 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis
                        type="category"
                        dataKey="symbol"
                        width={60}
                        tick={{ fontSize: 10, fill: "var(--color-text-muted)", fontFamily: "JetBrains Mono" }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-bg-secondary)",
                          border: "1px solid var(--color-border-primary)",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        formatter={(v: unknown) => [`${Number(v) || 0}/100`, "Heat Score"]}
                      />
                      <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={14}>
                        {heatChartData.map((d, i) => (
                          <Cell key={i} fill={d.fill} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-6 text-[10px] text-[var(--color-text-muted)]">
                    Awaiting heat score data...
                  </div>
                )}
              </div>
            </div>

            {/* Institutional Bias Grid */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-primary)]">
                <Activity className="w-4 h-4 text-[var(--color-neon-cyan)]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Institutional Bias
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {symbols.map((s) => {
                  const isBullish = s.institutional_bias?.includes("bullish");
                  const isBearish = s.institutional_bias?.includes("bearish");
                  return (
                    <div
                      key={s.symbol}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                        isBullish
                          ? "border-[var(--color-bull)]/30 bg-[var(--color-bull)]/5"
                          : isBearish
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-[var(--color-border-primary)] bg-[var(--color-bg-card)]"
                      }`}
                    >
                      {isBullish ? (
                        <TrendingUp className="w-3.5 h-3.5 text-[var(--color-bull)] flex-shrink-0" />
                      ) : isBearish ? (
                        <TrendingDown className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-[var(--color-text-primary)]">{s.symbol}</div>
                        <div className="text-[9px] text-[var(--color-text-muted)] capitalize truncate">
                          {s.institutional_bias?.replace(/_/g, " ") ?? "neutral"}
                        </div>
                      </div>
                      {s.divergence_signal && !s.divergence_signal.includes("neutral") && (
                        <AlertTriangle className="w-3 h-3 text-[var(--color-neon-amber)] flex-shrink-0 ml-auto" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* COT Gold */}
            {cotData.length > 0 && (
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-primary)]">
                  <BarChart3 className="w-4 h-4 text-[var(--color-neon-amber)]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    XAUUSD COT Positioning
                  </span>
                </div>
                <div className="p-3">
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={cotData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-primary)" />
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-bg-secondary)",
                          border: "1px solid var(--color-border-primary)",
                          borderRadius: 8,
                          fontSize: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="net_noncommercial"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.15}
                        strokeWidth={1.5}
                        name="Net Non-Commercial"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex justify-between text-[9px] text-[var(--color-text-muted)] mt-1">
                    <span>Managed Money Net Position</span>
                    <span>12 weeks</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Col 3: Whale Activity ── */}
          <div className="lg:col-span-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-primary)]">
              <Fish className="w-4 h-4 text-[var(--color-neon-blue)]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Whale Activity
              </span>
              <span className="text-[9px] text-[var(--color-text-muted)] ml-auto">
                {allWhales.length} transfers
              </span>
            </div>
            <div className="divide-y divide-[var(--color-border-primary)] max-h-[600px] overflow-y-auto">
              {allWhales.length > 0 ? (
                allWhales.map((t, i) => (
                  <WhaleItem key={`${t.tx_hash ?? i}-${t.timestamp}`} t={t} symbol={t.symbol} />
                ))
              ) : (
                <div className="text-center py-8 text-[10px] text-[var(--color-text-muted)]">
                  <Fish className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  Loading whale data...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
