"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Map as MapIcon, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import Header from "@/components/layout/Header";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";

type MarketTab = "all" | "forex" | "crypto" | "commodity" | "index";

interface Tile {
  symbol: string;
  name: string;
  market_type: string;
  group: string;
  price: number;
  change_pct: number;
  volume: number;
  high: number;
  low: number;
  timestamp: string;
  is_major: boolean;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol.includes("JPY")) return price.toFixed(3);
  if (symbol.startsWith("BTC") || symbol.startsWith("XAU")) return price.toFixed(2);
  if (symbol.startsWith("ETH") || symbol.startsWith("SOL") || symbol.startsWith("XRP")) return price.toFixed(2);
  if (symbol === "NAS100" || symbol === "SPX500") return price.toFixed(1);
  return price.toFixed(5);
}

export default function GlobalHeatMap() {
  const router = useRouter();
  const [tab, setTab] = useState<MarketTab>("all");

  const { data, loading, refresh } = useApiData<{ tiles: Tile[]; count: number }>(
    () => api.marketOverview(),
    [],
    { interval: 30_000, key: "heatmap" },
  );

  const tiles = useMemo(() => {
    if (!data?.tiles) return [];
    let filtered = data.tiles;
    if (tab !== "all") {
      filtered = filtered.filter((t) => t.market_type === tab);
    }
    // Sort: majors first, then by absolute change
    return filtered.sort((a, b) => {
      if (a.is_major !== b.is_major) return a.is_major ? -1 : 1;
      return Math.abs(b.change_pct) - Math.abs(a.change_pct);
    });
  }, [data, tab]);

  const groups = useMemo(() => {
    const map = new Map<string, Tile[]>();
    for (const t of tiles) {
      const arr = map.get(t.group) || [];
      arr.push(t);
      map.set(t.group, arr);
    }
    return map;
  }, [tiles]);

  const TABS: { id: MarketTab; label: string }[] = [
    { id: "all", label: "All Markets" },
    { id: "forex", label: "Forex" },
    { id: "crypto", label: "Crypto" },
    { id: "commodity", label: "Commodities" },
    { id: "index", label: "Indices" },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* Page title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <MapIcon className="w-6 h-6 text-[var(--color-neon-amber)]" />
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Market Heat Map</h1>
            <span className="text-xs text-[var(--color-text-muted)]">
              {data?.count ?? 0} instruments
            </span>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 p-1 bg-[var(--color-bg-secondary)] rounded-lg w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all ${
                tab === t.id
                  ? "bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && !data && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[var(--color-neon-blue)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Tile grid grouped */}
        {[...groups.entries()].map(([groupName, groupTiles]) => (
          <div key={groupName} className="mb-8">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-3">
              {groupName}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {groupTiles.map((tile) => {
                const isUp = tile.change_pct > 0;
                const isDown = tile.change_pct < 0;
                const intensity = Math.min(Math.abs(tile.change_pct) * 15, 0.85);
                const bgColor = isUp
                  ? `rgba(16, 185, 129, ${intensity * 0.15})`
                  : isDown
                  ? `rgba(239, 68, 68, ${intensity * 0.15})`
                  : "transparent";
                const borderColor = isUp
                  ? `rgba(16, 185, 129, ${intensity * 0.3})`
                  : isDown
                  ? `rgba(239, 68, 68, ${intensity * 0.3})`
                  : "var(--color-border-primary)";

                return (
                  <button
                    key={tile.symbol}
                    onClick={() => router.push(`/${tile.symbol}`)}
                    className={`relative p-3 rounded-lg border transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer text-left ${
                      tile.is_major ? "col-span-1 sm:col-span-1 md:col-span-1" : ""
                    }`}
                    style={{
                      background: bgColor,
                      borderColor,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-[var(--color-text-primary)]">
                        {tile.symbol}
                      </span>
                      {isUp ? (
                        <TrendingUp className="w-3 h-3 text-[var(--color-bull)]" />
                      ) : isDown ? (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      ) : (
                        <Minus className="w-3 h-3 text-[var(--color-text-muted)]" />
                      )}
                    </div>
                    <div className="text-sm font-mono font-semibold text-[var(--color-text-primary)]">
                      {formatPrice(tile.price, tile.symbol)}
                    </div>
                    <div
                      className={`text-[11px] font-mono font-semibold ${
                        isUp ? "text-[var(--color-bull)]" : isDown ? "text-red-500" : "text-[var(--color-text-muted)]"
                      }`}
                    >
                      {isUp ? "+" : ""}
                      {tile.change_pct.toFixed(2)}%
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {!loading && tiles.length === 0 && (
          <div className="text-center py-16 text-[var(--color-text-muted)]">
            No market data available. The backend may not be running.
          </div>
        )}
      </div>
    </div>
  );
}
