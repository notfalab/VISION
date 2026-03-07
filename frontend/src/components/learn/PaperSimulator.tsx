"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  RefreshCw,
  X,
  GraduationCap,
  Trophy,
  Target,
  Clock,
} from "lucide-react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import { useAcademyStore, type PaperTrade } from "@/stores/academy";
import { api } from "@/lib/api";

/* ── Constants ── */

const SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD",
  "ETHUSD", "AUDUSD", "USDCAD", "NAS100", "SPX500",
];

const POSITION_SIZES: Record<string, number[]> = {
  EURUSD: [10_000, 50_000, 100_000],
  GBPUSD: [10_000, 50_000, 100_000],
  USDJPY: [10_000, 50_000, 100_000],
  XAUUSD: [1, 5, 10],
  BTCUSD: [0.01, 0.1, 1],
  ETHUSD: [0.1, 1, 10],
  AUDUSD: [10_000, 50_000, 100_000],
  USDCAD: [10_000, 50_000, 100_000],
  NAS100: [1, 5, 10],
  SPX500: [1, 5, 10],
};

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/* ── Mini Candlestick Chart ── */

function SimChart({ symbol, data }: { symbol: string; data: CandleData[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const lows = data.map((d) => d.low);
    const highs = data.map((d) => d.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = max - min || 1;

    const candleW = Math.max(1, (W - 8) / data.length - 1);
    const gap = 1;

    data.forEach((candle, i) => {
      const x = 4 + i * (candleW + gap);
      const isUp = candle.close >= candle.open;

      const wickX = x + candleW / 2;
      const wickTop = H - ((candle.high - min) / range) * (H - 8) - 4;
      const wickBot = H - ((candle.low - min) / range) * (H - 8) - 4;
      ctx.strokeStyle = isUp ? "rgba(16, 185, 129, 0.5)" : "rgba(239, 68, 68, 0.5)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(wickX, wickTop);
      ctx.lineTo(wickX, wickBot);
      ctx.stroke();

      const bodyTop = H - ((Math.max(candle.open, candle.close) - min) / range) * (H - 8) - 4;
      const bodyBot = H - ((Math.min(candle.open, candle.close) - min) / range) * (H - 8) - 4;
      const bodyH = Math.max(bodyBot - bodyTop, 1);
      ctx.fillStyle = isUp ? "rgba(16, 185, 129, 0.8)" : "rgba(239, 68, 68, 0.7)";
      ctx.fillRect(x, bodyTop, candleW, bodyH);
    });
  }, [data]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

/* ── Format helpers ── */

function formatPrice(price: number, symbol: string): string {
  if (symbol.includes("JPY")) return price.toFixed(3);
  if (symbol.includes("BTC") || symbol.includes("XAU") || symbol.includes("NAS") || symbol.includes("SPX"))
    return price.toFixed(2);
  return price.toFixed(5);
}

function formatPnL(pnl: number): string {
  return `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
}

/* ── Main Component ── */

export default function PaperSimulator() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [data, setData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sizeIdx, setSizeIdx] = useState(1);

  const { balance, trades, openTrade, closeTrade, resetPaperTrading, earnBadge, addXp } =
    useAcademyStore();

  const currentPrice = useMemo(() => {
    if (data.length === 0) return null;
    return data[data.length - 1].close;
  }, [data]);

  const prevPrice = useMemo(() => {
    if (data.length < 2) return null;
    return data[data.length - 2].close;
  }, [data]);

  const changePct = currentPrice && prevPrice
    ? ((currentPrice - prevPrice) / prevPrice) * 100
    : 0;

  const openPositions = trades.filter((t) => !t.closedAt);
  const closedTrades = trades.filter((t) => t.closedAt).slice(-20).reverse();
  const totalClosedTrades = trades.filter((t) => t.closedAt).length;

  // Fetch prices
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.prices(symbol, "1h", 100).then((d: CandleData[]) => {
      if (cancelled) return;
      setData(d ?? []);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [symbol]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      api.prices(symbol, "1h", 100).then((d: CandleData[]) => {
        if (d) setData(d);
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Check badge for 10 trades
  useEffect(() => {
    if (totalClosedTrades >= 10) earnBadge("trader");
  }, [totalClosedTrades, earnBadge]);

  const sizes = POSITION_SIZES[symbol] || [1, 10, 100];
  const currentSize = sizes[sizeIdx] ?? sizes[0];

  const handleTrade = useCallback(
    (direction: "long" | "short") => {
      if (!currentPrice) return;
      openTrade({
        symbol,
        direction,
        entryPrice: currentPrice,
        size: currentSize,
        openedAt: Date.now(),
      });
    },
    [symbol, currentPrice, currentSize, openTrade],
  );

  const handleClose = useCallback(
    (id: string) => {
      if (!currentPrice) return;
      closeTrade(id, currentPrice);
      addXp(10);
    },
    [currentPrice, closeTrade, addXp],
  );

  const winRate = useMemo(() => {
    const closed = trades.filter((t) => t.closedAt && t.pnl !== null);
    if (closed.length === 0) return 0;
    const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
    return Math.round((wins / closed.length) * 100);
  }, [trades]);

  const totalPnl = useMemo(() => {
    return trades
      .filter((t) => t.closedAt && t.pnl !== null)
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  }, [trades]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex flex-col">
      <Header />

      {/* Top bar */}
      <div className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
          <Link
            href="/learn"
            className="flex items-center gap-1.5 text-[12px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-neon-cyan)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Academy
          </Link>
          <div className="h-4 w-px bg-[var(--color-border-primary)]" />
          <div className="flex items-center gap-1.5">
            <Target className="w-4 h-4 text-[var(--color-neon-green)]" />
            <span className="text-[12px] font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
              Paper Trading Simulator
            </span>
          </div>
          <div className="flex-1" />
          <span className="text-[11px] font-mono text-[var(--color-neon-amber)]">
            Virtual Balance: ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── Left: Chart + Controls ── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Symbol selector + price */}
            <div className="card-glass rounded-lg p-3">
              <div className="flex items-center gap-3 mb-3">
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="bg-[var(--color-bg-secondary)] text-[13px] font-bold font-mono text-[var(--color-text-primary)] px-2 py-1 rounded border border-[var(--color-border-primary)] outline-none"
                >
                  {SYMBOLS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                {currentPrice && (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-[var(--color-text-primary)]">
                      {formatPrice(currentPrice, symbol)}
                    </span>
                    <span
                      className="text-[12px] font-mono font-semibold"
                      style={{ color: changePct >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
                    >
                      {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                    </span>
                  </div>
                )}

                <div className="flex-1" />

                {/* Position size selector */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)]">Size:</span>
                  {sizes.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setSizeIdx(i)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                        sizeIdx === i
                          ? "bg-[var(--color-neon-cyan)]/20 text-[var(--color-neon-cyan)]"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {s >= 1000 ? `${s / 1000}K` : s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="h-64 relative">
                {loading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-[var(--color-neon-cyan)] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : data.length < 2 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--color-text-muted)]">
                    No data available
                  </div>
                ) : (
                  <SimChart symbol={symbol} data={data} />
                )}
              </div>

              {/* Trade buttons */}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  onClick={() => handleTrade("long")}
                  disabled={!currentPrice}
                  className="flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-bold font-mono uppercase transition-all hover:brightness-110 disabled:opacity-50"
                  style={{
                    color: "white",
                    background: "linear-gradient(135deg, #10b981, #059669)",
                  }}
                >
                  <TrendingUp className="w-5 h-5" />
                  Go Long
                </button>
                <button
                  onClick={() => handleTrade("short")}
                  disabled={!currentPrice}
                  className="flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-bold font-mono uppercase transition-all hover:brightness-110 disabled:opacity-50"
                  style={{
                    color: "white",
                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  }}
                >
                  <TrendingDown className="w-5 h-5" />
                  Go Short
                </button>
              </div>
            </div>

            {/* Open Positions */}
            {openPositions.length > 0 && (
              <div className="card-glass rounded-lg p-3">
                <h3 className="text-[12px] font-bold font-mono text-[var(--color-text-primary)] uppercase tracking-wider mb-2">
                  Open Positions ({openPositions.length})
                </h3>
                <div className="space-y-2">
                  {openPositions.map((trade) => {
                    const unrealizedPnl = currentPrice
                      ? trade.direction === "long"
                        ? (currentPrice - trade.entryPrice) * trade.size
                        : (trade.entryPrice - currentPrice) * trade.size
                      : 0;
                    return (
                      <div
                        key={trade.id}
                        className="flex items-center gap-3 p-2 rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]"
                      >
                        <span
                          className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                          style={{
                            color: trade.direction === "long" ? "var(--color-bull)" : "var(--color-bear)",
                            backgroundColor:
                              trade.direction === "long"
                                ? "color-mix(in srgb, var(--color-bull) 15%, transparent)"
                                : "color-mix(in srgb, var(--color-bear) 15%, transparent)",
                          }}
                        >
                          {trade.direction.toUpperCase()}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-[var(--color-text-primary)]">
                          {trade.symbol}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                          @{formatPrice(trade.entryPrice, trade.symbol)}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                          x{trade.size >= 1000 ? `${trade.size / 1000}K` : trade.size}
                        </span>
                        <div className="flex-1" />
                        <span
                          className="text-[11px] font-mono font-bold"
                          style={{ color: unrealizedPnl >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
                        >
                          {formatPnL(unrealizedPnl)}
                        </span>
                        <button
                          onClick={() => handleClose(trade.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold font-mono bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Stats + Trade History ── */}
          <div className="space-y-4">
            {/* Stats */}
            <div className="card-glass rounded-lg p-3">
              <h3 className="text-[12px] font-bold font-mono text-[var(--color-text-primary)] uppercase tracking-wider mb-3">
                Performance
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md p-2 text-center bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                  <div className="text-[14px] font-bold font-mono text-[var(--color-neon-amber)]">
                    ${balance.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-muted)] uppercase">Balance</div>
                </div>
                <div className="rounded-md p-2 text-center bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                  <div
                    className="text-[14px] font-bold font-mono"
                    style={{ color: totalPnl >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
                  >
                    {formatPnL(totalPnl)}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-muted)] uppercase">Total P&L</div>
                </div>
                <div className="rounded-md p-2 text-center bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                  <div className="text-[14px] font-bold font-mono text-[var(--color-neon-cyan)]">
                    {totalClosedTrades}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-muted)] uppercase">Trades</div>
                </div>
                <div className="rounded-md p-2 text-center bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                  <div
                    className="text-[14px] font-bold font-mono"
                    style={{ color: winRate >= 50 ? "var(--color-bull)" : "var(--color-bear)" }}
                  >
                    {winRate}%
                  </div>
                  <div className="text-[9px] text-[var(--color-text-muted)] uppercase">Win Rate</div>
                </div>
              </div>

              <button
                onClick={resetPaperTrading}
                className="w-full mt-3 flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-mono font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reset Account
              </button>
            </div>

            {/* Trade History */}
            <div className="card-glass rounded-lg p-3">
              <h3 className="text-[12px] font-bold font-mono text-[var(--color-text-primary)] uppercase tracking-wider mb-2">
                Trade History
              </h3>
              {closedTrades.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-[var(--color-text-muted)]">
                  No trades yet. Open a position to start!
                </div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {closedTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center gap-2 p-1.5 rounded text-[10px] font-mono border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]"
                    >
                      <span
                        style={{
                          color: trade.direction === "long" ? "var(--color-bull)" : "var(--color-bear)",
                        }}
                        className="font-bold"
                      >
                        {trade.direction === "long" ? "L" : "S"}
                      </span>
                      <span className="font-bold text-[var(--color-text-primary)]">{trade.symbol}</span>
                      <div className="flex-1" />
                      <span
                        className="font-bold"
                        style={{ color: (trade.pnl ?? 0) >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
                      >
                        {formatPnL(trade.pnl ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="card-glass rounded-lg p-3">
              <h3 className="text-[12px] font-bold font-mono text-[var(--color-neon-amber)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" />
                Trading Tips
              </h3>
              <ul className="space-y-1.5 text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                <li>• Never risk more than 2% of your balance per trade</li>
                <li>• Always have a plan before entering a position</li>
                <li>• Follow the trend — don't fight the market</li>
                <li>• Cut losses quickly, let winners run</li>
                <li>• Complete 10 trades to earn the Trader badge</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
