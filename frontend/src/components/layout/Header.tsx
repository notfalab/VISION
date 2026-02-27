"use client";

import { useEffect, useState, useRef } from "react";
import { Activity } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { binanceWS, isBinanceSymbol } from "@/lib/binance-ws";
import { formatPrice, formatChange, priceColor } from "@/lib/format";

export default function Header() {
  const { activeSymbol, watchlist, livePrices, updateLivePrice } =
    useMarketStore();
  const [clock, setClock] = useState(new Date());
  const wsConnected = useRef(false);

  // Connect Binance WebSocket for real-time gold prices
  useEffect(() => {
    if (wsConnected.current) return;
    wsConnected.current = true;

    const wsSymbols = watchlist.filter(isBinanceSymbol);
    binanceWS.connect(wsSymbols, (symbol, data) => {
      updateLivePrice(symbol, data);
    });

    return () => {
      binanceWS.disconnect();
      wsConnected.current = false;
    };
  }, [watchlist, updateLivePrice]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = livePrices[activeSymbol];

  return (
    <header className="flex items-center h-11 px-3 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <Activity className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <span className="text-xs font-bold tracking-widest text-[var(--color-text-primary)]">
          VISION
        </span>
      </div>

      <div className="h-4 w-px bg-[var(--color-border-primary)] mx-3 shrink-0" />

      {/* Gold ticker */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono bg-[var(--color-neon-blue)]/10 border border-[var(--color-neon-blue)]/30">
        <span className="font-semibold text-[var(--color-neon-cyan)]">XAUUSD</span>
        <span className="text-[var(--color-text-secondary)] tabular-nums">
          {live ? formatPrice(live.price, "XAUUSD") : "—"}
        </span>
        <span className={`text-[10px] tabular-nums ${priceColor(live?.change ?? 0)}`}>
          {live ? formatChange(live.change) : ""}
        </span>
        {live && (
          <span className="w-1 h-1 rounded-full bg-[var(--color-neon-green)] animate-pulse" />
        )}
      </div>

      {/* Right — status */}
      <div className="flex items-center gap-3 shrink-0 ml-auto">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-neon-green)] pulse-live" />
          <span className="text-[10px] text-[var(--color-text-muted)]">LIVE</span>
        </div>
        <span className="text-[10px] text-[var(--color-text-muted)] font-mono tabular-nums">
          {clock.toLocaleTimeString("en-US", { hour12: false })}
        </span>
      </div>
    </header>
  );
}
