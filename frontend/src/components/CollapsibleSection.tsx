"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible widget group for mobile.
 * On desktop (lg+): always expanded, no toggle UI.
 * On mobile: header + chevron toggle, sections can be collapsed.
 */
export default function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      {/* Mobile: collapsible header */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden w-full flex items-center gap-2 px-1 py-2 group"
      >
        <div className="flex-1 h-px bg-[var(--color-border-primary)]" />
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[var(--color-text-muted)] shrink-0">
          {title}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--color-text-muted)] transition-transform duration-200 shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
        <div className="flex-1 h-px bg-[var(--color-border-primary)]" />
      </button>

      {/* Desktop: always visible title bar */}
      <div className="hidden lg:flex items-center gap-2 px-1 py-1.5">
        <div className="flex-1 h-px bg-[var(--color-border-primary)]" />
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[var(--color-text-muted)] shrink-0">
          {title}
        </span>
        <div className="flex-1 h-px bg-[var(--color-border-primary)]" />
      </div>

      {/* Content: hidden on mobile when collapsed, always visible on desktop */}
      <div className={`space-y-3 ${open ? "" : "hidden lg:block"}`}>
        {children}
      </div>
    </div>
  );
}
