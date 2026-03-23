"use client";

import { memo, useState, useEffect } from "react";
import { Building2, Loader2, TrendingUp, TrendingDown } from "lucide-react";

interface CBData {
  country: string;
  tonnes: number;
  quarterly_change: number;
  rank: number;
}

function CentralBankGold() {
  const [data, setData] = useState<CBData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/v1/macro/gold/central-banks");
        if (!res.ok) throw new Error();
        const d = await res.json();
        if (!cancelled) setData(d.banks || []);
      } catch {
        // API not available yet
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="w-3.5 h-3.5 text-[var(--color-neon-amber)]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Central Bank Gold Holdings
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <p className="text-[9px] text-[var(--color-text-muted)] text-center py-4">
          Central bank data loading...
        </p>
      ) : (
        <div className="space-y-1">
          {data.slice(0, 10).map((bank, i) => (
            <div
              key={bank.country}
              className="flex items-center justify-between px-2 py-1.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[8px] text-[var(--color-text-muted)] w-4 text-right font-mono">
                  {i + 1}
                </span>
                <span className="text-[10px] font-semibold text-[var(--color-text-primary)] truncate">
                  {bank.country}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                  {bank.tonnes.toLocaleString()}t
                </span>
                {bank.quarterly_change !== 0 && (
                  <span className={`text-[9px] font-mono flex items-center gap-0.5 ${bank.quarterly_change > 0 ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}`}>
                    {bank.quarterly_change > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {bank.quarterly_change > 0 ? "+" : ""}{bank.quarterly_change}t
                  </span>
                )}
              </div>
            </div>
          ))}
          <p className="text-[7px] text-[var(--color-text-muted)] text-right mt-1">
            Source: World Gold Council (Q4 2024)
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(CentralBankGold);
