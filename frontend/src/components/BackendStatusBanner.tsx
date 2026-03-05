"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useHealthStore } from "@/stores/health";

const POLL_INTERVAL = 30_000; // 30s

export default function BackendStatusBanner() {
  const { backendOnline, checkHealth } = useHealthStore();
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkHealth]);

  if (backendOnline) return null;

  return (
    <div className="fixed top-3 right-3 z-50">
      <button
        onClick={() => setShowTooltip((v) => !v)}
        className="relative flex items-center justify-center w-7 h-7 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-bear)]/40 shadow-lg hover:scale-110 transition-transform"
        title="Backend offline"
      >
        <WifiOff className="w-3.5 h-3.5 text-[var(--color-bear)]" />
        {/* Pulsing dot */}
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--color-bear)] animate-pulse" />
      </button>

      {showTooltip && (
        <div className="absolute top-9 right-0 w-48 px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] shadow-xl">
          <p className="text-[11px] font-mono text-[var(--color-text-muted)]">
            Backend offline. Los datos pueden estar desactualizados. Reintentando cada 30s...
          </p>
        </div>
      )}
    </div>
  );
}
