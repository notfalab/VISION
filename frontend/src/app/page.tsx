"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import AuthGuard from "@/components/AuthGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import CommunityModal from "@/components/CommunityModal";
import PriceChart from "@/components/charts/PriceChart";
import VolumeProfile from "@/components/charts/VolumeProfile";
import TradeScore from "@/components/widgets/TradeScore";
import IndicatorPanel from "@/components/widgets/IndicatorPanel";
import GoldMacro from "@/components/widgets/GoldMacro";
import COTReport from "@/components/widgets/COTReport";
import SmartMoney from "@/components/widgets/SmartMoney";
import MTFConfluence from "@/components/widgets/MTFConfluence";
import MLPrediction from "@/components/widgets/MLPrediction";
import OrderFlow from "@/components/widgets/OrderFlow";
import Correlations from "@/components/widgets/Correlations";
import ScalperMode from "@/components/widgets/ScalperMode";
import WhaleTracker from "@/components/widgets/WhaleTracker";
import CurrencyHeatmap from "@/components/widgets/CurrencyHeatmap";
import ZonesOverlay from "@/components/widgets/ZonesOverlay";
import TPSLWidget from "@/components/widgets/TPSLWidget";
import LiquidationWidget from "@/components/widgets/LiquidationWidget";
import DeepOrderBookWidget from "@/components/widgets/DeepOrderBookWidget";
import PerformanceDashboard from "@/components/widgets/PerformanceDashboard";
import { useMarketStore, getMarketType } from "@/stores/market";

const COMMUNITY_KEY = "vision_community_joined";

function DashboardContent() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const chartExpanded = useMarketStore((s) => s.chartExpanded);
  const marketType = getMarketType(activeSymbol);
  const isGold = activeSymbol === "XAUUSD";
  const isCrypto = marketType === "crypto";

  // Community modal — appears until user confirms they joined
  const [showCommunity, setShowCommunity] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(COMMUNITY_KEY) !== "true") {
      setShowCommunity(true);
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg-primary)] grid-pattern overflow-hidden lg:overflow-hidden">
      <Header />

      {/* Community invite modal */}
      {showCommunity && (
        <CommunityModal
          onJoined={() => {
            localStorage.setItem(COMMUNITY_KEY, "true");
            setShowCommunity(false);
          }}
          onSkip={() => {
            localStorage.setItem(COMMUNITY_KEY, "true");
            setShowCommunity(false);
          }}
        />
      )}
      <div className="flex-1 min-h-0 p-2 md:p-3 overflow-y-auto lg:overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-2 md:gap-3 lg:h-full">
          {/* Left: Chart + Bottom row */}
          <div className="lg:flex-1 flex flex-col gap-2 min-w-0 lg:min-h-0">
            {/* Chart — expanded mode takes full height, otherwise capped */}
            <div className={chartExpanded ? "flex-1 min-h-0" : "h-[350px] md:h-[380px] lg:h-[45%] lg:min-h-[200px] shrink-0"}>
              <ErrorBoundary>
                <PriceChart />
              </ErrorBoundary>
            </div>

            {/* Volume Profile — mobile (horizontal scroll) */}
            {!chartExpanded && (
              <div className="lg:hidden h-[200px] shrink-0">
                <ErrorBoundary>
                  <VolumeProfile />
                </ErrorBoundary>
              </div>
            )}

            {/* Bottom row: Volume Profile + Indicators (desktop only) */}
            {!chartExpanded && (
              <div className="hidden lg:flex gap-2 flex-1 min-h-0">
                <div className="w-52 shrink-0 h-full">
                  <ErrorBoundary>
                    <VolumeProfile />
                  </ErrorBoundary>
                </div>
                <div className="flex-1 min-w-0 h-full">
                  <ErrorBoundary>
                    <IndicatorPanel />
                  </ErrorBoundary>
                </div>
              </div>
            )}
          </div>

          {/* Right panel — scrollable on desktop, inline on mobile — hidden when chart expanded */}
          <div className={`w-full lg:w-[440px] lg:shrink-0 lg:overflow-y-auto lg:min-h-0 ${chartExpanded ? "hidden" : ""}`}>
            <div className="space-y-3">
              <ErrorBoundary><ScalperMode /></ErrorBoundary>
              <ErrorBoundary><PerformanceDashboard /></ErrorBoundary>
              <ErrorBoundary><ZonesOverlay /></ErrorBoundary>
              <ErrorBoundary><TradeScore /></ErrorBoundary>
              <ErrorBoundary><CurrencyHeatmap /></ErrorBoundary>
              <ErrorBoundary><MLPrediction /></ErrorBoundary>
              <ErrorBoundary><OrderFlow /></ErrorBoundary>
              <ErrorBoundary><TPSLWidget /></ErrorBoundary>
              <ErrorBoundary><DeepOrderBookWidget /></ErrorBoundary>
              {isCrypto && (
                <ErrorBoundary><LiquidationWidget /></ErrorBoundary>
              )}
              <ErrorBoundary><MTFConfluence /></ErrorBoundary>
              <ErrorBoundary><SmartMoney /></ErrorBoundary>
              {isCrypto && (
                <ErrorBoundary><WhaleTracker /></ErrorBoundary>
              )}
              {isGold && (
                <ErrorBoundary><Correlations /></ErrorBoundary>
              )}
              {isGold && (
                <ErrorBoundary><GoldMacro /></ErrorBoundary>
              )}
              <ErrorBoundary><COTReport /></ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
