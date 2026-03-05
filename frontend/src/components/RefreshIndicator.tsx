"use client";

/**
 * Thin animated bar shown at the top of a widget during a background refresh
 * (i.e. when data already exists and a re-fetch is in progress).
 */
export default function RefreshIndicator() {
  return (
    <div className="absolute top-0 left-0 right-0 h-[2px] z-10 overflow-hidden rounded-t-lg">
      <div className="h-full w-1/3 bg-[var(--color-neon-blue)] animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full" />
    </div>
  );
}
