"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Plus, X } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { formatPrice, formatChange, priceColor } from "@/lib/format";
import { VALID_SYMBOLS } from "@/lib/symbols";

const ALL_SYMBOLS = Array.from(VALID_SYMBOLS).sort();

interface WatchlistItem {
  symbol: string;
  price: number;
  change: number;
  loading: boolean;
}

export default function Watchlist() {
  const watchlist = useMarketStore((s) => s.watchlist);
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const setActiveSymbol = useMarketStore((s) => s.setActiveSymbol);
  const addToWatchlist = useMarketStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useMarketStore((s) => s.removeFromWatchlist);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  const available = ALL_SYMBOLS.filter(
    (s) => !watchlist.includes(s) && s.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    const loadPrices = async () => {
      const settled = await Promise.allSettled(
        watchlist.map(async (symbol): Promise<WatchlistItem> => {
          try {
            const data = await api.prices(symbol, "1d", 2);
            if (data.length >= 2) {
              const latest = data[0];
              const prev = data[1];
              const change = ((latest.close - prev.close) / prev.close) * 100;
              return { symbol, price: latest.close, change, loading: false };
            } else if (data.length === 1) {
              return { symbol, price: data[0].close, change: 0, loading: false };
            }
            return { symbol, price: 0, change: 0, loading: false };
          } catch {
            return { symbol, price: 0, change: 0, loading: false };
          }
        })
      );
      setItems(
        settled
          .filter((r): r is PromiseFulfilledResult<WatchlistItem> => r.status === "fulfilled")
          .map((r) => r.value)
      );
    };
    loadPrices();
    const interval = setInterval(loadPrices, 30000);
    return () => clearInterval(interval);
  }, [watchlist]);

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Watchlist
        </h3>
        <button
          onClick={() => { setShowAdd(!showAdd); setSearch(""); }}
          className={`p-1 rounded transition-colors ${
            showAdd ? "bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)]" : "hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
          }`}
          title="Add symbol"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {showAdd && (
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbols..."
            className="w-full px-2 py-1 text-xs font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded outline-none focus:border-[var(--color-neon-blue)] text-[var(--color-text-primary)]"
            autoFocus
          />
          <div className="max-h-32 overflow-y-auto mt-1">
            {available.slice(0, 10).map((sym) => (
              <button
                key={sym}
                onClick={() => { addToWatchlist(sym); setSearch(""); setShowAdd(false); }}
                className="w-full text-left px-2 py-1.5 text-xs font-mono hover:bg-[var(--color-bg-hover)] rounded text-[var(--color-text-secondary)]"
              >
                {sym}
              </button>
            ))}
            {available.length === 0 && (
              <p className="text-[10px] text-[var(--color-text-muted)] px-2 py-1">No results</p>
            )}
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--color-border-primary)]">
        {items.map((item) => (
          <div
            key={item.symbol}
            className={`
              group flex items-center justify-between px-3 py-2 transition-all duration-150
              hover:bg-[var(--color-bg-hover)] cursor-pointer
              ${item.symbol === activeSymbol ? "bg-[var(--color-neon-blue)]/5 border-l-2 border-[var(--color-neon-blue)]" : "border-l-2 border-transparent"}
            `}
            onClick={() => setActiveSymbol(item.symbol)}
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
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-xs font-mono text-[var(--color-text-primary)]">
                  {item.price > 0 ? formatPrice(item.price, item.symbol) : "—"}
                </div>
                <div className={`text-[10px] font-mono ${priceColor(item.change)}`}>
                  {item.price > 0 ? formatChange(item.change) : ""}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.symbol); }}
                className="p-0.5 rounded hover:bg-[var(--color-bg-hover)] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <X className="w-3 h-3 text-[var(--color-text-muted)]" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
