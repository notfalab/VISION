"use client";

import { use } from "react";
import { redirect } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import DashboardContent from "@/components/DashboardContent";
import { VALID_SYMBOLS } from "@/lib/symbols";
import { parseTimeframe } from "@/lib/url";

export default function SymbolPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
}) {
  const { symbol } = use(params);
  const { tf } = use(searchParams);
  const upper = symbol.toUpperCase();

  if (!VALID_SYMBOLS.has(upper)) {
    redirect("/");
  }

  const initialTimeframe = parseTimeframe(tf);

  return (
    <AuthGuard>
      <DashboardContent initialSymbol={upper} initialTimeframe={initialTimeframe} />
    </AuthGuard>
  );
}
