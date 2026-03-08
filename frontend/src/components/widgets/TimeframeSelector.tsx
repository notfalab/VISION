"use client";

const TF_OPTIONS = ["15m", "1h", "4h", "1d"] as const;

interface TimeframeSelectorProps {
  value: string;
  onChange: (tf: string) => void;
}

export default function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  return (
    <div className="flex gap-px">
      {TF_OPTIONS.map((tf) => (
        <button
          key={tf}
          onClick={(e) => { e.stopPropagation(); onChange(tf); }}
          className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors ${
            value === tf
              ? "text-[var(--color-neon-blue)] bg-[var(--color-neon-blue)]/10"
              : "text-[var(--color-text-muted)]/50 hover:text-[var(--color-text-muted)]"
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}
