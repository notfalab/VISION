/** Format price with appropriate decimal places based on value magnitude */
export function formatPrice(price: number, symbol?: string): string {
  if (symbol?.includes("JPY")) return price.toFixed(3);
  if (price > 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price > 1) return price.toFixed(4);
  return price.toFixed(6);
}

/** Format large numbers with K/M/B suffixes */
export function formatVolume(vol: number): string {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + "B";
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + "M";
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + "K";
  return vol.toFixed(2);
}

/** Format percentage change */
export function formatChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/** Color class based on value direction */
export function priceColor(value: number): string {
  if (value > 0) return "text-[var(--color-bull)]";
  if (value < 0) return "text-[var(--color-bear)]";
  return "text-[var(--color-text-secondary)]";
}

/** Format timestamp to readable string */
export function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
