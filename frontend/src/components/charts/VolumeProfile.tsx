"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/stores/market";
import { formatVolume } from "@/lib/format";

interface VolumeLevel {
  price: number;
  volume: number;
  side: "buy" | "sell";
}

export default function VolumeProfile() {
  const { activeSymbol, candles, activeTimeframe } = useMarketStore();
  const [levels, setLevels] = useState<VolumeLevel[]>([]);

  const cacheKey = `${activeSymbol}_${activeTimeframe}`;
  const data = candles[cacheKey] || [];

  useEffect(() => {
    if (data.length === 0) return;

    // Build volume profile: bin by price levels
    const prices = data.map((c) => c.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const bins = 20;
    const binSize = (max - min) / bins;

    const profile: VolumeLevel[] = [];
    for (let i = 0; i < bins; i++) {
      const priceLevel = min + binSize * (i + 0.5);
      let buyVol = 0;
      let sellVol = 0;

      data.forEach((c) => {
        if (c.close >= min + binSize * i && c.close < min + binSize * (i + 1)) {
          if (c.close >= c.open) buyVol += c.volume;
          else sellVol += c.volume;
        }
      });

      if (buyVol > 0)
        profile.push({ price: priceLevel, volume: buyVol, side: "buy" });
      if (sellVol > 0)
        profile.push({ price: priceLevel, volume: sellVol, side: "sell" });
    }
    setLevels(profile);
  }, [data]);

  const maxVol = Math.max(...levels.map((l) => l.volume), 1);

  return (
    <div className="card-glass rounded-lg overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] shrink-0">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Volume Profile
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {levels.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
            No data
          </div>
        ) : (
          levels.map((level, i) => (
            <div key={i} className="flex items-center gap-2 h-4">
              <span className="text-[9px] font-mono text-[var(--color-text-muted)] w-16 text-right shrink-0">
                {level.price.toFixed(2)}
              </span>
              <div className="flex-1 h-full relative">
                <div
                  className={`h-full rounded-sm ${
                    level.side === "buy"
                      ? "bg-[var(--color-bull)]/30"
                      : "bg-[var(--color-bear)]/30"
                  }`}
                  style={{ width: `${(level.volume / maxVol) * 100}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-[var(--color-text-muted)] w-10 shrink-0">
                {formatVolume(level.volume)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
