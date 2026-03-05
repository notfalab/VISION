import type { Timeframe } from "@/types/market";

export const VALID_TIMEFRAMES = new Set<Timeframe>([
  "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w",
]);

/** Parse & validate a timeframe query param. Returns validated Timeframe or null. */
export function parseTimeframe(raw: string | undefined | null): Timeframe | null {
  if (!raw) return null;
  const lower = raw.toLowerCase() as Timeframe;
  return VALID_TIMEFRAMES.has(lower) ? lower : null;
}

/** Update browser URL to include symbol + timeframe without triggering navigation. */
export function updateDashboardURL(symbol: string, tf: Timeframe) {
  const path = symbol ? `/${symbol}` : "/";
  const url = `${path}?tf=${tf}`;
  window.history.replaceState(null, "", url);
}
