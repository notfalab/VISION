"use client";

import Image from "next/image";
import { ShieldX, Clock, Mail } from "lucide-react";

export default function SuspendedPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] grid-pattern flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/logo-vision.png" alt="VISION" width={160} height={26} priority />
        </div>

        {/* Card */}
        <div className="card-glass rounded-xl p-8 text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-neon-amber)]/10 border border-[var(--color-neon-amber)]/20 flex items-center justify-center">
              <ShieldX className="w-8 h-8 text-[var(--color-neon-amber)]" />
            </div>
          </div>

          {/* Title */}
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-2">
              Account Suspended
            </h1>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
              Your account has been temporarily suspended while your refund request is being processed.
            </p>
          </div>

          {/* Info box */}
          <div className="bg-[var(--color-bg-primary)]/60 border border-[var(--color-border-primary)] rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-[var(--color-neon-amber)] mt-0.5 shrink-0" />
              <div className="text-left">
                <p className="text-[10px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-0.5">
                  Refund in Progress
                </p>
                <p className="text-[9px] text-[var(--color-text-muted)] leading-relaxed">
                  Your refund is currently being processed. This typically takes 5-10 business days depending on the payment method used.
                </p>
              </div>
            </div>

            <div className="w-full h-px bg-[var(--color-border-primary)]" />

            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-[var(--color-neon-blue)] mt-0.5 shrink-0" />
              <div className="text-left">
                <p className="text-[10px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-0.5">
                  What Happens Next
                </p>
                <p className="text-[9px] text-[var(--color-text-muted)] leading-relaxed">
                  Once your refund has been completed, you will be able to purchase a new annual subscription to regain full access to the VISION platform.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing reminder */}
          <div className="pt-2">
            <p className="text-[9px] text-[var(--color-text-muted)] mb-1">Annual Subscription</p>
            <p className="text-2xl font-bold text-[var(--color-neon-amber)] font-mono">$4,999<span className="text-[10px] text-[var(--color-text-muted)]"> /year</span></p>
          </div>

          {/* Contact */}
          <div className="pt-2 border-t border-[var(--color-border-primary)]">
            <p className="text-[8px] text-[var(--color-text-muted)] uppercase tracking-wider">
              If you have questions about your refund status, please contact support.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
