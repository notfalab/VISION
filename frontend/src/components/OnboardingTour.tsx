"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

const TOUR_FLAG = "vision_tour_completed";

interface TourStep {
  target: string;
  title: string;
  description: string;
}

const STEPS: TourStep[] = [
  {
    target: "[data-tour='chart']",
    title: "Price Chart",
    description: "Interactive candlestick chart with real-time data, moving averages, and multiple overlay modes (TP/SL, Liquidation, Stops, MBO). Use the toolbar to toggle overlays and take screenshots.",
  },
  {
    target: "[data-tour='widgets']",
    title: "Analysis Widgets",
    description: "Scrollable panel with 22+ widgets: AI Narrator, Trade Score, ML Predictions, Order Flow, Smart Money, and more. Drag to reorder, or click the gear icon to show/hide widgets.",
  },
  {
    target: "[data-tour='nav-heatmap']",
    title: "Global Heat Map",
    description: "See all 70+ instruments at a glance — color-coded by price change with regime badges and composite scores. Click any tile to open its dashboard.",
  },
  {
    target: "[data-tour='nav-charts']",
    title: "Multi-Chart",
    description: "Compare up to 9 charts side by side with independent symbols and timeframes. Each mini-chart supports overlay tools (LIQ, Stops, TP/SL, MBO, Walls).",
  },
  {
    target: "[data-tour='nav-academy']",
    title: "Trading Academy",
    description: "8 interactive chapters from basics to smart money concepts, with quizzes, badges, XP tracking, and a paper trading simulator.",
  },
  {
    target: "[data-tour='symbol-selector']",
    title: "Symbol Selector",
    description: "Switch between 70+ instruments — Forex, Crypto, Commodities, and Indices. Live prices update in real-time from WebSocket feeds.",
  },
];

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(TOUR_FLAG);
    if (!done) {
      const timer = setTimeout(() => setActive(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const updateRect = useCallback(() => {
    const el = document.querySelector(STEPS[step]?.target);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!active) return;
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [active, step, updateRect]);

  const finish = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_FLAG, "1");
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  }, [step, finish]);

  const prev = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, next, prev, finish]);

  if (!active) return null;

  const current = STEPS[step];
  const pad = 8;

  // Tooltip position — below the target by default, above if near bottom
  let tooltipTop = (rect?.bottom ?? 200) + 12;
  let tooltipLeft = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  if (tooltipTop + 200 > window.innerHeight) {
    tooltipTop = (rect?.top ?? 200) - 12 - 200;
  }
  tooltipLeft = Math.max(180, Math.min(tooltipLeft, window.innerWidth - 180));

  return (
    <div className="fixed inset-0 z-[9999]" onClick={finish}>
      {/* Overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - pad}
                y={rect.top - pad}
                width={rect.width + pad * 2}
                height={rect.height + pad * 2}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: "auto" }}
        />
      </svg>

      {/* Spotlight border */}
      {rect && (
        <div
          className="absolute rounded-lg border-2 border-[var(--color-neon-blue)] pointer-events-none"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 20px rgba(59,130,246,0.3)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        onClick={(e) => e.stopPropagation()}
        className="absolute w-[340px] card-glass rounded-xl p-4 border border-[var(--color-border-primary)] shadow-2xl"
        style={{
          left: tooltipLeft,
          top: tooltipTop,
          transform: "translateX(-50%)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-[var(--color-neon-blue)]" />
          <h4 className="text-sm font-bold text-[var(--color-text-primary)]">{current.title}</h4>
          <div className="flex-1" />
          <button onClick={finish} className="p-1 rounded hover:bg-[var(--color-bg-hover)]">
            <X className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mb-3">
          {current.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
            {step + 1} / {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
              >
                <ChevronLeft className="w-3 h-3" />
                Back
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold rounded bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)] hover:bg-[var(--color-neon-blue)]/30"
            >
              {step < STEPS.length - 1 ? "Next" : "Finish"}
              {step < STEPS.length - 1 && <ChevronRight className="w-3 h-3" />}
            </button>
          </div>
        </div>
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === step ? "bg-[var(--color-neon-blue)] w-4" : i < step ? "bg-[var(--color-neon-blue)]/40" : "bg-[var(--color-text-muted)]/20"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
