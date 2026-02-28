"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, loading, error, clearError, checkAuth } = useAuthStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    if (!username.trim() || !password.trim()) return;
    clearError();
    setSubmitting(true);
    const ok = await login(username.trim(), password);
    if (ok) {
      router.replace("/");
    }
    setSubmitting(false);
  };

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
        <div className="flex items-center justify-center mb-8">
          <Image src="/logo-vision.png" alt="VISION" width={200} height={34} priority />
        </div>

        {/* Card */}
        <div className="card-glass rounded-lg p-6">
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-1">
            Sign In
          </h1>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-6">
            Enter your credentials to access the dashboard
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                autoFocus
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
                  autoComplete="current-password"
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

            {/* Error */}
            {error && (
              <div className="px-3 py-2 rounded-md bg-[var(--color-bear)]/10 border border-[var(--color-bear)]/30">
                <p className="text-[10px] text-[var(--color-bear)]">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !username.trim() || !password.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogIn className="w-3.5 h-3.5" />
              )}
              Sign In
            </button>
          </form>

          {/* Register link */}
          <div className="mt-5 pt-4 border-t border-[var(--color-border-primary)] text-center">
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Don&apos;t have an account?{" "}
              <a
                href="/register"
                className="text-[var(--color-neon-blue)] hover:text-[var(--color-neon-cyan)] transition-colors font-semibold"
              >
                Create one
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
