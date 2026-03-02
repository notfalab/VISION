"use client";

import { MessageCircle, Users, X, ArrowRight } from "lucide-react";

const DISCORD_URL = "https://discord.gg/eUGYdNyyvf";

const TELEGRAM_CHANNELS = [
  {
    label: "VISION GOLD",
    href: "https://t.me/+_pMYNBlFj0I0YzMx",
    gradient: "linear-gradient(to right, #F59E0B, #000)",
    borderColor: "border-amber-500/40 hover:border-amber-400/70",
  },
  {
    label: "VISION BITCOIN",
    href: "https://t.me/+9qAF1vBDdTkwYWVh",
    gradient: "linear-gradient(to right, #F97316, #000)",
    borderColor: "border-orange-500/40 hover:border-orange-400/70",
  },
  {
    label: "VISION FOREX",
    href: "https://t.me/+rV8dmhYnX804ZjY5",
    gradient: "linear-gradient(to right, #60A5FA, #000)",
    borderColor: "border-blue-500/40 hover:border-blue-400/70",
  },
];

interface CommunityModalProps {
  onJoined: () => void;
  onSkip: () => void;
}

export default function CommunityModal({ onJoined, onSkip }: CommunityModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onSkip}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onSkip}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-[var(--color-neon-purple)] opacity-10 blur-3xl rounded-full" />

        {/* Content */}
        <div className="relative px-6 pt-8 pb-6 space-y-6">
          {/* Title */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-neon-purple)]/15 border border-[var(--color-neon-purple)]/30 mb-2">
              <Users className="w-6 h-6 text-[var(--color-neon-purple)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
              Join the VISION Community
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              Get real-time trading signals, market analysis, and connect with other traders.
            </p>
          </div>

          {/* Discord */}
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/15 to-purple-600/15 hover:border-indigo-400/60 hover:from-indigo-500/25 hover:to-purple-600/25 transition-all group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-400/30 to-purple-600/30">
              <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Discord Community</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">Chat, analysis & market discussion</p>
            </div>
            <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
          </a>

          {/* Telegram channels */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-1">
              <MessageCircle className="w-3 h-3 inline mr-1 -mt-0.5" />
              Telegram Signal Channels
            </p>
            <div className="space-y-2">
              {TELEGRAM_CHANNELS.map((ch) => (
                <a
                  key={ch.label}
                  href={ch.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: ch.gradient }}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all group ${ch.borderColor}`}
                >
                  <span className="flex-1 text-sm font-mono font-semibold text-white">
                    {ch.label}
                  </span>
                  <img src="/telegram.svg" alt="" width={16} height={16} className="opacity-70 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={onJoined}
              className="w-full py-2.5 rounded-xl bg-[var(--color-neon-purple)] hover:bg-[var(--color-neon-purple)]/90 text-white text-sm font-semibold transition-colors"
            >
              I already joined
            </button>
            <button
              onClick={onSkip}
              className="w-full py-2 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
