"use client";

import { useEffect, useState } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatVolume } from "@/lib/format";

interface Transfer {
  tx_hash: string;
  exchange: string;
  direction: string;
  value_eth: number;
  timestamp: string;
}

export default function WhaleTracker() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          "/api/v1/institutional/whale-transfers?min_value_eth=100"
        );
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setTransfers(data.slice(0, 10));
      } catch {
        setTransfers([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Wallet className="w-3.5 h-3.5 text-[var(--color-neon-amber)]" />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Whale Tracker
        </h3>
      </div>

      <div className="divide-y divide-[var(--color-border-primary)]">
        {loading ? (
          <div className="p-4 text-xs text-[var(--color-text-muted)] text-center animate-pulse">
            Scanning on-chain...
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-4 text-xs text-[var(--color-text-muted)] text-center">
            No large transfers detected
          </div>
        ) : (
          transfers.map((tx, i) => (
            <div key={i} className="px-3 py-2 flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  tx.direction === "inflow"
                    ? "bg-[var(--color-bear)]/10"
                    : "bg-[var(--color-bull)]/10"
                }`}
              >
                {tx.direction === "inflow" ? (
                  <ArrowDownRight className="w-3 h-3 text-[var(--color-bear)]" />
                ) : (
                  <ArrowUpRight className="w-3 h-3 text-[var(--color-bull)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-medium text-[var(--color-text-primary)]">
                    {formatVolume(tx.value_eth)} ETH
                  </span>
                  <span
                    className={`text-[9px] font-mono uppercase ${
                      tx.direction === "inflow"
                        ? "text-[var(--color-bear)]"
                        : "text-[var(--color-bull)]"
                    }`}
                  >
                    {tx.direction}
                  </span>
                </div>
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {tx.exchange} &middot; {tx.tx_hash.slice(0, 10)}...
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
