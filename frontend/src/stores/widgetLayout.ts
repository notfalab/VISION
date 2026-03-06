import { create } from "zustand";

const STORAGE_KEY = "vision_widget_order";

/** Default widget order — matches the DashboardContent section layout */
export const DEFAULT_WIDGET_ORDER = [
  // Core
  "narrator", "trade-score",
  // Zones & Volume
  "zones", "volume-profile", "divergence", "liquidity-forecast",
  // Market Data
  "calendar", "sentiment", "volatility", "heatmap",
  // ML & Order Flow
  "ml-prediction", "order-flow", "tpsl", "deep-orderbook", "liquidation",
  // Institutional
  "mtf", "smart-money", "whale-tracker", "correlations", "gold-macro", "cot",
];

interface WidgetLayoutState {
  widgetOrder: string[];
  setWidgetOrder: (order: string[]) => void;
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

export const useWidgetLayoutStore = create<WidgetLayoutState>((set) => ({
  widgetOrder: readStored(),
  setWidgetOrder: (order) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    set({ widgetOrder: order });
  },
  resetOrder: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ widgetOrder: DEFAULT_WIDGET_ORDER });
  },
}));
