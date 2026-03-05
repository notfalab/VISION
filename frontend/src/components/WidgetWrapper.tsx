"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";

interface WidgetWrapperProps {
  /** Widget icon (lucide component instance) */
  icon: React.ReactNode;
  /** Widget title */
  title: string;
  /** Optional right-side header extras (badges, toggles) */
  headerRight?: React.ReactNode;
  /** Widget body */
  children: React.ReactNode;
  /** Additional className for the outer container */
  className?: string;
}

/**
 * Shared wrapper for all dashboard widgets.
 * Provides: card-glass container, standard header with icon/title,
 * expand-to-fullscreen button via createPortal.
 */
export default function WidgetWrapper({
  icon,
  title,
  headerRight,
  children,
  className = "",
}: WidgetWrapperProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setFullscreen(false);
  }, []);

  useEffect(() => {
    if (fullscreen) {
      document.addEventListener("keydown", handleEsc);
      // Prevent background scroll
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [fullscreen, handleEsc]);

  const content = (
    <div
      className={`card-glass rounded-lg overflow-hidden flex flex-col ${
        fullscreen
          ? "fixed inset-0 z-[100] rounded-none h-screen"
          : ""
      } ${className}`}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2 shrink-0">
        {icon}
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          {title}
        </h3>
        {headerRight && <div className="ml-auto flex items-center gap-2">{headerRight}</div>}
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className={`${headerRight ? "" : "ml-auto"} p-1 rounded transition-colors hover:bg-[var(--color-bg-hover)]`}
          title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
        >
          {fullscreen ? (
            <Minimize2 className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          )}
        </button>
      </div>

      {/* Body */}
      <div className={`flex-1 ${fullscreen ? "overflow-y-auto" : ""}`}>
        {children}
      </div>

      {/* Fullscreen backdrop click-to-close */}
      {fullscreen && (
        <div
          className="fixed inset-0 bg-black/80 -z-10"
          onClick={() => setFullscreen(false)}
        />
      )}
    </div>
  );

  // In fullscreen mode, portal to body for proper z-index stacking
  if (fullscreen && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
}
