"use client";

import { use, useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import DashboardContent from "@/components/DashboardContent";
import LandingPage from "@/app/landing/page";
import { useAuthStore } from "@/stores/auth";
import { parseTimeframe } from "@/lib/url";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ tf?: string }>;
}) {
  const { tf } = use(searchParams);
  const initialTimeframe = parseTimeframe(tf);
  const { isAuthenticated, loading, checkAuth } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    checkAuth().finally(() => setChecked(true));
  }, [checkAuth]);

  if (!checked || loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#0a0a0f" }}>
        <div style={{ width: 32, height: 32, border: "3px solid rgba(168,85,247,0.3)", borderTopColor: "#a855f7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <AuthGuard>
      <DashboardContent initialTimeframe={initialTimeframe} />
    </AuthGuard>
  );
}
