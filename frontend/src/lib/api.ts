const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** Like fetchAPI but returns a fallback value on error instead of throwing. */
async function fetchAPISafe<T>(path: string, fallback: T, options?: RequestInit): Promise<T> {
  try {
    return await fetchAPI<T>(path, options);
  } catch {
    return fallback;
  }
}

// Deduplicate concurrent fetchPrices calls — multiple widgets requesting the
// same symbol+timeframe share a single in-flight promise.
const inflightFetches = new Map<string, Promise<{ rows_ingested: number }>>();

function fetchPricesDeduped(
  symbol: string,
  timeframe = "1d",
  limit = 200,
): Promise<{ rows_ingested: number }> {
  const key = `${symbol}:${timeframe}:${limit}`;
  const existing = inflightFetches.get(key);
  if (existing) return existing;

  const promise = fetchAPISafe<{ rows_ingested: number }>(
    `/api/v1/prices/${symbol}/fetch?timeframe=${timeframe}&limit=${limit}`,
    { rows_ingested: 0 },
    { method: "POST" },
  ).finally(() => {
    inflightFetches.delete(key);
  });

  inflightFetches.set(key, promise);
  return promise;
}

export const api = {
  // Health
  health: () => fetchAPI<{ status: string }>("/health"),

  // Assets
  assets: () => fetchAPI<{ id: number; symbol: string; name: string; market_type: string }[]>("/api/v1/assets"),

  // Prices (returns empty array if asset/data not found yet)
  prices: (symbol: string, timeframe = "1d", limit = 200) =>
    fetchAPISafe<any[]>(`/api/v1/prices/${symbol}?timeframe=${timeframe}&limit=${limit}`, []),

  fetchPrices: fetchPricesDeduped,

  latestPrice: (symbol: string) =>
    fetchAPI<any>(`/api/v1/prices/${symbol}/latest`),

  // Indicators
  indicators: (symbol: string, timeframe = "1d", limit = 200) =>
    fetchAPI<any>(`/api/v1/indicators/${symbol}/calculate?timeframe=${timeframe}&limit=${limit}`),

  // Pattern History (all candle patterns for chart overlay)
  patternHistory: (symbol: string, timeframe = "1d", limit = 500) =>
    fetchAPI<any>(`/api/v1/indicators/${symbol}/patterns?timeframe=${timeframe}&limit=${limit}`),

  // Composite Score (advanced multi-factor)
  compositeScore: (symbol: string, timeframe = "1d") =>
    fetchAPI<any>(`/api/v1/indicators/${symbol}/composite?timeframe=${timeframe}`),

  // Multi-Timeframe Confluence
  mtfConfluence: (symbol: string) =>
    fetchAPI<any>(`/api/v1/indicators/${symbol}/mtf`),

  // Macro
  goldMacroSummary: () => fetchAPI<any>(`/api/v1/macro/gold/summary`),
  cotGold: () => fetchAPI<any>(`/api/v1/macro/cot/gold`),

  // Order Book (deeper depth for accumulation zones)
  orderBook: (symbol: string, depth = 100) =>
    fetchAPI<any>(`/api/v1/prices/${symbol}/orderbook?depth=${depth}`),

  // ML Prediction
  mlPredict: (symbol: string, timeframe = "1d") =>
    fetchAPI<any>(`/api/v1/ml/${symbol}/predict?timeframe=${timeframe}`),

  // Market Regime
  mlRegime: (symbol: string, timeframe = "1d") =>
    fetchAPI<any>(`/api/v1/ml/${symbol}/regime?timeframe=${timeframe}`),

  // Order Flow Analysis
  orderFlow: (symbol: string, depth = 50) =>
    fetchAPI<any>(`/api/v1/ml/${symbol}/orderflow?depth=${depth}`),

  // Institutional Heat Score
  institutionalHeat: (symbol: string, timeframe = "1d") =>
    fetchAPI<any>(`/api/v1/ml/${symbol}/heat?timeframe=${timeframe}`),

  // Gold Correlations (DXY, 10Y Treasury)
  goldCorrelations: () =>
    fetchAPI<any>(`/api/v1/macro/correlations/gold`),

  // ── Institutional / On-chain ──
  btcWhales: (minBtc = 100, limit = 20) =>
    fetchAPI<any>(`/api/v1/institutional/btc-whales?min_value_btc=${minBtc}&limit=${limit}`),

  ethWhales: (minEth = 100, limit = 20) =>
    fetchAPI<any>(`/api/v1/institutional/whale-transfers?min_value_eth=${minEth}&limit=${limit}`),

  cotReport: (symbol: string, limit = 52) =>
    fetchAPI<any>(`/api/v1/institutional/cot/${symbol}?limit=${limit}`),

  // ── Scalper Mode ──
  scalperScan: (symbol: string, timeframe = "15m") =>
    fetchAPI<any>(`/api/v1/scalper/${symbol}/scan?timeframe=${timeframe}`),

  scalperScanAll: (symbol: string) =>
    fetchAPI<any>(`/api/v1/scalper/${symbol}/scan`, { method: "POST" }),

  scalperSignals: (symbol: string, status?: string, timeframe?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (timeframe) params.set("timeframe", timeframe);
    params.set("limit", String(limit));
    return fetchAPI<any>(`/api/v1/scalper/${symbol}/signals?${params}`);
  },

  scalperSignalDetail: (symbol: string, signalId: number) =>
    fetchAPI<any>(`/api/v1/scalper/${symbol}/signals/${signalId}`),

  scalperJournal: (symbol: string, limit = 50) =>
    fetchAPI<any>(`/api/v1/scalper/${symbol}/journal?limit=${limit}`),

  scalperAnalytics: (symbol: string) =>
    fetchAPI<any>(`/api/v1/scalper/${symbol}/analytics`),

  scalperLossPatterns: (symbol: string) =>
    fetchAPI<any>(`/api/v1/scalper/${symbol}/loss-patterns`),
};
