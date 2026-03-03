"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";

interface LazyWidgetProps {
  children: ReactNode;
  /** Delay in ms before allowing the widget to render (stagger API load) */
  delay?: number;
  /** Minimum height placeholder while not yet loaded */
  minHeight?: number;
}

/**
 * Defers rendering of a widget until it's near the viewport AND the delay has elapsed.
 * This prevents 40+ API calls from firing simultaneously on dashboard load.
 */
export default function LazyWidget({ children, delay = 0, minHeight = 80 }: LazyWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [delayPassed, setDelayPassed] = useState(delay === 0);

  // Stagger timer
  useEffect(() => {
    if (delay <= 0) return;
    const t = setTimeout(() => setDelayPassed(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  // IntersectionObserver — trigger when element is within 400px of viewport
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, delayPassed]);

  if (visible && delayPassed) {
    return <>{children}</>;
  }

  return (
    <div
      ref={ref}
      style={{ minHeight }}
      className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] animate-pulse"
    />
  );
}
