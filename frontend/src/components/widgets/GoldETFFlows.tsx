"use client";

import { memo, useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Loader2, BarChart3 } from "lucide-react";

interface ETFData {
  symbol: string;
  name: string;
  current_volume: number;
  avg_volume_5d: number;
  volume_change_pct: number;
  price: number;
  price_change_pct: number;
  flow_signal: string;
  daily_flows: { date: string; volume: number; change_pct: number }[];
}

function GoldETFFlows() {
  const [data, setData] = useState<ETFData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/v1/macro/gold/etf-flows");
        if (!res.ok) throw new Error();
        const d = await res.json();
        if (!cancelled) setData(d);
      } catch {
        // API not available yet — show placeholder
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30 * 60_000); // 30 min
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-[var(--color-neon-amber)]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Gold ETF Flows (GLD)
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-[9px] text-[var(--color-text-muted)] text-center py-4">
          ETF flow data loading...
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Price</p>
              <p className="text-xs font-mono font-semibold text-[var(--color-text-primary)]">
                ${data.price.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Change</p>
              <p className={`text-xs font-mono font-semibold ${data.price_change_pct >= 0 ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}`}>
                {data.price_change_pct >= 0 ? "+" : ""}{data.price_change_pct.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Flow</p>
              <div className="flex items-center gap-1">
                {data.flow_signal === "inflow" ? (
                  <TrendingUp className="w-3 h-3 text-[var(--color-bull)]" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-[var(--color-bear)]" />
                )}
                <span className={`text-[9px] font-bold uppercase ${data.flow_signal === "inflow" ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}`}>
                  {data.flow_signal}
                </span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[8px] text-[var(--color-text-muted)] uppercase mb-1">Volume vs 5D Avg</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (data.current_volume / Math.max(data.avg_volume_5d, 1)) * 100)}%`,
                    backgroundColor: data.volume_change_pct > 20 ? "var(--color-neon-amber)" : "var(--color-neon-blue)",
                  }}
                />
              </div>
              <span className={`text-[9px] font-mono ${data.volume_change_pct > 0 ? "text-[var(--color-neon-amber)]" : "text-[var(--color-text-muted)]"}`}>
                {data.volume_change_pct > 0 ? "+" : ""}{data.volume_change_pct.toFixed(0)}%
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(GoldETFFlows);
