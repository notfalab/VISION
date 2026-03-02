/** Returns a price formatter function suitable for lightweight-charts priceFormat */
export function getPriceFormatter(symbol: string): (price: number) => string {
  if (symbol.includes("JPY")) {
    return (p: number) => p.toFixed(3);
  }
  // Gold / Silver / commodities (high value)
  if (symbol === "XAUUSD" || symbol === "XAGUSD") {
    return (p: number) => p.toFixed(2);
  }
  // BTC
  if (symbol.startsWith("BTC")) {
    return (p: number) =>
      p.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  }
  // Other crypto (ETH, SOL, etc.)
  if (
    symbol.startsWith("ETH") ||
    symbol.startsWith("SOL") ||
    symbol.startsWith("XRP")
  ) {
    return (p: number) => p.toFixed(2);
  }
  // Forex majors (5 decimal places)
  if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
    return (p: number) => p.toFixed(5);
  }
  // Fallback
  return (p: number) => {
    if (p > 1000)
      return p.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    if (p > 1) return p.toFixed(4);
    return p.toFixed(6);
  };
}
