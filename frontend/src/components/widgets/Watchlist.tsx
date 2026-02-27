"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { formatPrice, formatChange, priceColor } from "@/lib/format";

interface WatchlistItem {
  symbol: string;
  price: number;
  change: number;
  loading: boolean;
}

export default function Watchlist() {
  const { watchlist, activeSymbol, setActiveSymbol } = useMarketStore();
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    const loadPrices = async () => {
      const results: WatchlistItem[] = [];
      for (const symbol of watchlist) {
        try {
          const data = await api.prices(symbol, "1d", 2);
          if (data.length >= 2) {
            const latest = data[0];
            const prev = data[1];
            const change = ((latest.close - prev.close) / prev.close) * 100;
            results.push({ symbol, price: latest.close, change, loading: false });
          } else if (data.length === 1) {
            results.push({ symbol, price: data[0].close, change: 0, loading: false });
          } else {
            results.push({ symbol, price: 0, change: 0, loading: false });
          }
        } catch {
          results.push({ symbol, price: 0, change: 0, loading: false });
        }
      }
      setItems(results);
    };
    loadPrices();
    const interval = setInterval(loadPrices, 30000);
    return () => clearInterval(interval);
  }, [watchlist]);

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)]">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Watchlist
        </h3>
      </div>
      <div className="divide-y divide-[var(--color-border-primary)]">
        {items.map((item) => (
          <button
            key={item.symbol}
            onClick={() => setActiveSymbol(item.symbol)}
            className={`
              w-full flex items-center justify-between px-3 py-2 transition-all duration-150
              hover:bg-[var(--color-bg-hover)]
              ${item.symbol === activeSymbol ? "bg-[var(--color-neon-blue)]/5 border-l-2 border-[var(--color-neon-blue)]" : "border-l-2 border-transparent"}
            `}
          >
            <div className="flex items-center gap-2">
              {item.change > 0 ? (
                <TrendingUp className="w-3 h-3 text-[var(--color-bull)]" />
              ) : item.change < 0 ? (
                <TrendingDown className="w-3 h-3 text-[var(--color-bear)]" />
              ) : (
                <Minus className="w-3 h-3 text-[var(--color-text-muted)]" />
              )}
              <span className="text-xs font-mono font-medium text-[var(--color-text-primary)]">
                {item.symbol}
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-[var(--color-text-primary)]">
                {item.price > 0 ? formatPrice(item.price, item.symbol) : "—"}
              </div>
              <div className={`text-[10px] font-mono ${priceColor(item.change)}`}>
                {item.price > 0 ? formatChange(item.change) : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
