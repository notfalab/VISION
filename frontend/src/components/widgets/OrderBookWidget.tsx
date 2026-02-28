"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/stores/market";
import { formatPrice, formatVolume } from "@/lib/format";

interface Level {
  price: number;
  quantity: number;
  total: number;
}

export default function OrderBookWidget() {
  const { activeSymbol } = useMarketStore();
  const [bids, setBids] = useState<Level[]>([]);
  const [asks, setAsks] = useState<Level[]>([]);
  const [spread, setSpread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/v1/prices/${activeSymbol}/orderbook?depth=15`
        );
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        // Build cumulative totals
        let bidTotal = 0;
        const bidLevels = (data.bids || []).map((b: any) => {
          bidTotal += b.quantity;
          return { price: b.price, quantity: b.quantity, total: bidTotal };
        });

        let askTotal = 0;
        const askLevels = (data.asks || []).map((a: any) => {
          askTotal += a.quantity;
          return { price: a.price, quantity: a.quantity, total: askTotal };
        });

        setBids(bidLevels);
        setAsks(askLevels);

        if (bidLevels.length > 0 && askLevels.length > 0) {
          setSpread(askLevels[0].price - bidLevels[0].price);
        }
      } catch {
        setBids([]);
        setAsks([]);
        setSpread(0);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [activeSymbol]);

  const maxTotal = Math.max(
    bids.length > 0 ? bids[bids.length - 1].total : 0,
    asks.length > 0 ? asks[asks.length - 1].total : 0,
    1
  );

  return (
    <div className="card-glass rounded-lg overflow-hidden flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Order Book
        </h3>
        <span className="text-sm font-mono text-[var(--color-neon-amber)]">
          Spread: {formatPrice(spread, activeSymbol)}
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-[var(--color-text-muted)] animate-pulse">Loading...</span>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Column headers */}
          <div className="flex items-center px-2 py-1 text-[13px] font-mono text-[var(--color-text-muted)] border-b border-[var(--color-border-primary)]">
            <span className="flex-1">Price</span>
            <span className="w-16 text-right">Size</span>
            <span className="w-16 text-right">Total</span>
          </div>

          {/* Asks (reversed so lowest ask is at bottom) */}
          <div className="flex-1 overflow-y-auto">
            {[...asks].reverse().map((level, i) => (
              <div key={`a${i}`} className="flex items-center px-2 py-0.5 relative">
                <div
                  className="absolute inset-0 bg-[var(--color-bear)]/5"
                  style={{ width: `${(level.total / maxTotal) * 100}%`, right: 0, left: "auto" }}
                />
                <span className="flex-1 text-sm font-mono text-[var(--color-bear)] relative z-10">
                  {formatPrice(level.price, activeSymbol)}
                </span>
                <span className="w-16 text-right text-sm font-mono text-[var(--color-text-secondary)] relative z-10">
                  {level.quantity.toFixed(4)}
                </span>
                <span className="w-16 text-right text-sm font-mono text-[var(--color-text-muted)] relative z-10">
                  {level.total.toFixed(4)}
                </span>
              </div>
            ))}
          </div>

          {/* Spread divider */}
          <div className="px-2 py-1 text-center border-y border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <span className="text-sm font-mono text-[var(--color-neon-cyan)]">
              {formatPrice(bids[0]?.price || 0, activeSymbol)}
            </span>
          </div>

          {/* Bids */}
          <div className="flex-1 overflow-y-auto">
            {bids.map((level, i) => (
              <div key={`b${i}`} className="flex items-center px-2 py-0.5 relative">
                <div
                  className="absolute inset-0 bg-[var(--color-bull)]/5"
                  style={{ width: `${(level.total / maxTotal) * 100}%`, right: 0, left: "auto" }}
                />
                <span className="flex-1 text-sm font-mono text-[var(--color-bull)] relative z-10">
                  {formatPrice(level.price, activeSymbol)}
                </span>
                <span className="w-16 text-right text-sm font-mono text-[var(--color-text-secondary)] relative z-10">
                  {level.quantity.toFixed(4)}
                </span>
                <span className="w-16 text-right text-sm font-mono text-[var(--color-text-muted)] relative z-10">
                  {level.total.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
