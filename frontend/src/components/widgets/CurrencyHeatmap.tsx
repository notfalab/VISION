"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import { Grid3X3, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CurrencyStrength {
  currency: string;
  strength: number; // -100 to +100
  change1h: number;
  change4h: number;
  change1d: number;
}

interface PairCorrelation {
  pair1: string;
  pair2: string;
  correlation: number; // -1 to 1
}

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF"];

const FOREX_PAIRS: Record<string, [string, string]> = {
  EURUSD: ["EUR", "USD"],
  GBPUSD: ["GBP", "USD"],
  USDJPY: ["USD", "JPY"],
  AUDUSD: ["AUD", "USD"],
  USDCAD: ["USD", "CAD"],
  NZDUSD: ["NZD", "USD"],
  USDCHF: ["USD", "CHF"],
};

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "US",
  EUR: "EU",
  GBP: "GB",
  JPY: "JP",
  AUD: "AU",
  CAD: "CA",
  NZD: "NZ",
  CHF: "CH",
};

function getStrengthColor(strength: number): string {
  if (strength >= 60) return "#10b981";
  if (strength >= 30) return "#34d399";
  if (strength >= 10) return "#6ee7b7";
  if (strength > -10) return "#94a3b8";
  if (strength > -30) return "#fca5a5";
  if (strength > -60) return "#f87171";
  return "#ef4444";
}

function getCorrelationColor(corr: number): string {
  const abs = Math.abs(corr);
  if (abs < 0.3) return "var(--color-bg-hover)";
  if (corr > 0.7) return "rgba(16, 185, 129, 0.6)";
  if (corr > 0.3) return "rgba(16, 185, 129, 0.25)";
  if (corr < -0.7) return "rgba(239, 68, 68, 0.6)";
  if (corr < -0.3) return "rgba(239, 68, 68, 0.25)";
  return "var(--color-bg-hover)";
}

export default function CurrencyHeatmap() {
  const [strengths, setStrengths] = useState<CurrencyStrength[]>([]);
  const [correlations, setCorrelations] = useState<PairCorrelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"strength" | "correlation">("strength");

  useEffect(() => {
    const calculate = async () => {
      setLoading(true);
      try {
        // Fetch recent price data for all forex pairs
        const pairData: Record<string, { change1h: number; change4h: number; change1d: number; prices: number[] }> = {};

        const results = await Promise.allSettled(
          Object.keys(FOREX_PAIRS).map(async (pair) => {
            try {
              // Fetch 1d candles for daily change
              const candles1d = await api.prices(pair, "1d", 2);
              // Fetch 1h candles for hourly changes
              const candles1h = await api.prices(pair, "1h", 24);

              const arr1d = Array.isArray(candles1d) ? candles1d : [];
              const arr1h = Array.isArray(candles1h) ? candles1h : [];

              let change1d = 0, change4h = 0, change1h = 0;
              const prices: number[] = [];

              if (arr1d.length >= 2) {
                const prev = arr1d[arr1d.length - 2]?.close || 0;
                const curr = arr1d[arr1d.length - 1]?.close || 0;
                change1d = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
              }

              if (arr1h.length >= 2) {
                const curr = arr1h[arr1h.length - 1]?.close || 0;
                const h1ago = arr1h[arr1h.length - 2]?.close || 0;
                change1h = h1ago > 0 ? ((curr - h1ago) / h1ago) * 100 : 0;

                if (arr1h.length >= 5) {
                  const h4ago = arr1h[arr1h.length - 5]?.close || 0;
                  change4h = h4ago > 0 ? ((curr - h4ago) / h4ago) * 100 : 0;
                }

                // Collect close prices for correlation calculation
                for (const c of arr1h) {
                  if (c?.close) prices.push(c.close);
                }
              }

              pairData[pair] = { change1h, change4h, change1d, prices };
            } catch {
              pairData[pair] = { change1h: 0, change4h: 0, change1d: 0, prices: [] };
            }
          })
        );

        // Calculate currency strength from pair changes
        const currencyScores: Record<string, { sum1h: number; sum4h: number; sum1d: number; count: number }> = {};
        for (const c of CURRENCIES) {
          currencyScores[c] = { sum1h: 0, sum4h: 0, sum1d: 0, count: 0 };
        }

        for (const [pair, data] of Object.entries(pairData)) {
          const [base, quote] = FOREX_PAIRS[pair] || [];
          if (!base || !quote) continue;

          // Base currency gains when pair goes up
          if (currencyScores[base]) {
            currencyScores[base].sum1h += data.change1h;
            currencyScores[base].sum4h += data.change4h;
            currencyScores[base].sum1d += data.change1d;
            currencyScores[base].count++;
          }
          // Quote currency loses when pair goes up
          if (currencyScores[quote]) {
            currencyScores[quote].sum1h -= data.change1h;
            currencyScores[quote].sum4h -= data.change4h;
            currencyScores[quote].sum1d -= data.change1d;
            currencyScores[quote].count++;
          }
        }

        const strengthArr: CurrencyStrength[] = CURRENCIES.map((currency) => {
          const s = currencyScores[currency];
          const count = Math.max(s.count, 1);
          const avgChange = s.sum1d / count;
          // Normalize to -100/+100 scale (0.5% daily change = 100)
          const strength = Math.max(-100, Math.min(100, avgChange * 200));
          return {
            currency,
            strength: Math.round(strength * 10) / 10,
            change1h: Math.round((s.sum1h / count) * 10000) / 10000,
            change4h: Math.round((s.sum4h / count) * 10000) / 10000,
            change1d: Math.round((s.sum1d / count) * 10000) / 10000,
          };
        }).sort((a, b) => b.strength - a.strength);

        setStrengths(strengthArr);

        // Calculate correlations between pairs
        const pairNames = Object.keys(FOREX_PAIRS);
        const corrArr: PairCorrelation[] = [];

        for (let i = 0; i < pairNames.length; i++) {
          for (let j = i + 1; j < pairNames.length; j++) {
            const p1 = pairData[pairNames[i]]?.prices || [];
            const p2 = pairData[pairNames[j]]?.prices || [];
            const minLen = Math.min(p1.length, p2.length);

            if (minLen > 5) {
              // Calculate returns
              const r1: number[] = [];
              const r2: number[] = [];
              for (let k = 1; k < minLen; k++) {
                r1.push((p1[k] - p1[k - 1]) / p1[k - 1]);
                r2.push((p2[k] - p2[k - 1]) / p2[k - 1]);
              }

              // Pearson correlation
              const n = r1.length;
              const meanR1 = r1.reduce((a, b) => a + b, 0) / n;
              const meanR2 = r2.reduce((a, b) => a + b, 0) / n;
              let num = 0, d1 = 0, d2 = 0;
              for (let k = 0; k < n; k++) {
                const diff1 = r1[k] - meanR1;
                const diff2 = r2[k] - meanR2;
                num += diff1 * diff2;
                d1 += diff1 * diff1;
                d2 += diff2 * diff2;
              }
              const denom = Math.sqrt(d1 * d2);
              const corr = denom > 0 ? num / denom : 0;

              corrArr.push({
                pair1: pairNames[i],
                pair2: pairNames[j],
                correlation: Math.round(corr * 100) / 100,
              });
            }
          }
        }

        setCorrelations(corrArr);
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    };

    calculate();
    const interval = setInterval(calculate, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="w-4 h-4 text-[var(--color-neon-cyan)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase">Currency Heatmap</h3>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setTab("strength")}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
              tab === "strength"
                ? "bg-[var(--color-neon-cyan)]/20 text-[var(--color-neon-cyan)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Strength
          </button>
          <button
            onClick={() => setTab("correlation")}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
              tab === "correlation"
                ? "bg-[var(--color-neon-cyan)]/20 text-[var(--color-neon-cyan)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Correlation
          </button>
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-6 bg-[var(--color-bg-hover)] rounded" />
            ))}
          </div>
        ) : tab === "strength" ? (
          <div className="space-y-1.5">
            {strengths.map((cs) => (
              <div key={cs.currency} className="flex items-center gap-2">
                {/* Currency label */}
                <div className="flex items-center gap-1.5 w-12 shrink-0">
                  <span className="text-[10px] text-[var(--color-text-muted)]">{CURRENCY_FLAGS[cs.currency]}</span>
                  <span className="text-xs font-mono font-bold text-[var(--color-text-primary)]">{cs.currency}</span>
                </div>

                {/* Strength bar */}
                <div className="flex-1 h-5 bg-[var(--color-bg-hover)] rounded-full relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-px h-full bg-[var(--color-border-primary)]" />
                  </div>
                  <div
                    className="absolute top-0 h-full rounded-full transition-all duration-500"
                    style={{
                      backgroundColor: getStrengthColor(cs.strength),
                      left: cs.strength >= 0 ? "50%" : `${50 + cs.strength / 2}%`,
                      width: `${Math.abs(cs.strength) / 2}%`,
                      opacity: 0.8,
                    }}
                  />
                </div>

                {/* Value */}
                <div className="flex items-center gap-1 w-16 shrink-0 justify-end">
                  {cs.strength > 5 ? (
                    <TrendingUp className="w-3 h-3 text-[var(--color-bull)]" />
                  ) : cs.strength < -5 ? (
                    <TrendingDown className="w-3 h-3 text-[var(--color-bear)]" />
                  ) : (
                    <Minus className="w-3 h-3 text-[var(--color-text-muted)]" />
                  )}
                  <span
                    className="text-[11px] font-mono font-semibold tabular-nums"
                    style={{ color: getStrengthColor(cs.strength) }}
                  >
                    {cs.strength > 0 ? "+" : ""}{cs.strength.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-primary)]/50">
              <span className="text-[9px] text-[var(--color-bear)] font-mono">Weak</span>
              <span className="text-[9px] text-[var(--color-text-muted)] font-mono">Neutral</span>
              <span className="text-[9px] text-[var(--color-bull)] font-mono">Strong</span>
            </div>
          </div>
        ) : (
          /* Correlation Matrix */
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] font-mono">
              <thead>
                <tr>
                  <th className="p-1 text-[var(--color-text-muted)]" />
                  {Object.keys(FOREX_PAIRS).map((pair) => (
                    <th key={pair} className="p-1 text-[var(--color-text-muted)] font-semibold">
                      {pair.slice(0, 3)}/<br />{pair.slice(3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(FOREX_PAIRS).map((p1) => (
                  <tr key={p1}>
                    <td className="p-1 text-[var(--color-text-secondary)] font-semibold">
                      {p1.slice(0, 3)}/{p1.slice(3)}
                    </td>
                    {Object.keys(FOREX_PAIRS).map((p2) => {
                      if (p1 === p2) {
                        return (
                          <td key={p2} className="p-1 text-center" style={{ background: "rgba(99, 102, 241, 0.3)" }}>
                            1.00
                          </td>
                        );
                      }
                      const corr = correlations.find(
                        (c) =>
                          (c.pair1 === p1 && c.pair2 === p2) ||
                          (c.pair1 === p2 && c.pair2 === p1)
                      );
                      const val = corr?.correlation ?? 0;
                      return (
                        <td
                          key={p2}
                          className="p-1 text-center text-[var(--color-text-primary)]"
                          style={{ background: getCorrelationColor(val) }}
                        >
                          {val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Correlation legend */}
            <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-[var(--color-border-primary)]/50">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ background: "rgba(239, 68, 68, 0.6)" }} />
                <span className="text-[9px] text-[var(--color-text-muted)]">Inverse</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ background: "var(--color-bg-hover)" }} />
                <span className="text-[9px] text-[var(--color-text-muted)]">Low</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ background: "rgba(16, 185, 129, 0.6)" }} />
                <span className="text-[9px] text-[var(--color-text-muted)]">Positive</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
