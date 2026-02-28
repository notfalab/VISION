/**
 * Binance WebSocket client for real-time price + kline streaming.
 * Streams gold (XAUUSD) via PAXG token proxy.
 */

export interface LivePrice {
  price: number;
  change: number; // 24h %
  high24h: number;
  low24h: number;
  volume: number;
}

export interface LiveCandle {
  timestamp: number; // open time ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean; // true when candle closed
}

type PriceCallback = (symbol: string, data: LivePrice) => void;
type KlineCallback = (symbol: string, candle: LiveCandle) => void;

const SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "paxgusdt",
  BTCUSD: "btcusdt",
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k])
);

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
};

export function isBinanceSymbol(symbol: string): boolean {
  return symbol in SYMBOL_MAP;
}

class BinanceWebSocket {
  private ws: WebSocket | null = null;
  private callback: PriceCallback | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private symbols: string[] = [];
  private intentionalClose = false;

  connect(symbols: string[], callback: PriceCallback) {
    this.symbols = symbols;
    this.callback = callback;
    this.intentionalClose = false;
    this._connect();
  }

  private _connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const streams = this.symbols
      .map((s) => SYMBOL_MAP[s])
      .filter(Boolean)
      .map((s) => `${s}@miniTicker`)
      .join("/");

    if (!streams) return;

    try {
      this.ws = new WebSocket(
        `wss://stream.binance.com:9443/stream?streams=${streams}`
      );

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const d = msg.data;
          if (!d?.s) return;

          const ourSymbol = REVERSE_MAP[d.s.toLowerCase()];
          if (ourSymbol && this.callback) {
            this.callback(ourSymbol, {
              price: parseFloat(d.c),
              change:
                parseFloat(d.o) > 0
                  ? ((parseFloat(d.c) - parseFloat(d.o)) / parseFloat(d.o)) * 100
                  : 0,
              high24h: parseFloat(d.h),
              low24h: parseFloat(d.l),
              volume: parseFloat(d.v),
            });
          }
        } catch {
          // ignore
        }
      };

      this.ws.onclose = () => {
        if (!this.intentionalClose) {
          this.reconnectTimer = setTimeout(() => this._connect(), 3000);
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.reconnectTimer = setTimeout(() => this._connect(), 5000);
    }
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.callback = null;
  }
}

/**
 * Kline (candlestick) WebSocket — streams real-time candle updates
 * for a single symbol + timeframe.
 */
class BinanceKlineWS {
  private ws: WebSocket | null = null;
  private callback: KlineCallback | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private currentSymbol = "";
  private currentTf = "";

  subscribe(symbol: string, timeframe: string, callback: KlineCallback) {
    if (this.currentSymbol === symbol && this.currentTf === timeframe && this.ws?.readyState === WebSocket.OPEN) {
      this.callback = callback;
      return;
    }

    this.close();
    this.currentSymbol = symbol;
    this.currentTf = timeframe;
    this.callback = callback;
    this.intentionalClose = false;
    this._connect();
  }

  private _connect() {
    const binanceSymbol = SYMBOL_MAP[this.currentSymbol];
    if (!binanceSymbol) return;

    const interval = TF_MAP[this.currentTf] || "1m";

    try {
      this.ws = new WebSocket(
        `wss://stream.binance.com:9443/ws/${binanceSymbol}@kline_${interval}`
      );

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const k = msg.k;
          if (!k) return;

          const ourSymbol = REVERSE_MAP[k.s.toLowerCase()];
          if (ourSymbol && this.callback) {
            this.callback(ourSymbol, {
              timestamp: k.t,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
              isFinal: k.x,
            });
          }
        } catch {
          // ignore
        }
      };

      this.ws.onclose = () => {
        if (!this.intentionalClose) {
          this.reconnectTimer = setTimeout(() => this._connect(), 3000);
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.reconnectTimer = setTimeout(() => this._connect(), 5000);
    }
  }

  close() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const binanceWS = new BinanceWebSocket();
export const binanceKlineWS = new BinanceKlineWS();
