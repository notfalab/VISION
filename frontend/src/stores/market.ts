import { create } from "zustand";
import type { OHLCV, Ticker, Timeframe } from "@/types/market";
import type { LivePrice } from "@/lib/binance-ws";

export type MarketType = "commodity";

/** Determine market type from symbol */
export function getMarketType(symbol: string): MarketType {
  return "commodity";
}

interface MarketState {
  // Active symbol + timeframe
  activeSymbol: string;
  activeTimeframe: Timeframe;
  setActiveSymbol: (s: string) => void;
  setActiveTimeframe: (tf: Timeframe) => void;

  // OHLCV data cache
  candles: Record<string, OHLCV[]>;
  setCandles: (key: string, data: OHLCV[]) => void;

  // Live tickers
  tickers: Record<string, Ticker>;
  updateTicker: (symbol: string, ticker: Ticker) => void;

  // Live prices from WebSocket
  livePrices: Record<string, LivePrice>;
  updateLivePrice: (symbol: string, data: LivePrice) => void;

  // Watchlist
  watchlist: string[];
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;

  // Loading / error
  loading: boolean;
  setLoading: (v: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  activeSymbol: "XAUUSD",
  activeTimeframe: "1d",
  setActiveSymbol: (s) => set({ activeSymbol: s }),
  setActiveTimeframe: (tf) => set({ activeTimeframe: tf }),

  candles: {},
  setCandles: (key, data) =>
    set((state) => ({ candles: { ...state.candles, [key]: data } })),

  tickers: {},
  updateTicker: (symbol, ticker) =>
    set((state) => ({ tickers: { ...state.tickers, [symbol]: ticker } })),

  livePrices: {},
  updateLivePrice: (symbol, data) =>
    set((state) => ({
      livePrices: { ...state.livePrices, [symbol]: data },
    })),

  watchlist: ["XAUUSD"],
  addToWatchlist: (symbol) =>
    set((state) => ({
      watchlist: state.watchlist.includes(symbol)
        ? state.watchlist
        : [...state.watchlist, symbol],
    })),
  removeFromWatchlist: (symbol) =>
    set((state) => ({
      watchlist: state.watchlist.filter((s) => s !== symbol),
    })),

  loading: false,
  setLoading: (v) => set({ loading: v }),
  error: null,
  setError: (e) => set({ error: e }),
}));
