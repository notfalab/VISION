const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
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
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/latest`, null),

  // Indicators
  indicators: (symbol: string, timeframe = "1d", limit = 200) =>
    fetchAPISafe<any>(`/api/v1/indicators/${symbol}/calculate?timeframe=${timeframe}&limit=${limit}`, null),

  // Pattern History (all candle patterns for chart overlay)
  patternHistory: (symbol: string, timeframe = "1d", limit = 500) =>
    fetchAPISafe<any>(`/api/v1/indicators/${symbol}/patterns?timeframe=${timeframe}&limit=${limit}`, { patterns: [] }),

  // Composite Score (advanced multi-factor)
  compositeScore: (symbol: string, timeframe = "1d") =>
    fetchAPISafe<any>(`/api/v1/indicators/${symbol}/composite?timeframe=${timeframe}`, null),

  // Multi-Timeframe Confluence
  mtfConfluence: (symbol: string) =>
    fetchAPISafe<any>(`/api/v1/indicators/${symbol}/mtf`, null),

  // Macro
  goldMacroSummary: () => fetchAPISafe<any>(`/api/v1/macro/gold/summary`, null),
  cotGold: () => fetchAPISafe<any>(`/api/v1/macro/cot/gold`, null),

  // Order Book (deeper depth for accumulation zones)
  orderBook: (symbol: string, depth = 100) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/orderbook?depth=${depth}`, null),

  // ML Prediction
  mlPredict: (symbol: string, timeframe = "1d") =>
    fetchAPISafe<any>(`/api/v1/ml/${symbol}/predict?timeframe=${timeframe}`, null),

  // Market Regime
  mlRegime: (symbol: string, timeframe = "1d") =>
    fetchAPISafe<any>(`/api/v1/ml/${symbol}/regime?timeframe=${timeframe}`, null),

  // Order Flow Analysis
  orderFlow: (symbol: string, depth = 50) =>
    fetchAPISafe<any>(`/api/v1/ml/${symbol}/orderflow?depth=${depth}`, null),

  // Institutional Heat Score
  institutionalHeat: (symbol: string, timeframe = "1d") =>
    fetchAPISafe<any>(`/api/v1/ml/${symbol}/heat?timeframe=${timeframe}`, null),

  // Gold Correlations (DXY, 10Y Treasury)
  goldCorrelations: () =>
    fetchAPISafe<any>(`/api/v1/macro/correlations/gold`, null),

  // ── Institutional / On-chain ──
  btcWhales: (minBtc = 100, limit = 20) =>
    fetchAPISafe<any>(`/api/v1/institutional/btc-whales?min_value_btc=${minBtc}&limit=${limit}`, null),

  ethWhales: (minEth = 100, limit = 20) =>
    fetchAPISafe<any>(`/api/v1/institutional/whale-transfers?min_value_eth=${minEth}&limit=${limit}`, null),

  cotReport: (symbol: string, limit = 52) =>
    fetchAPISafe<any>(`/api/v1/institutional/cot/${symbol}?limit=${limit}`, null),

  // ── Scalper Mode ──
  scalperScan: (symbol: string, timeframe = "15m") =>
    fetchAPISafe<any>(`/api/v1/scalper/${symbol}/scan?timeframe=${timeframe}`, null),

  scalperScanAll: (symbol: string) =>
    fetchAPISafe<any>(`/api/v1/scalper/${symbol}/scan`, null, { method: "POST" }),

  scalperSignals: (symbol: string, status?: string, timeframe?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (timeframe) params.set("timeframe", timeframe);
    params.set("limit", String(limit));
    return fetchAPISafe<any>(`/api/v1/scalper/${symbol}/signals?${params}`, { signals: [] });
  },

  scalperSignalDetail: (symbol: string, signalId: number) =>
    fetchAPISafe<any>(`/api/v1/scalper/${symbol}/signals/${signalId}`, null),

  scalperJournal: (symbol: string, limit = 50) =>
    fetchAPISafe<any>(`/api/v1/scalper/${symbol}/journal?limit=${limit}`, { signals: [] }),

  scalperAnalytics: (symbol: string) =>
    fetchAPISafe<any>(`/api/v1/scalper/${symbol}/analytics`, null),

  scalperLossPatterns: (symbol: string) =>
    fetchAPISafe<any>(`/api/v1/scalper/${symbol}/loss-patterns`, null),

  // Zones (supply/demand, S/R, order blocks, FVG)
  scalperZones: (symbol: string, tf: string = "15m") =>
    fetchAPISafe<any>(`/api/v1/scalper/${symbol}/zones?timeframe=${tf}`, { zones: {} }),

  // AI Market Brief
  aiBrief: () =>
    fetchAPISafe<any>(`/api/v1/scalper/ai-brief`, null),

  // ── TP/SL Heatmap, Liquidation, Deep Order Book ──
  tpslHeatmap: (symbol: string, depth = 500) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/tpsl-heatmap?depth=${depth}`, {
      tp_clusters: [], sl_clusters: [], round_levels: [], current_price: 0,
    }),

  liquidationMap: (symbol: string) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/liquidation-map`, {
      levels: [], current_price: 0, symbol,
    }),

  liquidationHeatmap: (symbol: string, timeframe = "1h", limit = 200) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/liquidation-heatmap?timeframe=${timeframe}&limit=${limit}`, {
      columns: [], price_min: 0, price_max: 0, price_step: 0, n_levels: 0,
    }),

  deepOrderBook: (symbol: string, depth = 1000) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/orderbook-deep?depth=${depth}`, {
      bids: [], asks: [], stats: {},
    }),

  // Stop Heatmap (2D stop-loss density grid)
  stopHeatmap: (symbol: string, timeframe = "1h", limit = 200) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/stop-heatmap?timeframe=${timeframe}&limit=${limit}`, {
      columns: [], price_min: 0, price_max: 0, price_step: 0, n_levels: 0,
    }),

  // MBO Profile (orderbook depth segmentation)
  mboProfile: (symbol: string, depth = 500) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/mbo-profile?depth=${depth}`, {
      bids: [], asks: [], current_price: 0, max_volume: 0, bucket_size: 0,
    }),

  // Economic Calendar
  calendarEvents: (days = 7) =>
    fetchAPISafe<any>(`/api/v1/calendar/events?days=${days}`, {
      events: [], count: 0,
    }),

  // News & Sentiment
  newsSentiment: (symbol: string) =>
    fetchAPISafe<any>(`/api/v1/news/sentiment/${symbol}`, {
      aggregate_score: 50, aggregate_label: "Neutral",
      crypto_fear_greed: null, market_fear_greed: null,
      news_sentiment: null,
    }),

  // ── Premium Features ──

  // AI Market Narrator
  narrator: (symbol: string, timeframe = "1d") =>
    fetchAPISafe<any>(`/api/v1/narrator/${symbol}?timeframe=${timeframe}`, null),

  // Volume Profile (VAH/VAL/POC)
  volumeProfile: (symbol: string, timeframe = "1d", limit = 200, buckets = 50) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/volume-profile?timeframe=${timeframe}&limit=${limit}&buckets=${buckets}`, null),

  // Predictive Volatility
  volatilityForecast: (symbol: string, timeframe = "1d") =>
    fetchAPISafe<any>(`/api/v1/ml/${symbol}/volatility?timeframe=${timeframe}`, null),

  // Institutional vs Retail Divergence
  divergence: (symbol: string) =>
    fetchAPISafe<any>(`/api/v1/divergence/${symbol}`, null),

  // Predictive Liquidity Heatmap
  liquidityForecast: (symbol: string, timeframe = "1h", limit = 200) =>
    fetchAPISafe<any>(`/api/v1/prices/${symbol}/liquidity-forecast?timeframe=${timeframe}&limit=${limit}`, null),
};
