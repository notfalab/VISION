"use client";

import AuthGuard from "@/components/AuthGuard";
import InstitutionalFlowDashboard from "@/components/institutional/InstitutionalFlowDashboard";

export default function InstitutionalPage() {
  return (
    <AuthGuard>
      <InstitutionalFlowDashboard />
    </AuthGuard>
  );
}
