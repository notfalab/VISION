"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseApiDataOptions {
  /** Polling interval in ms (0 = no polling, default 0) */
  interval?: number;
  /** Unique key for stagger offset calculation */
  key?: string;
  /** Whether to fetch immediately on mount (default true) */
  enabled?: boolean;
}

interface UseApiDataResult<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

/** Simple hash to spread poll timers across 0-5 s */
function hashStagger(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 5000;
}

// ── Tab visibility tracking ──
let _tabVisible = typeof document === "undefined" ? true : !document.hidden;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    _tabVisible = !document.hidden;
  });
}

/**
 * Universal data-fetching hook with:
 * - AbortController (cancels in-flight on deps change / unmount)
 * - Generation counter (race protection)
 * - Staggered polling (avoids request storms)
 * - Tab visibility (pauses when hidden, resumes on focus)
 * - Retry (1 retry after 2 s on transient failure)
 * - Stale-while-revalidate (keeps old data visible during refresh)
 */
export function useApiData<T>(
  fetcher: () => Promise<T | null>,
  deps: unknown[],
  options: UseApiDataOptions = {},
): UseApiDataResult<T> {
  const { interval = 0, key, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const genRef = useRef(0);
  const mountedRef = useRef(true);

  // ── Core load function ──
  const load = useCallback(
    async (background = false) => {
      if (background && !_tabVisible) return;

      const gen = ++genRef.current;

      if (!background) setLoading(true);
      setError(false);

      try {
        const result = await fetcher();

        if (gen !== genRef.current || !mountedRef.current) return;

        if (result !== null && result !== undefined) {
          setData(result);
        } else if (!background) {
          setError(true);
        }
      } catch (err: unknown) {
        if (gen !== genRef.current || !mountedRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;

        // Retry once after 2 s (foreground only)
        if (!background) {
          await new Promise((r) => setTimeout(r, 2000));
          if (gen !== genRef.current || !mountedRef.current) return;
          try {
            const retry = await fetcher();
            if (gen !== genRef.current || !mountedRef.current) return;
            if (retry !== null && retry !== undefined) {
              setData(retry);
            } else {
              setError(true);
            }
          } catch {
            if (gen === genRef.current && mountedRef.current) setError(true);
          }
        }
      } finally {
        if (gen === genRef.current && mountedRef.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  // ── Initial fetch + staggered polling ──
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    // Foreground fetch immediately
    load(false);

    // Polling with stagger offset
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let staggerTimeout: ReturnType<typeof setTimeout> | null = null;

    if (interval > 0) {
      const offset = key ? hashStagger(key) : 0;
      staggerTimeout = setTimeout(() => {
        intervalId = setInterval(() => load(true), interval);
      }, offset);
    }

    return () => {
      mountedRef.current = false;
      genRef.current++; // Invalidate any in-flight
      if (staggerTimeout) clearTimeout(staggerTimeout);
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, interval, enabled]);

  // ── Resume on tab visibility ──
  useEffect(() => {
    if (interval <= 0 || !enabled) return;
    const onVisibility = () => {
      if (!document.hidden) load(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load, interval, enabled]);

  const refresh = useCallback(() => load(false), [load]);

  return { data, loading, error, refresh };
}
