"use client";

import AuthGuard from "@/components/AuthGuard";
import GlobalHeatMap from "@/components/heatmap/GlobalHeatMap";

export default function HeatmapPage() {
  return (
    <AuthGuard>
      <GlobalHeatMap />
    </AuthGuard>
  );
}
