import { create } from "zustand";

export type ThemeName = "dark" | "night";

interface ThemeState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "vision_theme";

function readStored(): ThemeName {
  if (typeof window === "undefined") return "dark";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "night") return "night";
  return "dark";
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readStored(),
  setTheme: (t) => {
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "night" : "dark";
    get().setTheme(next);
  },
}));

/* ── CSS variable overrides per theme ── */
// "dark" = null means use @theme defaults from globals.css (purple-accent theme)
export const THEME_CSS_VARS: Record<ThemeName, Record<string, string> | null> = {
  dark: null, // purple-accent theme from @theme defaults
  night: {
    "--color-bg-primary": "#000000",
    "--color-bg-secondary": "#050505",
    "--color-bg-card": "#080808",
    "--color-bg-elevated": "#0e0e0e",
    "--color-bg-hover": "#151515",
    "--color-border-primary": "#1a1a1a",
    "--color-border-accent": "rgba(255, 255, 255, 0.06)",
    "--color-border-glow": "rgba(255, 255, 255, 0.12)",
    "--color-text-primary": "#d4d4d8",
    "--color-text-secondary": "#7a7a82",
    "--color-text-muted": "#505058",
    "--color-neon-blue": "#3b82f6",
    "--color-neon-cyan": "#22d3ee",
    "--color-neon-red": "#ef4444",
    "--color-neon-green": "#10b981",
    "--color-neon-amber": "#f59e0b",
    "--color-neon-purple": "#8b5cf6",
    "--color-bull": "#10b981",
    "--color-bear": "#ef4444",
    "--color-neutral": "#6366f1",
    "--color-glass-from": "rgba(0, 0, 0, 0.97)",
    "--color-glass-to": "rgba(5, 5, 5, 0.97)",
    "--color-grid-line": "rgba(255, 255, 255, 0.015)",
  },
};

// All override keys for removal when switching back to default
const OVERRIDE_KEYS = Object.keys(THEME_CSS_VARS.night!);

export function applyThemeVars(t: ThemeName) {
  const el = document.documentElement;
  const vars = THEME_CSS_VARS[t];
  if (vars) {
    for (const [key, val] of Object.entries(vars)) {
      el.style.setProperty(key, val);
    }
  } else {
    // Remove inline overrides to let @theme defaults take over
    for (const key of OVERRIDE_KEYS) {
      el.style.removeProperty(key);
    }
  }
}

/* ── Canvas color palette per theme (for PriceChart & other canvas components) ── */

export interface CanvasColors {
  bull: string;
  bear: string;
  bullAlpha: string;
  bearAlpha: string;
  grid: string;
  textMuted: string;
  priceLine: string;
  patternBull: string;
  patternBear: string;
  patternNeutral: string;
  zonesBuy: [number, number, number];   // RGB tuple
  zonesSell: [number, number, number];
  shiftNew: [number, number, number];
  shiftGrowing: [number, number, number];
  shiftShrinking: [number, number, number];
  shiftGone: [number, number, number];
  // TP/SL heatmap colors
  tpZone: [number, number, number];     // green — take profit clusters
  slZone: [number, number, number];     // orange — stop loss clusters
  // Liquidation heatmap colors
  liqLong: [number, number, number];    // red — long liquidation levels
  liqShort: [number, number, number];   // green — short liquidation levels
}

export const THEME_CANVAS: Record<ThemeName, CanvasColors> = {
  dark: {
    bull: "#10b981",
    bear: "#8b5cf6",
    bullAlpha: "rgba(16, 185, 129, 0.3)",
    bearAlpha: "rgba(139, 92, 246, 0.3)",
    grid: "rgba(28, 21, 48, 0.6)",
    textMuted: "#64748b",
    priceLine: "#a78bfa",
    patternBull: "#10b981",
    patternBear: "#8b5cf6",
    patternNeutral: "#ffab00",
    zonesBuy: [16, 185, 129],
    zonesSell: [139, 92, 246],
    shiftNew: [250, 204, 21],
    shiftGrowing: [16, 185, 129],
    shiftShrinking: [139, 92, 246],
    shiftGone: [148, 163, 184],
    tpZone: [0, 230, 118],
    slZone: [255, 171, 0],
    liqLong: [139, 92, 246],
    liqShort: [16, 185, 129],
  },
  night: {
    bull: "#10b981",
    bear: "#ef4444",
    bullAlpha: "rgba(16, 185, 129, 0.2)",
    bearAlpha: "rgba(239, 68, 68, 0.2)",
    grid: "rgba(255, 255, 255, 0.03)",
    textMuted: "#505058",
    priceLine: "#3b82f6",
    patternBull: "#10b981",
    patternBear: "#ef4444",
    patternNeutral: "#f59e0b",
    zonesBuy: [16, 185, 129],
    zonesSell: [239, 68, 68],
    shiftNew: [250, 204, 21],
    shiftGrowing: [16, 185, 129],
    shiftShrinking: [239, 68, 68],
    shiftGone: [80, 80, 88],
    tpZone: [0, 230, 118],
    slZone: [255, 152, 0],
    liqLong: [239, 68, 68],
    liqShort: [16, 185, 129],
  },
};
