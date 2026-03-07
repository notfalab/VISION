"use client";

import AuthGuard from "@/components/AuthGuard";
import MultiChartLayout from "@/components/charts/MultiChartLayout";

export default function ChartsPage() {
  return (
    <AuthGuard>
      <MultiChartLayout />
    </AuthGuard>
  );
}
