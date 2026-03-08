"use client";

import { MousePointer, Minus, TrendingUp, Trash2 } from "lucide-react";

export type DrawingMode = "none" | "hline" | "trendline";

interface DrawingToolbarProps {
  mode: DrawingMode;
  onModeChange: (mode: DrawingMode) => void;
  onClearAll: () => void;
  drawingCount: number;
}

const TOOLS = [
  { id: "none" as const, icon: MousePointer, label: "Select" },
  { id: "hline" as const, icon: Minus, label: "H-Line" },
  { id: "trendline" as const, icon: TrendingUp, label: "Trend" },
];

const ACTIVE_COLORS: Record<DrawingMode, string> = {
  none: "var(--color-text-muted)",
  hline: "#f59e0b",
  trendline: "#3b82f6",
};

export default function DrawingToolbar({ mode, onModeChange, onClearAll, drawingCount }: DrawingToolbarProps) {
  return (
    <div className="flex items-center gap-px">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = mode === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => onModeChange(tool.id === mode ? "none" : tool.id)}
            className={`px-1.5 py-1 text-[10px] font-mono rounded transition-all flex items-center gap-1 ${
              isActive
                ? "font-semibold"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
            style={isActive ? { color: ACTIVE_COLORS[tool.id], backgroundColor: `${ACTIVE_COLORS[tool.id]}20` } : undefined}
            title={tool.label}
          >
            <Icon className="w-3 h-3" />
            <span className="hidden sm:inline">{tool.label}</span>
          </button>
        );
      })}
      {drawingCount > 0 && (
        <>
          <div className="w-px h-4 bg-[var(--color-border-primary)] mx-1" />
          <button
            onClick={onClearAll}
            className="px-1.5 py-1 text-[10px] font-mono rounded text-[var(--color-bear)] hover:bg-[var(--color-bear)]/10 flex items-center gap-1"
            title="Clear all drawings"
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden sm:inline">{drawingCount}</span>
          </button>
        </>
      )}
    </div>
  );
}
