"use client";

import { useEffect, useState } from "react";
import { Users, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatVolume } from "@/lib/format";

interface COTData {
  report_date: string;
  open_interest: number;
  managed_money: {
    long: number;
    short: number;
    net: number;
    change_long: number;
    change_short: number;
  };
  producers: {
    long: number;
    short: number;
    net: number;
  };
  swap_dealers: {
    long: number;
    short: number;
    net: number;
  };
  other_reportable: {
    long: number;
    short: number;
    net: number;
  };
  non_reportable: {
    long: number;
    short: number;
    net: number;
  };
  signals: string[];
  gold_signal: string;
}

function PositionBar({ long, short, label }: { long: number; short: number; label: string }) {
  const total = long + short;
  const longPct = total > 0 ? (long / total) * 100 : 50;
  const net = long - short;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-[var(--color-text-muted)]">{label}</span>
        <span
          className="text-[9px] font-mono font-bold"
          style={{ color: net > 0 ? "var(--color-bull)" : net < 0 ? "var(--color-bear)" : "var(--color-text-muted)" }}
        >
          {net > 0 ? "+" : ""}{formatVolume(net)}
        </span>
      </div>
      <div className="h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden flex">
        <div
          className="h-full bg-[var(--color-bull)] rounded-l-full"
          style={{ width: `${longPct}%` }}
        />
        <div
          className="h-full bg-[var(--color-bear)] rounded-r-full"
          style={{ width: `${100 - longPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[7px] font-mono text-[var(--color-text-muted)]">
        <span className="text-[var(--color-bull)]">L: {formatVolume(long)}</span>
        <span className="text-[var(--color-bear)]">S: {formatVolume(short)}</span>
      </div>
    </div>
  );
}

export default function COTReport() {
  const [data, setData] = useState<COTData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.cotGold();
        setData(result);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const signalColor =
    data?.gold_signal === "bullish"
      ? "var(--color-bull)"
      : data?.gold_signal === "bearish"
        ? "var(--color-bear)"
        : "var(--color-neon-amber)";

  return (
    <div className="card-glass rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-[var(--color-neon-purple)]" />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          COT Report — Gold
        </h3>
        {data?.report_date && (
          <span className="text-[8px] font-mono text-[var(--color-text-muted)] ml-auto">
            {data.report_date}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
            <span className="text-[10px] text-[var(--color-text-muted)]">Fetching CFTC data...</span>
          </div>
        ) : !data || data.open_interest === 0 ? (
          <div className="text-[10px] text-[var(--color-text-muted)] text-center py-6">
            COT data unavailable
          </div>
        ) : (
          <>
            {/* Open Interest */}
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-[var(--color-text-muted)]">Open Interest</span>
              <span className="font-mono font-bold text-[var(--color-text-primary)]">
                {data.open_interest.toLocaleString()} contracts
              </span>
            </div>

            {/* Managed Money — THE most important */}
            <div className="rounded-md bg-[var(--color-bg-secondary)] p-2 border border-[var(--color-border-primary)]">
              <div className="flex items-center gap-1.5 mb-1.5">
                {data.managed_money.net > 0 ? (
                  <TrendingUp className="w-3 h-3 text-[var(--color-bull)]" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-[var(--color-bear)]" />
                )}
                <span className="text-[9px] font-semibold text-[var(--color-text-primary)] uppercase">
                  Managed Money (Hedge Funds)
                </span>
              </div>
              <PositionBar
                long={data.managed_money.long}
                short={data.managed_money.short}
                label="Net Position"
              />
              {(data.managed_money.change_long !== 0 || data.managed_money.change_short !== 0) && (
                <div className="mt-1 flex gap-3 text-[8px] font-mono">
                  <span style={{ color: data.managed_money.change_long > 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
                    Longs: {data.managed_money.change_long > 0 ? "+" : ""}{data.managed_money.change_long.toLocaleString()}
                  </span>
                  <span style={{ color: data.managed_money.change_short < 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
                    Shorts: {data.managed_money.change_short > 0 ? "+" : ""}{data.managed_money.change_short.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Other categories */}
            <PositionBar
              long={data.producers.long}
              short={data.producers.short}
              label="Producers/Merchants"
            />
            <PositionBar
              long={data.other_reportable.long}
              short={data.other_reportable.short}
              label="Other Reportable"
            />
            <PositionBar
              long={data.non_reportable.long}
              short={data.non_reportable.short}
              label="Small Speculators"
            />

            {/* Signals */}
            {data.signals?.length > 0 && (
              <div className="border-t border-[var(--color-border-primary)] pt-1.5">
                {data.signals.map((sig, i) => (
                  <p key={i} className="text-[8px] leading-relaxed" style={{ color: signalColor }}>
                    {sig}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
