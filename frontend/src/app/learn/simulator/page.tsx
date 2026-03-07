"use client";

import AuthGuard from "@/components/AuthGuard";
import PaperSimulator from "@/components/learn/PaperSimulator";

export default function SimulatorPage() {
  return (
    <AuthGuard>
      <PaperSimulator />
    </AuthGuard>
  );
}
