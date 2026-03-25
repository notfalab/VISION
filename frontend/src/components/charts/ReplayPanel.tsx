"use client";

import { Play, Pause, SkipForward, X, TrendingUp, TrendingDown } from "lucide-react";

export interface ReplayTrade {
  type: "buy" | "sell";
  entryPrice: number;
  entryIndex: number;
  exitPrice?: number;
  exitIndex?: number;
  pnl?: number;
}

interface ReplayPanelProps {
  replayIndex: number;
  maxIndex: number;
  speed: number;
  playing: boolean;
  trades: ReplayTrade[];
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
  onStepForward: () => void;
  onBuy: () => void;
  onSell: () => void;
  onClosePosition: () => void;
  onExit: () => void;
  hasOpenPosition: boolean;
  currentPrice: number;
}

const SPEEDS = [1, 2, 5, 10];

export default function ReplayPanel({
  replayIndex, maxIndex, speed, playing, trades,
  onPlay, onPause, onSpeedChange, onStepForward,
  onBuy, onSell, onClosePosition, onExit,
  hasOpenPosition, currentPrice,
}: ReplayPanelProps) {
  const closedTrades = trades.filter(t => t.exitPrice !== undefined);
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const avgRR = closedTrades.length > 0
    ? closedTrades.reduce((s, t) => s + Math.abs(t.pnl || 0), 0) / closedTrades.length
    : 0;

  const progress = maxIndex > 0 ? (replayIndex / maxIndex) * 100 : 0;

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/95 backdrop-blur-sm shadow-xl">
      {/* Controls */}
      <div className="flex items-center gap-1">
        {playing ? (
          <button onClick={onPause} className="p-1.5 rounded hover:bg-white/5 text-[var(--color-neon-amber)]">
            <Pause className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={onPlay} className="p-1.5 rounded hover:bg-white/5 text-[var(--color-neon-green)]">
            <Play className="w-4 h-4" />
          </button>
        )}
        <button onClick={onStepForward} className="p-1.5 rounded hover:bg-white/5 text-[var(--color-text-secondary)]">
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-0.5">
        {SPEEDS.map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-1.5 py-0.5 text-[9px] font-mono rounded ${
              speed === s
                ? "bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 min-w-[100px]">
        <div className="flex-1 h-1 rounded-full bg-[var(--color-bg-primary)] overflow-hidden">
          <div className="h-full bg-[var(--color-neon-blue)] rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[9px] font-mono text-[var(--color-text-muted)] tabular-nums">
          {replayIndex}/{maxIndex}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-border-primary)]" />

      {/* Trade buttons */}
      {hasOpenPosition ? (
        <button onClick={onClosePosition} className="px-2 py-1 text-[9px] font-bold rounded bg-[var(--color-neon-amber)]/15 text-[var(--color-neon-amber)] border border-[var(--color-neon-amber)]/30">
          CLOSE @ {currentPrice.toFixed(2)}
        </button>
      ) : (
        <>
          <button onClick={onBuy} className="px-2 py-1 text-[9px] font-bold rounded bg-[var(--color-bull)]/15 text-[var(--color-bull)] border border-[var(--color-bull)]/30 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> BUY
          </button>
          <button onClick={onSell} className="px-2 py-1 text-[9px] font-bold rounded bg-[var(--color-bear)]/15 text-[var(--color-bear)] border border-[var(--color-bear)]/30 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> SELL
          </button>
        </>
      )}

      {/* Stats */}
      <div className="w-px h-6 bg-[var(--color-border-primary)]" />
      <div className="flex items-center gap-3 text-[9px] font-mono">
        <span className="text-[var(--color-text-muted)]">
          {closedTrades.length} <span className="opacity-60">trades</span>
        </span>
        <span className={totalPnl >= 0 ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}>
          {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} <span className="opacity-60">pips</span>
        </span>
        <span className={winRate >= 50 ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}>
          {winRate.toFixed(0)}% <span className="opacity-60">win</span>
        </span>
      </div>

      {/* Exit */}
      <button onClick={onExit} className="p-1 rounded hover:bg-white/5 text-[var(--color-text-muted)]">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
