"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/layout/Header";
import ErrorBoundary from "@/components/ErrorBoundary";
import CommunityModal from "@/components/CommunityModal";
import PriceChart from "@/components/charts/PriceChart";
import VolumeProfile from "@/components/charts/VolumeProfile";
import IndicatorPanel from "@/components/widgets/IndicatorPanel";
import ScalperMode from "@/components/widgets/ScalperMode";
import LazyWidget from "@/components/LazyWidget";
import { useMarketStore, getMarketType } from "@/stores/market";

// Lazy-load heavy widgets — they won't be included in the initial JS bundle
const PerformanceDashboard = dynamic(() => import("@/components/widgets/PerformanceDashboard"), { ssr: false });
const ZonesOverlay = dynamic(() => import("@/components/widgets/ZonesOverlay"), { ssr: false });
const TradeScore = dynamic(() => import("@/components/widgets/TradeScore"), { ssr: false });
const CurrencyHeatmap = dynamic(() => import("@/components/widgets/CurrencyHeatmap"), { ssr: false });
const MLPrediction = dynamic(() => import("@/components/widgets/MLPrediction"), { ssr: false });
const OrderFlow = dynamic(() => import("@/components/widgets/OrderFlow"), { ssr: false });
const TPSLWidget = dynamic(() => import("@/components/widgets/TPSLWidget"), { ssr: false });
const DeepOrderBookWidget = dynamic(() => import("@/components/widgets/DeepOrderBookWidget"), { ssr: false });
const LiquidationWidget = dynamic(() => import("@/components/widgets/LiquidationWidget"), { ssr: false });
const MTFConfluence = dynamic(() => import("@/components/widgets/MTFConfluence"), { ssr: false });
const SmartMoney = dynamic(() => import("@/components/widgets/SmartMoney"), { ssr: false });
const WhaleTracker = dynamic(() => import("@/components/widgets/WhaleTracker"), { ssr: false });
const Correlations = dynamic(() => import("@/components/widgets/Correlations"), { ssr: false });
const GoldMacro = dynamic(() => import("@/components/widgets/GoldMacro"), { ssr: false });
const COTReport = dynamic(() => import("@/components/widgets/COTReport"), { ssr: false });
const EconomicCalendar = dynamic(() => import("@/components/widgets/EconomicCalendar"), { ssr: false });
const NewsSentiment = dynamic(() => import("@/components/widgets/NewsSentiment"), { ssr: false });
const MarketNarrator = dynamic(() => import("@/components/widgets/MarketNarrator"), { ssr: false });
const VolumeProfileWidget = dynamic(() => import("@/components/widgets/VolumeProfileWidget"), { ssr: false });
const VolatilityForecast = dynamic(() => import("@/components/widgets/VolatilityForecast"), { ssr: false });
const DivergenceWidget = dynamic(() => import("@/components/widgets/DivergenceWidget"), { ssr: false });
const LiquidityForecast = dynamic(() => import("@/components/widgets/LiquidityForecast"), { ssr: false });

const COMMUNITY_KEY = "vision_community_joined";

export default function DashboardContent({ initialSymbol }: { initialSymbol?: string }) {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const setActiveSymbol = useMarketStore((s) => s.setActiveSymbol);
  const chartExpanded = useMarketStore((s) => s.chartExpanded);
  const marketType = getMarketType(activeSymbol);
  const isGold = activeSymbol === "XAUUSD";
  const isCrypto = marketType === "crypto";

  // Sync URL symbol → store on mount
  useEffect(() => {
    if (initialSymbol && initialSymbol !== activeSymbol) {
      setActiveSymbol(initialSymbol);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSymbol]);

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
            <div className={chartExpanded ? "h-[calc(100dvh-100px)] lg:h-auto lg:flex-1 lg:min-h-0" : "h-[350px] md:h-[380px] lg:h-[45%] lg:min-h-[200px] shrink-0"}>
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
              {/* Priority 1: Loads immediately (core trading widget) */}
              <ErrorBoundary><ScalperMode /></ErrorBoundary>

              {/* Priority 1.5: AI Narrator — loads early for immediate context */}
              <LazyWidget delay={300}>
                <ErrorBoundary><MarketNarrator /></ErrorBoundary>
              </LazyWidget>

              {/* Priority 2: Loads after 500ms + when visible */}
              <LazyWidget delay={500}>
                <ErrorBoundary><PerformanceDashboard /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={500}>
                <ErrorBoundary><ZonesOverlay /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={500}>
                <ErrorBoundary><TradeScore /></ErrorBoundary>
              </LazyWidget>

              {/* Priority 2.5: Volume Profile + Divergence */}
              <LazyWidget delay={700}>
                <ErrorBoundary><VolumeProfileWidget /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={700}>
                <ErrorBoundary><DivergenceWidget /></ErrorBoundary>
              </LazyWidget>

              {/* Priority 3: Calendar + Sentiment */}
              <LazyWidget delay={1000}>
                <ErrorBoundary><EconomicCalendar /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={1000}>
                <ErrorBoundary><NewsSentiment /></ErrorBoundary>
              </LazyWidget>

              {/* Priority 3.5: Volatility + ML + Flow */}
              <LazyWidget delay={1200}>
                <ErrorBoundary><VolatilityForecast /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={1500}>
                <ErrorBoundary><CurrencyHeatmap /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={1000}>
                <ErrorBoundary><MLPrediction /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={1000}>
                <ErrorBoundary><OrderFlow /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={1000}>
                <ErrorBoundary><TPSLWidget /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={1000}>
                <ErrorBoundary><DeepOrderBookWidget /></ErrorBoundary>
              </LazyWidget>
              {isCrypto && (
                <LazyWidget delay={1500}>
                  <ErrorBoundary><LiquidationWidget /></ErrorBoundary>
                </LazyWidget>
              )}

              {/* Priority 3.8: Liquidity Forecast */}
              <LazyWidget delay={1500}>
                <ErrorBoundary><LiquidityForecast /></ErrorBoundary>
              </LazyWidget>

              {/* Priority 4: Loads after 2s + when visible */}
              <LazyWidget delay={2000}>
                <ErrorBoundary><MTFConfluence /></ErrorBoundary>
              </LazyWidget>
              <LazyWidget delay={2000}>
                <ErrorBoundary><SmartMoney /></ErrorBoundary>
              </LazyWidget>
              {isCrypto && (
                <LazyWidget delay={2500}>
                  <ErrorBoundary><WhaleTracker /></ErrorBoundary>
                </LazyWidget>
              )}
              {isGold && (
                <LazyWidget delay={2500}>
                  <ErrorBoundary><Correlations /></ErrorBoundary>
                </LazyWidget>
              )}
              {isGold && (
                <LazyWidget delay={2500}>
                  <ErrorBoundary><GoldMacro /></ErrorBoundary>
                </LazyWidget>
              )}
              <LazyWidget delay={2500}>
                <ErrorBoundary><COTReport /></ErrorBoundary>
              </LazyWidget>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
