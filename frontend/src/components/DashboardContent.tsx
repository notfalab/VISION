"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/layout/Header";
import BackendStatusBanner from "@/components/BackendStatusBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import CommunityModal from "@/components/CommunityModal";
import PriceChart from "@/components/charts/PriceChart";
import VolumeProfile from "@/components/charts/VolumeProfile";
import IndicatorPanel from "@/components/widgets/IndicatorPanel";
import ScalperMode from "@/components/widgets/ScalperMode";
import LazyWidget from "@/components/LazyWidget";
import SortableWidgetList from "@/components/SortableWidgetList";
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

/** Widget registry entry */
interface WidgetDef {
  id: string;
  delay: number;
  /** Only show if condition is true (default: always show) */
  condition?: boolean;
}

export default function DashboardContent({ initialSymbol, initialTimeframe }: { initialSymbol?: string; initialTimeframe?: import("@/types/market").Timeframe | null }) {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const setActiveSymbol = useMarketStore((s) => s.setActiveSymbol);
  const setActiveTimeframe = useMarketStore((s) => s.setActiveTimeframe);
  const chartExpanded = useMarketStore((s) => s.chartExpanded);
  const marketType = getMarketType(activeSymbol);
  const isGold = activeSymbol === "XAUUSD";
  const isCrypto = marketType === "crypto";

  // Sync URL symbol + timeframe → store on mount
  useEffect(() => {
    if (initialSymbol && initialSymbol !== activeSymbol) {
      setActiveSymbol(initialSymbol);
    }
    if (initialTimeframe) {
      setActiveTimeframe(initialTimeframe);
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

  // Widget registry — maps ID to component
  const WIDGET_COMPONENTS: Record<string, React.ReactNode> = useMemo(() => ({
    "scalper": <ErrorBoundary><ScalperMode /></ErrorBoundary>,
    "narrator": <ErrorBoundary><MarketNarrator /></ErrorBoundary>,
    "performance": <ErrorBoundary><PerformanceDashboard /></ErrorBoundary>,
    "trade-score": <ErrorBoundary><TradeScore /></ErrorBoundary>,
    "zones": <ErrorBoundary><ZonesOverlay /></ErrorBoundary>,
    "volume-profile": <ErrorBoundary><VolumeProfileWidget /></ErrorBoundary>,
    "divergence": <ErrorBoundary><DivergenceWidget /></ErrorBoundary>,
    "liquidity-forecast": <ErrorBoundary><LiquidityForecast /></ErrorBoundary>,
    "calendar": <ErrorBoundary><EconomicCalendar /></ErrorBoundary>,
    "sentiment": <ErrorBoundary><NewsSentiment /></ErrorBoundary>,
    "volatility": <ErrorBoundary><VolatilityForecast /></ErrorBoundary>,
    "heatmap": <ErrorBoundary><CurrencyHeatmap /></ErrorBoundary>,
    "ml-prediction": <ErrorBoundary><MLPrediction /></ErrorBoundary>,
    "order-flow": <ErrorBoundary><OrderFlow /></ErrorBoundary>,
    "tpsl": <ErrorBoundary><TPSLWidget /></ErrorBoundary>,
    "deep-orderbook": <ErrorBoundary><DeepOrderBookWidget /></ErrorBoundary>,
    "liquidation": <ErrorBoundary><LiquidationWidget /></ErrorBoundary>,
    "mtf": <ErrorBoundary><MTFConfluence /></ErrorBoundary>,
    "smart-money": <ErrorBoundary><SmartMoney /></ErrorBoundary>,
    "whale-tracker": <ErrorBoundary><WhaleTracker /></ErrorBoundary>,
    "correlations": <ErrorBoundary><Correlations /></ErrorBoundary>,
    "gold-macro": <ErrorBoundary><GoldMacro /></ErrorBoundary>,
    "cot": <ErrorBoundary><COTReport /></ErrorBoundary>,
  }), []);

  // Widget definitions with loading delays and conditional visibility
  const WIDGET_DEFS: WidgetDef[] = useMemo(() => [
    // Core
    { id: "scalper", delay: 0 },
    { id: "narrator", delay: 300 },
    { id: "performance", delay: 500 },
    { id: "trade-score", delay: 500 },
    // Zones & Volume
    { id: "zones", delay: 500 },
    { id: "volume-profile", delay: 700 },
    { id: "divergence", delay: 700 },
    { id: "liquidity-forecast", delay: 1500 },
    // Market Data
    { id: "calendar", delay: 1000 },
    { id: "sentiment", delay: 1000 },
    { id: "volatility", delay: 1200 },
    { id: "heatmap", delay: 1500 },
    // ML & Order Flow
    { id: "ml-prediction", delay: 1000 },
    { id: "order-flow", delay: 1000 },
    { id: "tpsl", delay: 1000 },
    { id: "deep-orderbook", delay: 1000 },
    { id: "liquidation", delay: 1500, condition: isCrypto },
    // Institutional
    { id: "mtf", delay: 2000 },
    { id: "smart-money", delay: 2000 },
    { id: "whale-tracker", delay: 2500, condition: isCrypto },
    { id: "correlations", delay: 2500, condition: isGold },
    { id: "gold-macro", delay: 2500, condition: isGold },
    { id: "cot", delay: 2500 },
  ], [isCrypto, isGold]);

  // Build widget entries for sortable list (filtered by condition)
  const widgetEntries = useMemo(() => {
    return WIDGET_DEFS
      .filter((def) => def.condition !== false)
      .map((def) => ({
        id: def.id,
        node: def.delay > 0 ? (
          <LazyWidget delay={def.delay}>
            {WIDGET_COMPONENTS[def.id]}
          </LazyWidget>
        ) : (
          WIDGET_COMPONENTS[def.id]
        ),
      }));
  }, [WIDGET_DEFS, WIDGET_COMPONENTS]);

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg-primary)] grid-pattern overflow-hidden lg:overflow-hidden">
      <Header />
      <BackendStatusBanner />

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
          <div className={`w-full lg:w-[440px] lg:shrink-0 lg:overflow-y-auto lg:min-h-0 px-1 sm:px-0 ${chartExpanded ? "hidden" : ""}`}>
            <SortableWidgetList widgets={widgetEntries} />
          </div>
        </div>
      </div>
    </div>
  );
}
