"use client";

import { useState } from "react";
import { Calculator, X, RotateCcw } from "lucide-react";

interface RiskCalcPanelProps {
  entry: number | null;
  sl: number | null;
  tp: number | null;
  step: number; // 0=waiting entry, 1=waiting SL, 2=waiting TP, 3=complete
  onReset: () => void;
  onClose: () => void;
}

export default function RiskCalcPanel({ entry, sl, tp, step, onReset, onClose }: RiskCalcPanelProps) {
  const [accountSize, setAccountSize] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);

  // Gold: 1 standard lot = 100 oz, 1 pip = $0.01, pip value = $1 per pip per lot
  // But for XAUUSD, movement is measured in dollars: $1 move = 100 pips
  const pipValue = 0.01; // $0.01 per pip

  const slDistance = entry && sl ? Math.abs(entry - sl) : 0;
  const tpDistance = entry && tp ? Math.abs(entry - tp) : 0;
  const slPips = slDistance / pipValue;
  const tpPips = tpDistance / pipValue;
  const riskUSD = accountSize * (riskPct / 100);
  const lotSize = slPips > 0 ? riskUSD / (slPips * 1) : 0; // $1 per pip per lot for gold
  const rrRatio = slDistance > 0 && tpDistance > 0 ? tpDistance / slDistance : 0;
  const marginRequired = entry ? lotSize * entry * 100 * 0.01 : 0; // ~1% margin for gold

  const steps = ["Click ENTRY", "Click STOP LOSS", "Click TAKE PROFIT", "Complete"];
  const stepColors = ["var(--color-neon-blue)", "var(--color-bear)", "var(--color-bull)", "var(--color-neon-green)"];

  return (
    <div className="absolute top-2 right-2 z-50 w-56 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/95 backdrop-blur-sm shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5 text-[var(--color-neon-blue)]" />
          <span className="text-[10px] font-bold text-[var(--color-text-primary)] uppercase tracking-wider">Risk Calc</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onReset} className="p-0.5 rounded hover:bg-white/5 text-[var(--color-text-muted)]">
            <RotateCcw className="w-3 h-3" />
          </button>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-white/5 text-[var(--color-text-muted)]">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={i} className={`flex-1 h-0.5 rounded-full ${i <= step ? "bg-[var(--color-neon-blue)]" : "bg-[var(--color-bg-primary)]"}`} />
          ))}
        </div>
        <p className="text-[9px] font-mono" style={{ color: stepColors[Math.min(step, 3)] }}>
          {steps[Math.min(step, 3)]}
        </p>

        {/* Account inputs */}
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[8px] text-[var(--color-text-muted)] uppercase">Account $</label>
            <input
              type="number"
              value={accountSize}
              onChange={e => setAccountSize(Number(e.target.value))}
              className="w-full px-1.5 py-1 text-[10px] font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] outline-none"
            />
          </div>
          <div>
            <label className="text-[8px] text-[var(--color-text-muted)] uppercase">Risk %</label>
            <input
              type="number"
              value={riskPct}
              onChange={e => setRiskPct(Number(e.target.value))}
              step={0.5}
              min={0.1}
              max={10}
              className="w-full px-1.5 py-1 text-[10px] font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] outline-none"
            />
          </div>
        </div>

        {/* Price levels */}
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] font-mono">
            <span className="text-[var(--color-neon-blue)]">Entry</span>
            <span className="text-[var(--color-text-primary)]">{entry?.toFixed(2) || "—"}</span>
          </div>
          <div className="flex justify-between text-[9px] font-mono">
            <span className="text-[var(--color-bear)]">Stop Loss</span>
            <span className="text-[var(--color-text-primary)]">{sl?.toFixed(2) || "—"}</span>
          </div>
          <div className="flex justify-between text-[9px] font-mono">
            <span className="text-[var(--color-bull)]">Take Profit</span>
            <span className="text-[var(--color-text-primary)]">{tp?.toFixed(2) || "—"}</span>
          </div>
        </div>

        {/* Computed values */}
        {entry && sl && (
          <div className="border-t border-[var(--color-border-primary)] pt-2 space-y-1">
            <div className="flex justify-between text-[9px] font-mono">
              <span className="text-[var(--color-text-muted)]">SL Distance</span>
              <span className="text-[var(--color-bear)]">{slDistance.toFixed(2)} ({slPips.toFixed(0)} pips)</span>
            </div>
            {tp && (
              <div className="flex justify-between text-[9px] font-mono">
                <span className="text-[var(--color-text-muted)]">TP Distance</span>
                <span className="text-[var(--color-bull)]">{tpDistance.toFixed(2)} ({tpPips.toFixed(0)} pips)</span>
              </div>
            )}
            <div className="flex justify-between text-[9px] font-mono">
              <span className="text-[var(--color-text-muted)]">Risk USD</span>
              <span className="text-[var(--color-neon-amber)]">${riskUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[9px] font-mono font-bold">
              <span className="text-[var(--color-text-muted)]">Lot Size</span>
              <span className="text-[var(--color-text-primary)]">{lotSize.toFixed(2)}</span>
            </div>
            {rrRatio > 0 && (
              <div className="flex justify-between text-[9px] font-mono font-bold">
                <span className="text-[var(--color-text-muted)]">R:R Ratio</span>
                <span className={rrRatio >= 2 ? "text-[var(--color-bull)]" : rrRatio >= 1 ? "text-[var(--color-neon-amber)]" : "text-[var(--color-bear)]"}>
                  1:{rrRatio.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
