"use client";

import { memo, useEffect, useState } from "react";
import { Clock, Sun, Moon } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";

interface SessionData {
  name: string;
  icon: typeof Clock;
  color: string;
  avgRange: number;
  bullishPct: number;
  avgVolume: number;
  bestHour: number;
  totalCandles: number;
}

interface HourCell {
  day: number; // 0-6
  hour: number; // 0-23
  avgRange: number;
}

function SessionStats() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [heatmap, setHeatmap] = useState<HourCell[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const candles = await api.prices(activeSymbol, "1h", 720);
        if (cancelled || !candles?.length) { setLoading(false); return; }

        // Define sessions (UTC hours)
        const sessionDefs = [
          { name: "Asian", startH: 0, endH: 8, icon: Moon, color: "var(--color-neon-purple)" },
          { name: "London", startH: 8, endH: 16, icon: Sun, color: "var(--color-neon-blue)" },
          { name: "New York", startH: 13, endH: 21, icon: Clock, color: "var(--color-neon-amber)" },
        ];

        const results: SessionData[] = sessionDefs.map(sd => {
          const filtered = candles.filter((c: any) => {
            const h = new Date(c.timestamp).getUTCHours();
            return h >= sd.startH && h < sd.endH;
          });

          const ranges: number[] = filtered.map((c: any) => c.high - c.low);
          const bullish = filtered.filter((c: any) => c.close >= c.open).length;
          const volumes: number[] = filtered.map((c: any) => c.volume || 0);

          // Best hour (highest avg range)
          const hourRanges: Record<number, number[]> = {};
          filtered.forEach((c: any) => {
            const h = new Date(c.timestamp).getUTCHours();
            if (!hourRanges[h]) hourRanges[h] = [];
            hourRanges[h].push(c.high - c.low);
          });
          let bestHour = sd.startH;
          let bestAvg = 0;
          for (const [h, rs] of Object.entries(hourRanges)) {
            const avg = rs.reduce((s: number, r: number) => s + r, 0) / rs.length;
            if (avg > bestAvg) { bestAvg = avg; bestHour = parseInt(h); }
          }

          return {
            name: sd.name,
            icon: sd.icon,
            color: sd.color,
            avgRange: ranges.length > 0 ? ranges.reduce((s: number, r: number) => s + r, 0) / ranges.length : 0,
            bullishPct: filtered.length > 0 ? (bullish / filtered.length) * 100 : 50,
            avgVolume: volumes.length > 0 ? volumes.reduce((s: number, v: number) => s + v, 0) / volumes.length : 0,
            bestHour,
            totalCandles: filtered.length,
          };
        });

        // Heatmap: group by day of week × hour
        const cellMap: Record<string, number[]> = {};
        candles.forEach((c: any) => {
          const d = new Date(c.timestamp);
          const day = d.getUTCDay();
          const hour = d.getUTCHours();
          const key = `${day}-${hour}`;
          if (!cellMap[key]) cellMap[key] = [];
          cellMap[key].push(c.high - c.low);
        });

        const cells: HourCell[] = [];
        for (let day = 1; day <= 5; day++) { // Mon-Fri
          for (let hour = 0; hour < 24; hour++) {
            const key = `${day}-${hour}`;
            const vals = cellMap[key] || [];
            cells.push({ day, hour, avgRange: vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 });
          }
        }

        if (!cancelled) {
          setSessions(results);
          setHeatmap(cells);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeSymbol]);

  const maxRange = Math.max(...heatmap.map(c => c.avgRange), 0.01);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-[var(--color-neon-cyan)]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
          Session Stats
        </span>
        <span className="text-[8px] text-[var(--color-text-muted)]">30d</span>
      </div>

      {loading ? (
        <div className="h-20 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-[var(--color-neon-cyan)]/30 border-t-[var(--color-neon-cyan)] rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Session cards */}
          <div className="grid grid-cols-3 gap-1.5">
            {sessions.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.name} className="p-2 rounded bg-[var(--color-bg-primary)]/50 border border-[var(--color-border-primary)]">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Icon className="w-3 h-3" style={{ color: s.color }} />
                    <span className="text-[8px] font-bold uppercase" style={{ color: s.color }}>{s.name}</span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[8px] font-mono">
                      <span className="text-[var(--color-text-muted)]">Range</span>
                      <span className="text-[var(--color-text-primary)]">{s.avgRange.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[8px] font-mono">
                      <span className="text-[var(--color-text-muted)]">Bullish</span>
                      <span className={s.bullishPct >= 50 ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}>
                        {s.bullishPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[8px] font-mono">
                      <span className="text-[var(--color-text-muted)]">Best hr</span>
                      <span className="text-[var(--color-neon-amber)]">{s.bestHour}:00</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Volatility heatmap */}
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Volatility by Hour (UTC)
            </div>
            <div className="grid gap-px" style={{ gridTemplateColumns: "30px repeat(24, 1fr)" }}>
              {/* Hour labels */}
              <div />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="text-center text-[6px] font-mono text-[var(--color-text-muted)]">
                  {h % 4 === 0 ? h : ""}
                </div>
              ))}
              {/* Day rows */}
              {days.map((day, di) => (
                <>
                  <div key={`label-${di}`} className="text-[7px] font-mono text-[var(--color-text-muted)] flex items-center">{day}</div>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const cell = heatmap.find(c => c.day === di + 1 && c.hour === hour);
                    const intensity = cell ? cell.avgRange / maxRange : 0;
                    return (
                      <div
                        key={`${di}-${hour}`}
                        className="aspect-square rounded-sm"
                        style={{
                          backgroundColor: intensity > 0.7
                            ? `rgba(245, 158, 11, ${0.3 + intensity * 0.5})`
                            : intensity > 0.3
                            ? `rgba(59, 130, 246, ${0.1 + intensity * 0.4})`
                            : `rgba(100, 116, 139, ${intensity * 0.3})`,
                        }}
                        title={`${day} ${hour}:00 — ${cell?.avgRange.toFixed(2) || "0"} avg range`}
                      />
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(SessionStats);
