"use client";

import { useEffect, useState } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight, ArrowRightLeft, Loader2 } from "lucide-react";
import { useMarketStore, getMarketType } from "@/stores/market";
import { api } from "@/lib/api";
import { formatVolume, formatTime } from "@/lib/format";

interface BtcTransfer {
  tx_hash: string;
  block_height: number;
  value_btc: number;
  exchange: string | null;
  direction: string;
  timestamp: string;
}

interface EthTransfer {
  tx_hash: string;
  exchange: string;
  direction: string;
  value_eth: number;
  timestamp: string;
}

type Transfer = {
  tx_hash: string;
  value: number;
  unit: string;
  exchange: string | null;
  direction: string;
  timestamp: string;
};

function normalizeTransfers(
  chain: "bitcoin" | "ethereum",
  data: any,
): Transfer[] {
  if (chain === "bitcoin") {
    return (data.transfers ?? []).map((t: BtcTransfer) => ({
      tx_hash: t.tx_hash,
      value: t.value_btc,
      unit: "BTC",
      exchange: t.exchange,
      direction: t.direction,
      timestamp: t.timestamp,
    }));
  }
  // ETH whale-transfers returns a flat array
  const list = Array.isArray(data) ? data : data.transfers ?? [];
  return list.map((t: EthTransfer) => ({
    tx_hash: t.tx_hash,
    value: t.value_eth,
    unit: "ETH",
    exchange: t.exchange,
    direction: t.direction,
    timestamp: t.timestamp,
  }));
}

function directionIcon(dir: string) {
  if (dir.includes("inflow")) return <ArrowDownRight className="w-3.5 h-3.5 text-[var(--color-bear)]" />;
  if (dir.includes("outflow")) return <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-bull)]" />;
  return <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />;
}

function directionColor(dir: string) {
  if (dir.includes("inflow")) return "var(--color-bear)";
  if (dir.includes("outflow")) return "var(--color-bull)";
  return "var(--color-text-muted)";
}

function directionBg(dir: string) {
  if (dir.includes("inflow")) return "bg-[var(--color-bear)]/10";
  if (dir.includes("outflow")) return "bg-[var(--color-bull)]/10";
  return "bg-[var(--color-bg-hover)]";
}

export default function WhaleTracker() {
  const { activeSymbol } = useMarketStore();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  const marketType = getMarketType(activeSymbol);
  const isCrypto = marketType === "crypto";
  const isBtc = activeSymbol.toUpperCase().startsWith("BTC");

  useEffect(() => {
    if (!isCrypto) return;

    const load = async () => {
      setLoading(true);
      try {
        if (isBtc) {
          const data = await api.btcWhales(10, 20);
          setTransfers(normalizeTransfers("bitcoin", data));
        } else {
          const data = await api.ethWhales(50, 20);
          setTransfers(normalizeTransfers("ethereum", data));
        }
      } catch {
        setTransfers([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSymbol, isCrypto, isBtc]);

  if (!isCrypto) return null;

  const chainLabel = isBtc ? "Bitcoin" : "Ethereum";

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Wallet className="w-3.5 h-3.5 text-[var(--color-neon-orange, var(--color-neon-amber))]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          {chainLabel} Whale Tracker
        </h3>
        {!loading && transfers.length > 0 && (
          <span className="text-[10px] font-mono text-[var(--color-text-muted)] ml-auto">
            {transfers.length} txs
          </span>
        )}
      </div>

      <div className="divide-y divide-[var(--color-border-primary)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
            <span className="text-[12px] text-[var(--color-text-muted)]">
              Scanning {chainLabel.toLowerCase()} chain...
            </span>
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-4 text-sm text-[var(--color-text-muted)] text-center">
            No large transfers detected
          </div>
        ) : (
          transfers.slice(0, 10).map((tx, i) => (
            <div key={i} className="px-3 py-2 flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${directionBg(tx.direction)}`}>
                {directionIcon(tx.direction)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono font-medium text-[var(--color-text-primary)]">
                    {formatVolume(tx.value)} {tx.unit}
                  </span>
                  <span
                    className="text-[11px] font-mono uppercase"
                    style={{ color: directionColor(tx.direction) }}
                  >
                    {tx.direction.replace("_", " ")}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {tx.exchange ?? "Unknown"} &middot; {tx.tx_hash.slice(0, 10)}...
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
