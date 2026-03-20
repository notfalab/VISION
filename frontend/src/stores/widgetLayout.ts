import { create } from "zustand";

const STORAGE_KEY = "vision_widget_order";
const HIDDEN_KEY = "vision_hidden_widgets";

/** Default widget order — Gold-focused layout */
export const DEFAULT_WIDGET_ORDER = [
  // Core
  "narrator", "trade-score",
  // Zones & Volume
  "zones", "zone-retest", "volume-profile", "divergence", "liquidity-forecast",
  // Market Data
  "calendar", "sentiment", "volatility",
  // ML & Order Flow
  "ml-prediction", "order-flow", "tpsl", "deep-orderbook",
  // Institutional
  "mtf", "smart-money", "whale-tracker", "gold-macro", "cot",
];

interface WidgetLayoutState {
  widgetOrder: string[];
  hiddenWidgets: string[];
  setWidgetOrder: (order: string[]) => void;
  toggleWidget: (id: string) => void;
  resetOrder: () => void;
}

function readStored(): string[] {
  if (typeof window === "undefined") return DEFAULT_WIDGET_ORDER;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge: keep stored order but add any new widgets at the end
        const combined = [...parsed];
        for (const id of DEFAULT_WIDGET_ORDER) {
          if (!combined.includes(id)) combined.push(id);
        }
        return combined;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDGET_ORDER;
}

function readHidden(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(HIDDEN_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return [];
}

export const useWidgetLayoutStore = create<WidgetLayoutState>((set) => ({
  widgetOrder: readStored(),
  hiddenWidgets: readHidden(),
  setWidgetOrder: (order) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    set({ widgetOrder: order });
  },
  toggleWidget: (id) => {
    set((state) => {
      const next = state.hiddenWidgets.includes(id)
        ? state.hiddenWidgets.filter((w) => w !== id)
        : [...state.hiddenWidgets, id];
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      return { hiddenWidgets: next };
    });
  },
  resetOrder: () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HIDDEN_KEY);
    set({ widgetOrder: DEFAULT_WIDGET_ORDER, hiddenWidgets: [] });
  },
}));
