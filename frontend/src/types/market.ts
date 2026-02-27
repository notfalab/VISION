export interface OHLCV {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  price: number;
  volume_24h: number;
  change_pct: number;
  high_24h: number;
  low_24h: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  symbol: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface IndicatorResult {
  name: string;
  values: Record<string, number>;
  signals: string[];
  metadata: Record<string, unknown>;
}

export interface TradeScore {
  symbol: string;
  score: number;        // 0-100
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;   // 0-1
  factors: ScoreFactor[];
  action: string;       // "Sell gold now — OBV divergence + COT shift"
  timestamp: string;
}

export interface ScoreFactor {
  name: string;
  weight: number;
  signal: "bullish" | "bearish" | "neutral";
  value: number;
}

export interface Asset {
  id: number;
  symbol: string;
  name: string;
  market_type: "commodity";
}

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
