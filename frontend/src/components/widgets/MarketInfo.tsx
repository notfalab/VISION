"use client";

import { useEffect, useState } from "react";
import { Info, Clock, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { useMarketStore, getMarketType } from "@/stores/market";
import { api } from "@/lib/api";
import { formatPrice, formatChange, priceColor } from "@/lib/format";

interface MarketData {
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  change: number;
  changePct: number;
  range: number;
  avgVolume: number;
}

export default function MarketInfo() {
  const { activeSymbol, activeTimeframe, candles } = useMarketStore();
  const [data, setData] = useState<MarketData | null>(null);
  const marketType = getMarketType(activeSymbol);

  const cacheKey = `${activeSymbol}_${activeTimeframe}`;
  const cachedData = candles[cacheKey] || [];

  useEffect(() => {
    if (cachedData.length < 2) return;

    const latest = cachedData[cachedData.length - 1];
    const prev = cachedData[cachedData.length - 2];

    // Compute stats from cached candle data
    const last20 = cachedData.slice(-20);
    const highs = last20.map((c) => c.high);
    const lows = last20.map((c) => c.low);
    const volumes = last20.map((c) => c.volume);

    setData({
      open: latest.open,
      high: Math.max(...highs),
      low: Math.min(...lows),
      close: latest.close,
      prevClose: prev.close,
      change: latest.close - prev.close,
      changePct: ((latest.close - prev.close) / prev.close) * 100,
      range: Math.max(...highs) - Math.min(...lows),
      avgVolume: volumes.reduce((a, b) => a + b, 0) / volumes.length,
    });
  }, [cachedData]);

  const isGoldProxy = activeSymbol === "XAUUSD" || activeSymbol === "XAGUSD";

  return (
    <div className="card-glass rounded-lg overflow-hidden flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-[var(--color-neon-cyan)]" />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          {marketType === "commodity" ? "Commodity Info" : "Forex Info"}
        </h3>
      </div>

      <div className="p-3 flex-1 space-y-3">
        {/* Gold proxy disclaimer */}
        {isGoldProxy && (
          <div className="rounded-md bg-[var(--color-neon-amber)]/5 border border-[var(--color-neon-amber)]/20 p-2">
            <p className="text-[9px] text-[var(--color-neon-amber)] leading-relaxed">
              Data source: PAXG/USDT (Binance) — a gold-backed crypto token that tracks gold spot price.
              Prices may differ slightly from institutional gold spot (LBMA/COMEX).
            </p>
          </div>
        )}

        {data ? (
          <>
            {/* Price summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-text-muted)]">Last Price</span>
                <span className="text-sm font-mono font-bold text-[var(--color-text-primary)]">
                  {formatPrice(data.close, activeSymbol)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-text-muted)]">Change</span>
                <div className="flex items-center gap-1">
                  {data.change >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-[var(--color-bull)]" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-[var(--color-bear)]" />
                  )}
                  <span className={`text-xs font-mono ${priceColor(data.change)}`}>
                    {formatPrice(Math.abs(data.change), activeSymbol)} ({formatChange(data.changePct)})
                  </span>
                </div>
              </div>
            </div>

            {/* OHLC */}
            <div className="border-t border-[var(--color-border-primary)] pt-2 space-y-1.5">
              <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Session
              </div>
              {[
                { label: "Open", value: data.open },
                { label: "High", value: data.high, color: "text-[var(--color-bull)]" },
                { label: "Low", value: data.low, color: "text-[var(--color-bear)]" },
                { label: "Prev Close", value: data.prevClose },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--color-text-muted)]">{row.label}</span>
                  <span className={`text-[10px] font-mono ${row.color || "text-[var(--color-text-secondary)]"}`}>
                    {formatPrice(row.value, activeSymbol)}
                  </span>
                </div>
              ))}
            </div>

            {/* 20-period range */}
            <div className="border-t border-[var(--color-border-primary)] pt-2 space-y-1.5">
              <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                20-Period Stats
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-text-muted)]">Range</span>
                <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                  {formatPrice(data.range, activeSymbol)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-text-muted)]">Avg Volume</span>
                <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                  {data.avgVolume.toFixed(2)}
                </span>
              </div>

              {/* Visual price position within range */}
              <div className="mt-2">
                <div className="flex justify-between text-[8px] font-mono text-[var(--color-text-muted)] mb-0.5">
                  <span>{formatPrice(data.low, activeSymbol)}</span>
                  <span>{formatPrice(data.high, activeSymbol)}</span>
                </div>
                <div className="h-1.5 bg-[var(--color-bg-secondary)] rounded-full relative">
                  <div
                    className="absolute top-0 h-full rounded-full"
                    style={{
                      left: "0%",
                      width: `${((data.close - data.low) / (data.high - data.low)) * 100}%`,
                      background: "linear-gradient(90deg, var(--color-bear), var(--color-neon-amber), var(--color-bull))",
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border border-[var(--color-bg-primary)]"
                    style={{
                      left: `${((data.close - data.low) / (data.high - data.low)) * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Market hours info */}
            <div className="border-t border-[var(--color-border-primary)] pt-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-[var(--color-text-muted)]" />
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {isGoldProxy
                    ? "Gold proxy via PAXG — 24/7 crypto market"
                    : "Commodity market"}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-8">
            Loading market data...
          </div>
        )}
      </div>
    </div>
  );
}
