import { create } from "zustand";

export type ThemeName = "dim" | "dark";

interface ThemeState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "vision_theme";

function readStored(): ThemeName {
  if (typeof window === "undefined") return "dim";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" ? "dark" : "dim";
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readStored(),
  setTheme: (t) => {
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },
  toggleTheme: () => {
    const next = get().theme === "dim" ? "dark" : "dim";
    get().setTheme(next);
  },
}));

/* ── CSS variable overrides per theme ── */
// "dim" = null means use @theme defaults from globals.css
export const THEME_CSS_VARS: Record<ThemeName, Record<string, string> | null> = {
  dim: null, // default values from @theme
  dark: {
    "--color-bg-primary": "#060010",
    "--color-bg-secondary": "#0a0014",
    "--color-bg-card": "#060010",
    "--color-bg-elevated": "#0e0820",
    "--color-bg-hover": "#1c1530",
    "--color-border-primary": "#1c1530",
    "--color-border-accent": "rgba(139, 92, 246, 0.2)",
    "--color-border-glow": "rgba(139, 92, 246, 0.5)",
    "--color-neon-blue": "#a78bfa",
    "--color-neon-cyan": "#c4b5fd",
    "--color-neon-red": "#8b5cf6",
    "--color-bull": "#10b981",
    "--color-bear": "#8b5cf6",
    "--color-neutral": "#a78bfa",
    "--color-glass-from": "rgba(6, 0, 16, 0.95)",
    "--color-glass-to": "rgba(10, 0, 20, 0.95)",
    "--color-grid-line": "rgba(139, 92, 246, 0.03)",
  },
};

// All dark override keys for removal when switching back to dim
const DARK_KEYS = Object.keys(THEME_CSS_VARS.dark!);

export function applyThemeVars(t: ThemeName) {
  const el = document.documentElement;
  const vars = THEME_CSS_VARS[t];
  if (vars) {
    // Set dark overrides as inline styles (highest specificity)
    for (const [key, val] of Object.entries(vars)) {
      el.style.setProperty(key, val);
    }
  } else {
    // Remove inline overrides to let @theme defaults take over
    for (const key of DARK_KEYS) {
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
}

export const THEME_CANVAS: Record<ThemeName, CanvasColors> = {
  dim: {
    bull: "#10b981",
    bear: "#ef4444",
    bullAlpha: "rgba(16, 185, 129, 0.3)",
    bearAlpha: "rgba(239, 68, 68, 0.3)",
    grid: "rgba(30, 41, 59, 0.5)",
    textMuted: "#64748b",
    priceLine: "#3b82f6",
    patternBull: "#00e676",
    patternBear: "#ff1744",
    patternNeutral: "#ffab00",
    zonesBuy: [16, 185, 129],
    zonesSell: [239, 68, 68],
    shiftNew: [250, 204, 21],
    shiftGrowing: [16, 185, 129],
    shiftShrinking: [239, 68, 68],
    shiftGone: [148, 163, 184],
  },
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
  },
};
