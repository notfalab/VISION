const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Global in-memory cache with TTL ──
interface CacheEntry {
  data: unknown;
  ts: number;
  ttl: number;
}

const _cache = new Map<string, CacheEntry>();
const _inflight = new Map<string, Promise<unknown>>();

/** TTL categories (ms) */
const TTL = {
  prices:     10_000,   // 10 s
  orderflow:  15_000,   // 15 s
  indicators: 30_000,   // 30 s
  ml:         60_000,   // 1 min
  news:       60_000,   // 1 min
  calendar:  120_000,   // 2 min
  macro:     300_000,   // 5 min
  cot:     3_600_000,   // 1 hr
  default:    20_000,   // 20 s
} as const;

function getCached<T>(key: string): T | undefined {
  const e = _cache.get(key);
  return e ? (e.data as T) : undefined;
}

function isFresh(key: string): boolean {
  const e = _cache.get(key);
  if (!e) return false;
  return Date.now() - e.ts <= e.ttl;
}

function setCache(key: string, data: unknown, ttl: number): void {
  _cache.set(key, { data, ts: Date.now(), ttl });
}

/** Remove all cache entries whose key contains the given substring. */
export function clearSymbolCache(symbol: string): void {
  for (const key of _cache.keys()) {
    if (key.includes(symbol)) _cache.delete(key);
  }
}

// Purge extremely stale entries every 5 min
if (typeof window !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, e] of _cache) {
      if (now - e.ts > e.ttl * 5) _cache.delete(key);
    }
  }, 300_000);
}

// ── Core fetch helpers ──

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

/**
 * Fetch with in-memory cache + request deduplication.
 * - If the cache entry is fresh, returns immediately (no HTTP request).
 * - If a request for the same key is already in-flight, piggy-backs on it.
 * - On error, returns stale cache if available, otherwise the fallback value.
 */
async function fetchCached<T>(
  path: string,
  key: string,
  ttl: number,
  fallback: T,
  options?: RequestInit,
): Promise<T> {
  // 1. Fresh cache → instant return
  if (isFresh(key)) return getCached<T>(key) as T;

  // 2. Deduplicate — reuse in-flight promise
  const existing = _inflight.get(key);
  if (existing) return existing as Promise<T>;

  // 3. Fetch, cache on success, fallback on error
  const promise = fetchAPI<T>(path, options)
    .then((data) => {
      setCache(key, data, ttl);
      return data;
    })
    .catch(() => {
      // Return stale cache if available, otherwise fallback
      return getCached<T>(key) ?? fallback;
    })
    .finally(() => {
      _inflight.delete(key);
    });

  _inflight.set(key, promise);
  return promise;
}

/** Like fetchCached but for POST endpoints (e.g. fetchPrices trigger). */
function fetchCachedPost<T>(
  path: string,
  key: string,
  ttl: number,
  fallback: T,
): Promise<T> {
  return fetchCached(path, key, ttl, fallback, { method: "POST" });
}

// ── Public API ──

export const api = {
  // Health
  health: () => fetchAPI<{ status: string }>("/health"),

  // Assets
  assets: () =>
    fetchCached<{ id: number; symbol: string; name: string; market_type: string }[]>(
      "/api/v1/assets", "assets", TTL.macro, [],
    ),

  // Prices (OHLCV array)
  prices: (symbol: string, timeframe = "1d", limit = 200) =>
    fetchCached<any[]>(
      `/api/v1/prices/${symbol}?timeframe=${timeframe}&limit=${limit}`,
      `prices:${symbol}:${timeframe}:${limit}`,
      TTL.prices,
      [],
    ),

  // Trigger price ingestion (deduped POST)
  fetchPrices: (symbol: string, timeframe = "1d", limit = 200) =>
    fetchCachedPost<{ rows_ingested: number }>(
      `/api/v1/prices/${symbol}/fetch?timeframe=${timeframe}&limit=${limit}`,
      `fetchPrices:${symbol}:${timeframe}:${limit}`,
      TTL.prices,
      { rows_ingested: 0 },
    ),

  latestPrice: (symbol: string) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/latest`,
      `latest:${symbol}`,
      TTL.prices,
      null,
    ),

  // Indicators
  indicators: (symbol: string, timeframe = "1d", limit = 200) =>
    fetchCached<any>(
      `/api/v1/indicators/${symbol}/calculate?timeframe=${timeframe}&limit=${limit}`,
      `indicators:${symbol}:${timeframe}:${limit}`,
      TTL.indicators,
      null,
    ),

  // Pattern History
  patternHistory: (symbol: string, timeframe = "1d", limit = 500) =>
    fetchCached<any>(
      `/api/v1/indicators/${symbol}/patterns?timeframe=${timeframe}&limit=${limit}`,
      `patterns:${symbol}:${timeframe}:${limit}`,
      TTL.indicators,
      { patterns: [] },
    ),

  // Composite Score
  compositeScore: (symbol: string, timeframe = "1d") =>
    fetchCached<any>(
      `/api/v1/indicators/${symbol}/composite?timeframe=${timeframe}`,
      `composite:${symbol}:${timeframe}`,
      TTL.indicators,
      null,
    ),

  // Multi-Timeframe Confluence
  mtfConfluence: (symbol: string) =>
    fetchCached<any>(
      `/api/v1/indicators/${symbol}/mtf`,
      `mtf:${symbol}`,
      TTL.indicators,
      null,
    ),

  // Macro
  goldMacroSummary: () =>
    fetchCached<any>(`/api/v1/macro/gold/summary`, "goldMacro", TTL.macro, null),

  cotGold: () =>
    fetchCached<any>(`/api/v1/macro/cot/gold`, "cotGold", TTL.cot, null),

  // Order Book
  orderBook: (symbol: string, depth = 100) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/orderbook?depth=${depth}`,
      `orderbook:${symbol}:${depth}`,
      TTL.orderflow,
      null,
    ),

  // ML Prediction
  mlPredict: (symbol: string, timeframe = "1d") =>
    fetchCached<any>(
      `/api/v1/ml/${symbol}/predict?timeframe=${timeframe}`,
      `mlPredict:${symbol}:${timeframe}`,
      TTL.ml,
      null,
    ),

  // Market Regime
  mlRegime: (symbol: string, timeframe = "1d") =>
    fetchCached<any>(
      `/api/v1/ml/${symbol}/regime?timeframe=${timeframe}`,
      `mlRegime:${symbol}:${timeframe}`,
      TTL.ml,
      null,
    ),

  // Order Flow Analysis
  orderFlow: (symbol: string, depth = 50) =>
    fetchCached<any>(
      `/api/v1/ml/${symbol}/orderflow?depth=${depth}`,
      `orderflow:${symbol}:${depth}`,
      TTL.orderflow,
      null,
    ),

  // Institutional Heat Score
  institutionalHeat: (symbol: string, timeframe = "1d") =>
    fetchCached<any>(
      `/api/v1/ml/${symbol}/heat?timeframe=${timeframe}`,
      `instHeat:${symbol}:${timeframe}`,
      TTL.indicators,
      null,
    ),

  // Gold Correlations (DXY, 10Y Treasury)
  goldCorrelations: () =>
    fetchCached<any>(`/api/v1/macro/correlations/gold`, "goldCorr", TTL.macro, null),

  // ── Institutional / On-chain ──
  btcWhales: (minBtc = 100, limit = 20) =>
    fetchCached<any>(
      `/api/v1/institutional/btc-whales?min_value_btc=${minBtc}&limit=${limit}`,
      `btcWhales:${minBtc}:${limit}`,
      TTL.ml,
      null,
    ),

  ethWhales: (minEth = 100, limit = 20) =>
    fetchCached<any>(
      `/api/v1/institutional/whale-transfers?min_value_eth=${minEth}&limit=${limit}`,
      `ethWhales:${minEth}:${limit}`,
      TTL.ml,
      null,
    ),

  cryptoWhales: (symbol: string, limit = 20) =>
    fetchCached<any>(
      `/api/v1/institutional/crypto-whales/${symbol}?limit=${limit}`,
      `cryptoWhales:${symbol}:${limit}`,
      TTL.ml,
      null,
    ),

  cotReport: (symbol: string, limit = 52) =>
    fetchCached<any>(
      `/api/v1/institutional/cot/${symbol}?limit=${limit}`,
      `cotReport:${symbol}:${limit}`,
      TTL.cot,
      null,
    ),

  // ── Scalper Mode ──
  scalperScan: (symbol: string, timeframe = "15m") =>
    fetchCached<any>(
      `/api/v1/scalper/${symbol}/scan?timeframe=${timeframe}`,
      `scalperScan:${symbol}:${timeframe}`,
      TTL.indicators,
      null,
    ),

  scalperScanAll: (symbol: string) =>
    fetchCachedPost<any>(
      `/api/v1/scalper/${symbol}/scan`,
      `scalperScanAll:${symbol}`,
      TTL.indicators,
      null,
    ),

  scalperSignals: (symbol: string, status?: string, timeframe?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (timeframe) params.set("timeframe", timeframe);
    params.set("limit", String(limit));
    return fetchCached<any>(
      `/api/v1/scalper/${symbol}/signals?${params}`,
      `scalperSignals:${symbol}:${status}:${timeframe}:${limit}`,
      TTL.indicators,
      { signals: [] },
    );
  },

  scalperSignalDetail: (symbol: string, signalId: number) =>
    fetchCached<any>(
      `/api/v1/scalper/${symbol}/signals/${signalId}`,
      `scalperSignalDetail:${symbol}:${signalId}`,
      TTL.default,
      null,
    ),

  scalperJournal: (symbol: string, limit = 50) =>
    fetchCached<any>(
      `/api/v1/scalper/${symbol}/journal?limit=${limit}`,
      `scalperJournal:${symbol}:${limit}`,
      TTL.indicators,
      { signals: [] },
    ),

  scalperAnalytics: (symbol: string) =>
    fetchCached<any>(
      `/api/v1/scalper/${symbol}/analytics`,
      `scalperAnalytics:${symbol}`,
      TTL.indicators,
      null,
    ),

  scalperLossPatterns: (symbol: string) =>
    fetchCached<any>(
      `/api/v1/scalper/${symbol}/loss-patterns`,
      `scalperLossPatterns:${symbol}`,
      TTL.indicators,
      null,
    ),

  // Zones (supply/demand, S/R, order blocks, FVG)
  scalperZones: (symbol: string, tf: string = "15m") =>
    fetchCached<any>(
      `/api/v1/scalper/${symbol}/zones?timeframe=${tf}`,
      `zones:${symbol}:${tf}`,
      TTL.indicators,
      { zones: {} },
    ),

  // Zone Retest Probability
  zoneRetestProbability: (symbol: string, tf: string = "15m") =>
    fetchCached<any>(
      `/api/v1/scalper/${symbol}/zone-retest?timeframe=${tf}`,
      `zoneRetest:${symbol}:${tf}`,
      TTL.indicators,
      null,
    ),

  // AI Market Brief
  aiBrief: () =>
    fetchCached<any>(`/api/v1/scalper/ai-brief`, "aiBrief", TTL.news, null),

  // ── TP/SL Heatmap, Liquidation, Deep Order Book ──
  tpslHeatmap: (symbol: string, depth = 500) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/tpsl-heatmap?depth=${depth}`,
      `tpsl:${symbol}:${depth}`,
      TTL.orderflow,
      { tp_clusters: [], sl_clusters: [], round_levels: [], current_price: 0 },
    ),

  liquidationMap: (symbol: string) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/liquidation-map`,
      `liqMap:${symbol}`,
      TTL.orderflow,
      { levels: [], current_price: 0, symbol },
    ),

  liquidationHeatmap: (symbol: string, timeframe = "1h", limit = 200) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/liquidation-heatmap?timeframe=${timeframe}&limit=${limit}`,
      `liqHeatmap:${symbol}:${timeframe}:${limit}`,
      TTL.orderflow,
      { columns: [], price_min: 0, price_max: 0, price_step: 0, n_levels: 0 },
    ),

  deepOrderBook: (symbol: string, depth = 1000) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/orderbook-deep?depth=${depth}`,
      `deepOB:${symbol}:${depth}`,
      TTL.orderflow,
      { bids: [], asks: [], stats: {} },
    ),

  // Stop Heatmap
  stopHeatmap: (symbol: string, timeframe = "1h", limit = 200) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/stop-heatmap?timeframe=${timeframe}&limit=${limit}`,
      `stopHeat:${symbol}:${timeframe}:${limit}`,
      TTL.orderflow,
      { columns: [], price_min: 0, price_max: 0, price_step: 0, n_levels: 0 },
    ),

  // MBO Profile
  mboProfile: (symbol: string, depth = 500) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/mbo-profile?depth=${depth}`,
      `mbo:${symbol}:${depth}`,
      TTL.orderflow,
      { bids: [], asks: [], current_price: 0, max_volume: 0, bucket_size: 0 },
    ),

  // Economic Calendar
  calendarEvents: (days = 7) =>
    fetchCached<any>(
      `/api/v1/calendar/events?days=${days}`,
      `calendar:${days}`,
      TTL.calendar,
      { events: [], count: 0 },
    ),

  // News & Sentiment
  newsSentiment: (symbol: string) =>
    fetchCached<any>(
      `/api/v1/news/sentiment/${symbol}`,
      `sentiment:${symbol}`,
      TTL.news,
      { aggregate_score: 50, aggregate_label: "Neutral", crypto_fear_greed: null, market_fear_greed: null, news_sentiment: null },
    ),

  // ── Premium Features ──

  // AI Market Narrator
  narrator: (symbol: string, timeframe = "1d") =>
    fetchCached<any>(
      `/api/v1/narrator/${symbol}?timeframe=${timeframe}`,
      `narrator:${symbol}:${timeframe}`,
      TTL.news,
      null,
    ),

  // Volume Profile (VAH/VAL/POC)
  volumeProfile: (symbol: string, timeframe = "1d", limit = 200, buckets = 50) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/volume-profile?timeframe=${timeframe}&limit=${limit}&buckets=${buckets}`,
      `volProfile:${symbol}:${timeframe}:${limit}`,
      TTL.indicators,
      null,
    ),

  // Predictive Volatility
  volatilityForecast: (symbol: string, timeframe = "1d") =>
    fetchCached<any>(
      `/api/v1/ml/${symbol}/volatility?timeframe=${timeframe}`,
      `volatility:${symbol}:${timeframe}`,
      TTL.ml,
      null,
    ),

  // Institutional vs Retail Divergence
  divergence: (symbol: string) =>
    fetchCached<any>(
      `/api/v1/divergence/${symbol}`,
      `divergence:${symbol}`,
      TTL.indicators,
      null,
    ),

  // Predictive Liquidity Heatmap
  liquidityForecast: (symbol: string, timeframe = "1h", limit = 200) =>
    fetchCached<any>(
      `/api/v1/prices/${symbol}/liquidity-forecast?timeframe=${timeframe}&limit=${limit}`,
      `liqForecast:${symbol}:${timeframe}:${limit}`,
      TTL.indicators,
      null,
    ),

  // ── Market-wide endpoints ──

  marketOverview: () =>
    fetchCached<any>(
      "/api/v1/market/overview",
      "marketOverview",
      TTL.indicators,
      { tiles: [], count: 0 },
    ),

  marketCorrelations: (period = 30, group = "forex") =>
    fetchCached<any>(
      `/api/v1/market/correlations?period=${period}&group=${group}`,
      `correlations:${period}:${group}`,
      TTL.macro,
      { symbols: [], matrix: [], correlation_breaks: [] },
    ),

  institutionalSummary: (symbols?: string) =>
    fetchCached<any>(
      `/api/v1/market/institutional-summary${symbols ? `?symbols=${symbols}` : ""}`,
      `instSummary:${symbols ?? "all"}`,
      TTL.indicators,
      { symbols: [], count: 0 },
    ),

  // ── Admin Signals (authenticated) ──
  adminSignalsDashboard: (token: string) =>
    fetchCached<any>(
      `/api/v1/admin/signals/dashboard`,
      "adm:sig:dash",
      TTL.indicators,
      null,
      { headers: { Authorization: `Bearer ${token}` } },
    ),

  adminSignalsPositions: (token: string, params?: { status?: string; symbol?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.symbol) q.set("symbol", params.symbol);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return fetchCached<any[]>(
      `/api/v1/admin/signals/positions${qs ? `?${qs}` : ""}`,
      `adm:sig:pos:${qs}`,
      TTL.indicators,
      [],
      { headers: { Authorization: `Bearer ${token}` } },
    );
  },

  adminSignalsHistory: (token: string, params?: { symbol?: string; outcome?: string; from?: string; to?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.symbol) q.set("symbol", params.symbol);
    if (params?.outcome) q.set("outcome", params.outcome);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return fetchCached<any>(
      `/api/v1/admin/signals/history${qs ? `?${qs}` : ""}`,
      `adm:sig:hist:${qs}`,
      TTL.indicators,
      { page: 1, limit: 50, results: [] },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  },

  adminSignalsJournal: (token: string, params?: { from?: string; to?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return fetchCached<any[]>(
      `/api/v1/admin/signals/journal${qs ? `?${qs}` : ""}`,
      `adm:sig:journal:${qs}`,
      TTL.indicators,
      [],
      { headers: { Authorization: `Bearer ${token}` } },
    );
  },

  adminSignalsLearning: (token: string) =>
    fetchCached<any[]>(
      `/api/v1/admin/signals/learning`,
      "adm:sig:learn",
      TTL.indicators,
      [],
      { headers: { Authorization: `Bearer ${token}` } },
    ),

  adminSignalsResetLearning: (token: string) =>
    fetchAPI<any>(`/api/v1/admin/signals/learning/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
};
