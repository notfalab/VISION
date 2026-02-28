"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { formatVolume } from "@/lib/format";

interface VolumeLevel {
  price: number;
  volume: number;
  side: "buy" | "sell";
}

const HOT_THRESHOLD = 0.7; // 70% of max volume = hot zone

export default function VolumeProfile() {
  const { activeSymbol, candles, activeTimeframe } = useMarketStore();
  const [levels, setLevels] = useState<VolumeLevel[]>([]);

  const cacheKey = `${activeSymbol}_${activeTimeframe}`;
  const data = candles[cacheKey] || [];

  useEffect(() => {
    if (data.length === 0) return;

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
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Volume Profile
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {levels.length === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)] text-center py-4">
            No data
          </div>
        ) : (
          levels.map((level, i) => {
            const pct = level.volume / maxVol;
            const isHot = pct >= HOT_THRESHOLD;

            return (
              <div
                key={i}
                className={`flex items-center gap-1.5 h-5 rounded-sm px-0.5 transition-colors ${
                  isHot ? "hot-zone-row" : ""
                }`}
              >
                {/* Fire icon for hot zones */}
                <div className="w-3.5 shrink-0 flex justify-center">
                  {isHot && (
                    <Flame
                      className="w-3.5 h-3.5 hot-flame"
                      style={{ color: "var(--color-neon-orange)" }}
                    />
                  )}
                </div>
                <span
                  className={`text-[11px] font-mono w-14 text-right shrink-0 ${
                    isHot
                      ? "text-[var(--color-neon-orange)] font-bold"
                      : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {level.price.toFixed(2)}
                </span>
                <div className="flex-1 h-full relative">
                  <div
                    className={`h-full rounded-sm ${
                      isHot
                        ? "hot-bar"
                        : level.side === "buy"
                          ? "bg-[var(--color-bull)]/30"
                          : "bg-[var(--color-bear)]/30"
                    }`}
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
                <span
                  className={`text-[11px] font-mono w-10 shrink-0 text-right ${
                    isHot
                      ? "text-[var(--color-neon-orange)] font-bold"
                      : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {formatVolume(level.volume)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <style jsx>{`
        .hot-zone-row {
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--color-neon-orange) 8%, transparent),
            color-mix(in srgb, var(--color-neon-red) 5%, transparent)
          );
          animation: hotPulse 2s ease-in-out infinite;
        }

        .hot-bar {
          background: linear-gradient(
            90deg,
            var(--color-neon-orange),
            var(--color-neon-red)
          );
          opacity: 0.6;
          box-shadow: 0 0 8px color-mix(in srgb, var(--color-neon-orange) 40%, transparent);
          animation: barGlow 2s ease-in-out infinite;
        }

        .hot-flame {
          animation: flameFlicker 1s ease-in-out infinite;
          filter: drop-shadow(0 0 3px var(--color-neon-orange));
        }

        @keyframes hotPulse {
          0%, 100% { background-opacity: 1; }
          50% {
            background: linear-gradient(
              90deg,
              color-mix(in srgb, var(--color-neon-orange) 14%, transparent),
              color-mix(in srgb, var(--color-neon-red) 10%, transparent)
            );
          }
        }

        @keyframes barGlow {
          0%, 100% {
            opacity: 0.5;
            box-shadow: 0 0 6px color-mix(in srgb, var(--color-neon-orange) 30%, transparent);
          }
          50% {
            opacity: 0.75;
            box-shadow: 0 0 12px color-mix(in srgb, var(--color-neon-orange) 60%, transparent);
          }
        }

        @keyframes flameFlicker {
          0%, 100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
          25% {
            transform: scale(1.1) translateY(-1px);
            opacity: 0.8;
          }
          50% {
            transform: scale(0.95) translateY(0.5px);
            opacity: 1;
          }
          75% {
            transform: scale(1.05) translateY(-0.5px);
            opacity: 0.85;
          }
        }
      `}</style>
    </div>
  );
}
