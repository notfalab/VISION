"use client";

import { use } from "react";
import { redirect } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import DashboardContent from "@/components/DashboardContent";
import { VALID_SYMBOLS } from "@/lib/symbols";

export default function SymbolPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const upper = symbol.toUpperCase();

  if (!VALID_SYMBOLS.has(upper)) {
    redirect("/");
  }

  return (
    <AuthGuard>
      <DashboardContent initialSymbol={upper} />
    </AuthGuard>
  );
}
