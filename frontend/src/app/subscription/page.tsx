"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  CreditCard,
  Check,
  Copy,
  Loader2,
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuthStore } from "@/stores/auth";

/* ── Constants ────────────────────────────────────────────────────────── */
const PRICE_USD = 4_999;
const PERIOD = "year";
const WALLET_ADDRESS = "21rBk7tmX2E3wV5AXX8bDoEg8k35kmwfj2aHkCxPFbqW";
const NETWORK = "solana";
const EXPLORER = "https://solscan.io/tx/";
const TOKENS = ["SOL", "USDC", "USDT"] as const;

/* ── Types ─────────────────────────────────────────────────────────────── */
interface PaymentRecord {
  id: number;
  status: string;
  tx_hash: string;
  network: string;
  token: string;
  amount_usd: number;
  verified_amount: number | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string | null;
  verified_at: string | null;
}

interface SubmitResult {
  payment_id: number;
  status: string;
  confirmations: number;
  required_confirmations: number;
  actual_amount: number;
  error: string | null;
}

/* ── API helpers ───────────────────────────────────────────────────────── */
function authHeaders() {
  const token = localStorage.getItem("vision_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: authHeaders(), ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}

/* ── Main page ─────────────────────────────────────────────────────────── */
export default function SubscriptionPage() {
  const router = useRouter();
  const { user, checkAuth } = useAuthStore();

  // Data
  const [billing, setBilling] = useState<PaymentRecord[]>([]);

  // Payment flow state
  const [selectedToken, setSelectedToken] = useState<string>("USDC");
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);

  // Load billing
  useEffect(() => {
    fetchApi<{ payments: PaymentRecord[] }>("/api/v1/subscription/billing")
      .then((d) => setBilling(d.payments))
      .catch(() => {});
  }, []);

  // Poll payment status after submission
  useEffect(() => {
    if (!submitResult || submitResult.status === "confirmed" || submitResult.status === "failed" || submitResult.status === "expired") {
      return;
    }
    let cancelled = false;
    const paymentId = submitResult.payment_id;
    setPolling(true);

    const id = setInterval(async () => {
      if (cancelled) return;
      try {
        const data = await fetchApi<any>(`/api/v1/subscription/payment/${paymentId}`);
        if (cancelled) return;
        setSubmitResult((prev) => prev && prev.payment_id === paymentId
          ? { ...prev, status: data.status, confirmations: data.confirmations }
          : prev
        );
        if (data.status === "confirmed") {
          clearInterval(id);
          setPolling(false);
          await checkAuth();
          if (cancelled) return;
          const b = await fetchApi<{ payments: PaymentRecord[] }>("/api/v1/subscription/billing");
          if (!cancelled) setBilling(b.payments);
        }
      } catch {
        // ignore polling errors
      }
    }, 10_000);
    return () => { cancelled = true; clearInterval(id); setPolling(false); };
  }, [submitResult?.payment_id, submitResult?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleSubmit = async () => {
    if (!txHash.trim()) {
      setError("Please enter a transaction hash");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await fetchApi<SubmitResult>("/api/v1/subscription/submit-payment", {
        method: "POST",
        body: JSON.stringify({
          tx_hash: txHash.trim(),
          network: NETWORK,
          token: selectedToken,
        }),
      });
      setSubmitResult(result);
      if (result.status === "confirmed") {
        await checkAuth();
        const b = await fetchApi<{ payments: PaymentRecord[] }>("/api/v1/subscription/billing");
        setBilling(b.payments);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor =
    user?.subscription_status === "active" ? "var(--color-neon-green)" :
    user?.subscription_status === "trial" ? "var(--color-neon-blue)" :
    user?.subscription_status === "admin" ? "var(--color-neon-purple)" :
    "var(--color-neon-red)";

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] grid-pattern">
      {/* Header */}
      <div className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-vision.png" alt="VISION" width={120} height={20} priority />
            <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              Subscription
            </span>
          </div>
          {user?.has_access && (
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-neon-blue)] hover:text-[var(--color-neon-cyan)] transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Dashboard
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* ── Status Banner ──────────────────────────────────── */}
        <div className="card-glass rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: statusColor }}>
                  {user?.subscription_status || "\u2014"}
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {user?.subscription_status === "trial" && `Free trial — ${user.days_remaining} day${user.days_remaining !== 1 ? "s" : ""} remaining (limited access)`}
                {user?.subscription_status === "active" && `Subscription renews in ${user.days_remaining} day${user.days_remaining !== 1 ? "s" : ""}`}
                {user?.subscription_status === "expired" && "Your free trial has ended. Subscribe to access VISION."}
                {user?.subscription_status === "admin" && "Admin access \u2014 unlimited"}
              </p>
            </div>
            <CreditCard className="w-5 h-5 text-[var(--color-text-muted)]" />
          </div>
        </div>

        {/* ── Payment Flow ───────────────────────────────────── */}
        <div className="card-glass rounded-lg p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
                Pay with Solana
              </h2>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                SOL, USDC (SPL) or USDT (SPL) on Solana network
              </p>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-[var(--color-neon-amber)] font-mono">
                $4,999
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)] ml-1">/year</span>
            </div>
          </div>

          {/* Step 1: Token */}
          <div>
            <label className="block text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              1. Select Token
            </label>
            <div className="flex gap-2">
              {TOKENS.map((t) => (
                <button
                  key={t}
                  onClick={() => { setSelectedToken(t); setSubmitResult(null); setError(""); }}
                  className={`px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    selectedToken === t
                      ? "border-[var(--color-neon-green)] bg-[var(--color-neon-green)]/10 text-[var(--color-neon-green)]"
                      : "border-[var(--color-border-primary)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]"
                  }`}
                >
                  {t === "SOL" ? "SOL" : `${t} (SPL)`}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Wallet + QR */}
          <div>
            <label className="block text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              2. Send {selectedToken} to this Solana address
            </label>
            <div className="flex items-start gap-4">
              <div className="bg-white p-2 rounded-lg shrink-0">
                <QRCodeSVG value={WALLET_ADDRESS} size={100} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <code className="flex-1 text-[10px] font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded px-2.5 py-2 truncate">
                    {WALLET_ADDRESS}
                  </code>
                  <button
                    onClick={() => handleCopy(WALLET_ADDRESS)}
                    className="p-1.5 rounded border border-[var(--color-border-primary)] hover:border-[var(--color-neon-blue)] transition-colors"
                  >
                    {copied ? (
                      <Check className="w-3 h-3 text-[var(--color-neon-green)]" />
                    ) : (
                      <Copy className="w-3 h-3 text-[var(--color-text-muted)]" />
                    )}
                  </button>
                </div>
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Send <span className="font-bold text-[var(--color-neon-amber)]">${PRICE_USD.toLocaleString()}</span> equivalent in{" "}
                  <span className="font-bold text-[var(--color-text-secondary)]">{selectedToken}</span> on the{" "}
                  <span className="font-bold" style={{ color: "#9945FF" }}>Solana</span> network
                </p>
                <p className="text-[8px] text-[var(--color-text-muted)] mt-1 opacity-60">
                  Annual subscription \u2014 12 months of full VISION access
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Tx hash */}
          <div>
            <label className="block text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              3. Paste Transaction Signature
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Solana transaction signature..."
                disabled={!!submitResult}
                className="flex-1 px-3 py-2 text-[10px] font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-neon-blue)] transition-colors disabled:opacity-40"
              />
              <button
                onClick={handleSubmit}
                disabled={submitting || !!submitResult}
                className="px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Verify
              </button>
            </div>
          </div>

          {/* Verification Status */}
          {submitResult && (
            <div className={`rounded-md p-3 border ${
              submitResult.status === "confirmed"
                ? "bg-[var(--color-neon-green)]/10 border-[var(--color-neon-green)]/30"
                : submitResult.status === "failed" || submitResult.status === "expired"
                ? "bg-[var(--color-bear)]/10 border-[var(--color-bear)]/30"
                : "bg-[var(--color-neon-blue)]/10 border-[var(--color-neon-blue)]/30"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {submitResult.status === "confirmed" && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-neon-green)]" />}
                {(submitResult.status === "pending" || submitResult.status === "confirming") && <Clock className="w-3.5 h-3.5 text-[var(--color-neon-blue)] animate-pulse" />}
                {(submitResult.status === "failed" || submitResult.status === "expired") && <XCircle className="w-3.5 h-3.5 text-[var(--color-bear)]" />}
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{
                  color: submitResult.status === "confirmed" ? "var(--color-neon-green)" :
                         submitResult.status === "failed" || submitResult.status === "expired" ? "var(--color-bear)" :
                         "var(--color-neon-blue)"
                }}>
                  {submitResult.status === "confirmed" ? "Payment Confirmed!" :
                   submitResult.status === "confirming" ? `Confirming... (${submitResult.confirmations} confirmations)` :
                   submitResult.status === "pending" ? "Verifying transaction..." :
                   submitResult.status}
                </span>
              </div>
              {submitResult.actual_amount > 0 && (
                <p className="text-[9px] text-[var(--color-text-muted)]">
                  Amount: ${submitResult.actual_amount.toFixed(2)}
                </p>
              )}
              {submitResult.error && (
                <p className="text-[9px] text-[var(--color-bear)] mt-1">{submitResult.error}</p>
              )}
              {submitResult.status === "confirmed" && (
                <button
                  onClick={() => router.push("/")}
                  className="mt-3 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[var(--color-neon-green)] text-black hover:bg-[var(--color-neon-green)]/90 transition-all"
                >
                  Go to Dashboard
                </button>
              )}
              {(submitResult.status === "failed" || submitResult.status === "expired") && (
                <button
                  onClick={() => { setSubmitResult(null); setTxHash(""); setError(""); }}
                  className="mt-2 text-[9px] font-semibold text-[var(--color-neon-blue)] hover:text-[var(--color-neon-cyan)] transition-colors"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && !submitResult && (
            <div className="px-3 py-2 rounded-md bg-[var(--color-bear)]/10 border border-[var(--color-bear)]/30 flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-[var(--color-bear)]" />
              <p className="text-[10px] text-[var(--color-bear)]">{error}</p>
            </div>
          )}
        </div>

        {/* ── Billing History ────────────────────────────────── */}
        <div className="card-glass rounded-lg p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-4">
            Billing History
          </h2>
          {billing.length === 0 ? (
            <p className="text-[10px] text-[var(--color-text-muted)] text-center py-6">
              No payments yet
            </p>
          ) : (
            <div className="space-y-2">
              {billing.map((p) => {
                const isConfirmed = p.status === "confirmed";
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: isConfirmed ? "var(--color-neon-green)" :
                            p.status === "pending" || p.status === "confirming" ? "var(--color-neon-blue)" :
                            "var(--color-bear)"
                        }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-[var(--color-text-primary)]">
                            ${p.verified_amount?.toFixed(2) || p.amount_usd.toFixed(2)}
                          </span>
                          <span className="text-[9px] font-mono text-[var(--color-text-muted)]">
                            {p.token}
                          </span>
                          <span
                            className="text-[8px] font-semibold px-1.5 py-0.5 rounded uppercase"
                            style={{ color: "#9945FF", backgroundColor: "rgba(153,69,255,0.08)" }}
                          >
                            Solana
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[8px] text-[var(--color-text-muted)] font-mono truncate max-w-[200px]">
                            {p.tx_hash}
                          </span>
                          <a
                            href={`${EXPLORER}${p.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-neon-blue)] hover:text-[var(--color-neon-cyan)] transition-colors"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[9px] font-semibold uppercase ${
                        isConfirmed ? "text-[var(--color-neon-green)]" :
                        p.status === "pending" || p.status === "confirming" ? "text-[var(--color-neon-blue)]" :
                        "text-[var(--color-bear)]"
                      }`}>
                        {p.status}
                      </span>
                      {p.created_at && (
                        <p className="text-[8px] text-[var(--color-text-muted)] mt-0.5">
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
