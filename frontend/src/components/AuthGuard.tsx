"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Activity, Loader2 } from "lucide-react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, checkAuth } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[var(--color-bg-primary)] grid-pattern gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[var(--color-neon-blue)]" />
          <span className="text-sm font-bold tracking-widest text-[var(--color-text-primary)]">
            VISION
          </span>
        </div>
        <Loader2 className="w-5 h-5 text-[var(--color-neon-blue)] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
