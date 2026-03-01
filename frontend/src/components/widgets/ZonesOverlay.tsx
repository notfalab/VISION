"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { Layers, Shield, Target, Zap, ChevronDown, ChevronUp } from "lucide-react";

interface Zone {
  high: number;
  low: number;
  strength?: string;
  type?: string;
  active?: boolean;
  filled?: boolean;
  touches?: number;
}

interface SRLevel {
  price: number;
  strength: number;
  touches: number;
}

interface ZonesData {
  supply: Zone[];
  demand: Zone[];
  support: SRLevel[];
  resistance: SRLevel[];
  fvg: Zone[];
  order_blocks: Zone[];
  pivots?: Record<string, number>;
  fibonacci?: Record<string, number>;
  structure?: { bos: any[]; choch: any[] };
}

export default function ZonesOverlay() {
  const { activeSymbol, activeTimeframe } = useMarketStore();
  const [zones, setZones] = useState<ZonesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    sd: true,
    sr: true,
    smc: false,
    fib: false,
  });

  const live = useMarketStore((s) => s.livePrices[s.activeSymbol]);
  const currentPrice = live?.price || 0;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await api.scalperZones(activeSymbol, activeTimeframe);
        setZones(result?.zones || null);
      } catch {
        setZones(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSymbol, activeTimeframe]);

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Layers className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase">Key Zones</h3>
        <span className="text-[9px] font-mono text-[var(--color-text-muted)] ml-auto">{activeTimeframe}</span>
      </div>

      <div className="p-2 space-y-1">
        {loading ? (
          <div className="animate-pulse space-y-2 p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-5 bg-[var(--color-bg-hover)] rounded" />
            ))}
          </div>
        ) : !zones ? (
          <p className="text-xs text-[var(--color-text-muted)] p-2">No zone data available</p>
        ) : (
          <>
            {/* Supply & Demand Zones */}
            <Section
              title="Supply & Demand"
              icon={<Shield className="w-3.5 h-3.5 text-[var(--color-neon-purple)]" />}
              expanded={expanded.sd}
              onToggle={() => toggleSection("sd")}
            >
              {zones.demand.length === 0 && zones.supply.length === 0 ? (
                <p className="text-[10px] text-[var(--color-text-muted)] px-2 py-1">No active zones</p>
              ) : (
                <div className="space-y-1">
                  {zones.demand.map((z, i) => (
                    <ZoneBar
                      key={`d-${i}`}
                      label="DEMAND"
                      high={z.high}
                      low={z.low}
                      symbol={activeSymbol}
                      color="var(--color-bull)"
                      bgColor="rgba(16, 185, 129, 0.1)"
                      currentPrice={currentPrice}
                    />
                  ))}
                  {zones.supply.map((z, i) => (
                    <ZoneBar
                      key={`s-${i}`}
                      label="SUPPLY"
                      high={z.high}
                      low={z.low}
                      symbol={activeSymbol}
                      color="var(--color-bear)"
                      bgColor="rgba(239, 68, 68, 0.1)"
                      currentPrice={currentPrice}
                    />
                  ))}
                </div>
              )}
            </Section>

            {/* Support & Resistance */}
            <Section
              title="Support & Resistance"
              icon={<Target className="w-3.5 h-3.5 text-[var(--color-neon-amber)]" />}
              expanded={expanded.sr}
              onToggle={() => toggleSection("sr")}
            >
              <div className="space-y-0.5">
                {zones.resistance.slice(0, 3).map((r, i) => (
                  <LevelRow
                    key={`r-${i}`}
                    label={`R${i + 1}`}
                    price={r.price}
                    symbol={activeSymbol}
                    color="var(--color-bear)"
                    distance={currentPrice > 0 ? ((r.price - currentPrice) / currentPrice) * 100 : 0}
                    strength={r.strength}
                  />
                ))}
                {currentPrice > 0 && (
                  <div className="flex items-center gap-2 px-2 py-1 bg-[var(--color-neon-blue)]/10 rounded">
                    <span className="text-[9px] font-mono text-[var(--color-neon-blue)] font-bold w-6">NOW</span>
                    <span className="text-[11px] font-mono font-bold text-[var(--color-neon-blue)] tabular-nums">
                      {formatPrice(currentPrice, activeSymbol)}
                    </span>
                  </div>
                )}
                {zones.support.slice(0, 3).map((s, i) => (
                  <LevelRow
                    key={`s-${i}`}
                    label={`S${i + 1}`}
                    price={s.price}
                    symbol={activeSymbol}
                    color="var(--color-bull)"
                    distance={currentPrice > 0 ? ((s.price - currentPrice) / currentPrice) * 100 : 0}
                    strength={s.strength}
                  />
                ))}
              </div>
            </Section>

            {/* Smart Money Concepts */}
            {(zones.order_blocks.length > 0 || zones.fvg.length > 0) && (
              <Section
                title="Smart Money"
                icon={<Zap className="w-3.5 h-3.5 text-[var(--color-neon-orange)]" />}
                expanded={expanded.smc}
                onToggle={() => toggleSection("smc")}
              >
                <div className="space-y-1">
                  {zones.order_blocks.filter((ob) => ob.active).slice(0, 3).map((ob, i) => (
                    <ZoneBar
                      key={`ob-${i}`}
                      label={`OB ${ob.type === "bullish" ? "Bull" : "Bear"}`}
                      high={ob.high}
                      low={ob.low}
                      symbol={activeSymbol}
                      color={ob.type === "bullish" ? "var(--color-bull)" : "var(--color-bear)"}
                      bgColor={ob.type === "bullish" ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)"}
                      currentPrice={currentPrice}
                    />
                  ))}
                  {zones.fvg.filter((f) => !f.filled).slice(0, 3).map((f, i) => (
                    <ZoneBar
                      key={`fvg-${i}`}
                      label={`FVG ${f.type === "bullish" ? "Bull" : "Bear"}`}
                      high={f.high}
                      low={f.low}
                      symbol={activeSymbol}
                      color="var(--color-neon-cyan)"
                      bgColor="rgba(6, 182, 212, 0.08)"
                      currentPrice={currentPrice}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* Fibonacci */}
            {zones.fibonacci && Object.keys(zones.fibonacci).length > 0 && (
              <Section
                title="Fibonacci"
                icon={<span className="text-[11px]">🔢</span>}
                expanded={expanded.fib}
                onToggle={() => toggleSection("fib")}
              >
                <div className="space-y-0.5">
                  {Object.entries(zones.fibonacci)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([level, price]) => (
                      <div key={level} className="flex items-center gap-2 px-2 py-0.5">
                        <span className="text-[9px] font-mono text-[var(--color-neon-purple)] w-10">{level}</span>
                        <span className="text-[10px] font-mono text-[var(--color-text-secondary)] tabular-nums">
                          {formatPrice(price as number, activeSymbol)}
                        </span>
                      </div>
                    ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border-primary)]/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        {icon}
        <span>{title}</span>
        <span className="ml-auto">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>
      {expanded && <div className="px-1 pb-1.5">{children}</div>}
    </div>
  );
}

function ZoneBar({
  label,
  high,
  low,
  symbol,
  color,
  bgColor,
  currentPrice,
}: {
  label: string;
  high: number;
  low: number;
  symbol: string;
  color: string;
  bgColor: string;
  currentPrice: number;
}) {
  const distance = currentPrice > 0 ? ((((high + low) / 2) - currentPrice) / currentPrice) * 100 : 0;

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded" style={{ backgroundColor: bgColor }}>
      <span className="text-[9px] font-mono font-bold w-14 shrink-0" style={{ color }}>
        {label}
      </span>
      <div className="flex-1 flex items-center gap-1">
        <span className="text-[10px] font-mono text-[var(--color-text-secondary)] tabular-nums">
          {formatPrice(low, symbol)}
        </span>
        <span className="text-[8px] text-[var(--color-text-muted)]">—</span>
        <span className="text-[10px] font-mono text-[var(--color-text-secondary)] tabular-nums">
          {formatPrice(high, symbol)}
        </span>
      </div>
      <span className="text-[9px] font-mono tabular-nums" style={{ color: distance > 0 ? "var(--color-text-muted)" : "var(--color-text-muted)" }}>
        {distance > 0 ? "+" : ""}{distance.toFixed(2)}%
      </span>
    </div>
  );
}

function LevelRow({
  label,
  price,
  symbol,
  color,
  distance,
  strength,
}: {
  label: string;
  price: number;
  symbol: string;
  color: string;
  distance: number;
  strength: number;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-0.5">
      <span className="text-[9px] font-mono font-bold w-6" style={{ color }}>{label}</span>
      <span className="text-[10px] font-mono text-[var(--color-text-secondary)] tabular-nums flex-1">
        {formatPrice(price, symbol)}
      </span>
      <span className="text-[9px] font-mono tabular-nums text-[var(--color-text-muted)]">
        {distance > 0 ? "+" : ""}{distance.toFixed(2)}%
      </span>
      <div className="flex gap-0.5">
        {[...Array(Math.min(strength, 5))].map((_, i) => (
          <div key={i} className="w-1 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.6 + i * 0.08 }} />
        ))}
      </div>
    </div>
  );
}
