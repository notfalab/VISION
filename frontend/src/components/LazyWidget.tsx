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
 * Unmounts children when scrolled far off-screen (600px margin) to save resources.
 * Re-mounts when scrolled back into view.
 */
export default function LazyWidget({ children, delay = 0, minHeight = 80 }: LazyWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [inViewport, setInViewport] = useState(false);
  const [delayPassed, setDelayPassed] = useState(delay === 0);

  // Stagger timer
  useEffect(() => {
    if (delay <= 0) return;
    const t = setTimeout(() => setDelayPassed(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  // IntersectionObserver — stays active to track in/out of viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInViewport(entry.isIntersecting);
        if (entry.isIntersecting) setHasBeenVisible(true);
      },
      { rootMargin: "600px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shouldRender = hasBeenVisible && delayPassed && inViewport;

  return (
    <div ref={ref} style={shouldRender ? undefined : { minHeight }}>
      {shouldRender ? (
        children
      ) : (
        <div
          style={{ minHeight }}
          className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] animate-pulse"
        />
      )}
    </div>
  );
}
