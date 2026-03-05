"use client";

import { use } from "react";
import AuthGuard from "@/components/AuthGuard";
import DashboardContent from "@/components/DashboardContent";
import { parseTimeframe } from "@/lib/url";

export default function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ tf?: string }>;
}) {
  const { tf } = use(searchParams);
  const initialTimeframe = parseTimeframe(tf);

  return (
    <AuthGuard>
      <DashboardContent initialTimeframe={initialTimeframe} />
    </AuthGuard>
  );
}
