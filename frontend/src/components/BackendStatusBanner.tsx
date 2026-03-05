"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { useHealthStore } from "@/stores/health";

const POLL_INTERVAL = 30_000; // 30s

export default function BackendStatusBanner() {
  const { backendOnline, checkHealth } = useHealthStore();

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkHealth]);

  if (backendOnline) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-[var(--color-bear)]/15 border-b border-[var(--color-bear)]/30 text-[var(--color-bear)]">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span className="text-xs font-mono font-semibold uppercase tracking-wider">
        Backend unavailable — data may be stale. Retrying...
      </span>
    </div>
  );
}
