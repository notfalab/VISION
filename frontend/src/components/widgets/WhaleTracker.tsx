"use client";

import { memo } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight, ArrowRightLeft, Loader2, AlertCircle } from "lucide-react";
import { useMarketStore, getMarketType } from "@/stores/market";
import { api } from "@/lib/api";
import { formatVolume } from "@/lib/format";
import { useApiData } from "@/hooks/useApiData";

type Transfer = {
  tx_hash: string;
  value: number;
  unit: string;
  exchange: string | null;
  direction: string;
  timestamp: string;
};

function directionIcon(dir: string) {
  if (dir.includes("inflow")) return <ArrowDownRight className="w-4 h-4 text-[var(--color-bear)]" />;
  if (dir.includes("outflow")) return <ArrowUpRight className="w-4 h-4 text-[var(--color-bull)]" />;
  return <ArrowRightLeft className="w-4 h-4 text-[var(--color-text-muted)]" />;
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

interface WhaleData {
  chainName: string;
  supported: boolean;
  transfers: Transfer[];
}

function WhaleTracker() {
  const { activeSymbol } = useMarketStore();

  const marketType = getMarketType(activeSymbol);
  const isCrypto = marketType === "crypto";
  const tokenName = activeSymbol.replace("USD", "");

  const { data, loading } = useApiData<WhaleData>(
    async () => {
      const result = await api.cryptoWhales(activeSymbol, 20);
      if (result) {
        return {
          chainName: result.chain_name || tokenName,
          supported: result.supported !== false,
          transfers: result.transfers ?? [],
        };
      }
      return { chainName: tokenName, supported: false, transfers: [] };
    },
    [activeSymbol, tokenName],
    { interval: 120_000, key: `whales:${activeSymbol}`, enabled: isCrypto },
  );

  const transfers = data?.transfers ?? [];
  const chainName = data?.chainName ?? tokenName;
  const supported = data?.supported ?? true;

  if (!isCrypto) return null;

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <Wallet className="w-4 h-4 text-[var(--color-neon-orange, var(--color-neon-amber))]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          {tokenName} Whale Tracker
        </h3>
        {!loading && transfers.length > 0 && (
          <span className="text-[12px] font-mono text-[var(--color-text-muted)] ml-auto">
            {transfers.length} txs
          </span>
        )}
      </div>

      <div className="divide-y divide-[var(--color-border-primary)]">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-6">
            <Loader2 className="w-4 h-4 text-[var(--color-text-muted)] animate-spin" />
            <span className="text-sm text-[var(--color-text-muted)]">
              Scanning {chainName || tokenName} chain...
            </span>
          </div>
        ) : !supported ? (
          <div className="p-4 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
            <span className="text-sm text-[var(--color-text-muted)]">
              {chainName} on-chain tracking coming soon
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
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono font-medium text-[var(--color-text-primary)]">
                    {formatVolume(tx.value)} {tx.unit}
                  </span>
                  <span
                    className="text-[13px] font-mono uppercase"
                    style={{ color: directionColor(tx.direction) }}
                  >
                    {tx.direction.replace("_", " ")}
                  </span>
                </div>
                <span className="text-[13px] text-[var(--color-text-muted)]">
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

export default memo(WhaleTracker);
