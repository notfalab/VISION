"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, UserPlus, Loader2, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/stores/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, loading, error, clearError, checkAuth } = useAuthStore();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    if (!email.trim() || !username.trim() || !password.trim()) {
      setLocalError("All fields are required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError("Invalid email address");
      return;
    }
    if (username.trim().length < 3) {
      setLocalError("Username must be at least 3 characters");
      return;
    }
    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    const ok = await register(email.trim(), username.trim(), password);
    if (ok) {
      router.replace("/");
    }
    setSubmitting(false);
  };

  const displayError = localError || error;

  if (loading || isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-bg-primary)] grid-pattern">
        <Loader2 className="w-5 h-5 text-[var(--color-neon-blue)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--color-bg-primary)] grid-pattern p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Activity className="w-6 h-6 text-[var(--color-neon-blue)]" />
          <span className="text-lg font-bold tracking-widest text-[var(--color-text-primary)]">
            VISION
          </span>
        </div>

        {/* Card */}
        <div className="card-glass rounded-lg p-6">
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-1">
            Create Account
          </h1>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-6">
            Register to access smart money analytics
          </p>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Email */}
            <div>
              <label className="block text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-neon-blue)] transition-colors"
                placeholder="you@example.com"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-neon-blue)] transition-colors"
                placeholder="your_username"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-9 text-xs font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-neon-blue)] transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-neon-blue)] transition-colors"
                placeholder="••••••••"
              />
            </div>

            {/* Error */}
            {displayError && (
              <div className="px-3 py-2 rounded-md bg-[var(--color-bear)]/10 border border-[var(--color-bear)]/30">
                <p className="text-[10px] text-[var(--color-bear)]">{displayError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              Create Account
            </button>
          </form>

          {/* Login link */}
          <div className="mt-5 pt-4 border-t border-[var(--color-border-primary)] text-center">
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Already have an account?{" "}
              <a
                href="/login"
                className="text-[var(--color-neon-blue)] hover:text-[var(--color-neon-cyan)] transition-colors font-semibold"
              >
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
