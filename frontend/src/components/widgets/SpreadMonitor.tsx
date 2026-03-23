"use client";

import { useState, useEffect } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { useMarketStore } from "@/stores/market";

interface SpreadData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  avg_spread: number;
  is_wide: boolean;
  history: { t: number; s: number }[];
}

export default function SpreadMonitor() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const [data, setData] = useState<SpreadData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchSpread = async () => {
      try {
        const res = await fetch(`/api/v1/prices/${activeSymbol}/spread`);
        if (!res.ok) throw new Error();
        const d = await res.json();
        if (!cancelled) { setData(d); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    fetchSpread();
    const interval = setInterval(fetchSpread, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeSymbol]);

  // Mini sparkline SVG
  const sparkline = data?.history && data.history.length > 2 ? (() => {
    const vals = data.history.map((h) => h.s);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 120;
    const h = 24;
    const points = vals
      .map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`)
      .join(" ");
    return (
      <svg width={w} height={h} className="opacity-60">
        <polyline
          points={points}
          fill="none"
          stroke={data.is_wide ? "var(--color-bear)" : "var(--color-neon-cyan)"}
          strokeWidth="1.5"
        />
      </svg>
    );
  })() : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[var(--color-neon-cyan)]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Spread Monitor
          </span>
        </div>
        {data && (
          <span
            className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
              data.is_wide
                ? "bg-[var(--color-bear)]/15 text-[var(--color-bear)]"
                : "bg-[var(--color-neon-green)]/15 text-[var(--color-neon-green)]"
            }`}
          >
            {data.is_wide ? "WIDE" : "NORMAL"}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)]">
          <AlertTriangle className="w-3 h-3" />
          <span>Spread data unavailable</span>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Bid</p>
              <p className="text-xs font-mono font-semibold text-[var(--color-neon-green)]">
                {data.bid.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Ask</p>
              <p className="text-xs font-mono font-semibold text-[var(--color-bear)]">
                {data.ask.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Spread</p>
              <p className={`text-xs font-mono font-semibold ${data.is_wide ? "text-[var(--color-bear)]" : "text-[var(--color-text-primary)]"}`}>
                {data.spread.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[8px] text-[var(--color-text-muted)]">
              Avg: {data.avg_spread.toFixed(2)}
            </span>
            {sparkline}
          </div>
        </>
      )}
    </div>
  );
}
