"use client";

import AuthGuard from "@/components/AuthGuard";
import CorrelationsMatrix from "@/components/correlations/CorrelationsMatrix";

export default function CorrelationsPage() {
  return (
    <AuthGuard>
      <CorrelationsMatrix />
    </AuthGuard>
  );
}
