"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Settings, RotateCcw } from "lucide-react";
import Header from "@/components/layout/Header";
import BackendStatusBanner from "@/components/BackendStatusBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
const PriceChart = dynamic(() => import("@/components/charts/PriceChart"), { ssr: false });
import VolumeProfile from "@/components/charts/VolumeProfile";
import IndicatorPanel from "@/components/widgets/IndicatorPanel";
import LazyWidget from "@/components/LazyWidget";
import SortableWidgetList from "@/components/SortableWidgetList";
import { useMarketStore, getMarketType } from "@/stores/market";
import { useWidgetLayoutStore } from "@/stores/widgetLayout";
import { useAuthStore } from "@/stores/auth";
import OnboardingTour from "@/components/OnboardingTour";

// Lazy-load heavy widgets — they won't be included in the initial JS bundle
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
const ZoneRetestProbability = dynamic(() => import("@/components/widgets/ZoneRetestProbability"), { ssr: false });
const SpreadMonitor = dynamic(() => import("@/components/widgets/SpreadMonitor"), { ssr: false });
const GoldETFFlows = dynamic(() => import("@/components/widgets/GoldETFFlows"), { ssr: false });
const CentralBankGold = dynamic(() => import("@/components/widgets/CentralBankGold"), { ssr: false });
const TradeJournal = dynamic(() => import("@/components/widgets/TradeJournal"), { ssr: false });
const AlertsPanel = dynamic(() => import("@/components/widgets/AlertsPanel"), { ssr: false });
const SessionStats = dynamic(() => import("@/components/widgets/SessionStats"), { ssr: false });

/** Widget registry entry */
interface WidgetDef {
  id: string;
  label: string;
  delay: number;
  /** Only show if condition is true (default: always show) */
  condition?: boolean;
}

// Widget registry — module-level constant (stable references, never recreated on render)
const WIDGET_COMPONENTS: Record<string, () => React.ReactNode> = {
  "narrator": () => <ErrorBoundary><MarketNarrator /></ErrorBoundary>,
  "trade-score": () => <ErrorBoundary><TradeScore /></ErrorBoundary>,
  "zones": () => <ErrorBoundary><ZonesOverlay /></ErrorBoundary>,
  "zone-retest": () => <ErrorBoundary><ZoneRetestProbability /></ErrorBoundary>,
  "volume-profile": () => <ErrorBoundary><VolumeProfileWidget /></ErrorBoundary>,
  "divergence": () => <ErrorBoundary><DivergenceWidget /></ErrorBoundary>,
  "liquidity-forecast": () => <ErrorBoundary><LiquidityForecast /></ErrorBoundary>,
  "calendar": () => <ErrorBoundary><EconomicCalendar /></ErrorBoundary>,
  "sentiment": () => <ErrorBoundary><NewsSentiment /></ErrorBoundary>,
  "volatility": () => <ErrorBoundary><VolatilityForecast /></ErrorBoundary>,
  "heatmap": () => <ErrorBoundary><CurrencyHeatmap /></ErrorBoundary>,
  "ml-prediction": () => <ErrorBoundary><MLPrediction /></ErrorBoundary>,
  "order-flow": () => <ErrorBoundary><OrderFlow /></ErrorBoundary>,
  "tpsl": () => <ErrorBoundary><TPSLWidget /></ErrorBoundary>,
  "deep-orderbook": () => <ErrorBoundary><DeepOrderBookWidget /></ErrorBoundary>,
  "liquidation": () => <ErrorBoundary><LiquidationWidget /></ErrorBoundary>,
  "mtf": () => <ErrorBoundary><MTFConfluence /></ErrorBoundary>,
  "smart-money": () => <ErrorBoundary><SmartMoney /></ErrorBoundary>,
  "whale-tracker": () => <ErrorBoundary><WhaleTracker /></ErrorBoundary>,
  "correlations": () => <ErrorBoundary><Correlations /></ErrorBoundary>,
  "gold-macro": () => <ErrorBoundary><GoldMacro /></ErrorBoundary>,
  "cot": () => <ErrorBoundary><COTReport /></ErrorBoundary>,
  "spread-monitor": () => <ErrorBoundary><SpreadMonitor /></ErrorBoundary>,
  "etf-flows": () => <ErrorBoundary><GoldETFFlows /></ErrorBoundary>,
  "central-bank": () => <ErrorBoundary><CentralBankGold /></ErrorBoundary>,
  "trade-journal": () => <ErrorBoundary><TradeJournal /></ErrorBoundary>,
  "alerts": () => <ErrorBoundary><AlertsPanel /></ErrorBoundary>,
  "session-stats": () => <ErrorBoundary><SessionStats /></ErrorBoundary>,
};

// Widgets available during trial (limited set)
const TRIAL_WIDGETS = new Set(["narrator", "zones", "calendar", "cot"]);

export default function DashboardContent({ initialSymbol, initialTimeframe }: { initialSymbol?: string; initialTimeframe?: import("@/types/market").Timeframe | null }) {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const setActiveSymbol = useMarketStore((s) => s.setActiveSymbol);
  const setActiveTimeframe = useMarketStore((s) => s.setActiveTimeframe);
  const chartExpanded = useMarketStore((s) => s.chartExpanded);
  const marketType = getMarketType(activeSymbol);
  const isGold = activeSymbol === "XAUUSD";
  const isCrypto = marketType === "crypto";

  const user = useAuthStore((s) => s.user);
  const isTrial = user?.subscription_status === "trial";
  const trialDays = user?.days_remaining ?? 0;

  const hiddenWidgets = useWidgetLayoutStore((s) => s.hiddenWidgets);
  const toggleWidget = useWidgetLayoutStore((s) => s.toggleWidget);
  const resetOrder = useWidgetLayoutStore((s) => s.resetOrder);
  const [showSettings, setShowSettings] = useState(false);

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

  // Widget definitions with loading delays, labels, and conditional visibility
  const WIDGET_DEFS: WidgetDef[] = useMemo(() => [
    { id: "narrator", label: "Market Narrator", delay: 300 },
    { id: "trade-score", label: "Trade Score", delay: 500 },
    { id: "zones", label: "Supply/Demand Zones", delay: 500 },
    { id: "zone-retest", label: "Zone Retest Prob.", delay: 800 },
    { id: "volume-profile", label: "Volume Profile", delay: 700 },
    { id: "divergence", label: "Divergence", delay: 700 },
    { id: "liquidity-forecast", label: "Liquidity Forecast", delay: 1500 },
    { id: "calendar", label: "Economic Calendar", delay: 1000 },
    { id: "sentiment", label: "News Sentiment", delay: 1000 },
    { id: "volatility", label: "Volatility Forecast", delay: 1200 },
    // CurrencyHeatmap removed — only works for forex pairs, not gold
    { id: "ml-prediction", label: "ML Prediction", delay: 1000 },
    { id: "order-flow", label: "Order Flow", delay: 1000 },
    { id: "tpsl", label: "TP/SL Heatmap", delay: 1000 },
    { id: "deep-orderbook", label: "Deep Order Book", delay: 1000 },
    { id: "liquidation", label: "Liquidation Map", delay: 1500, condition: isCrypto },
    { id: "mtf", label: "Multi-Timeframe", delay: 2000 },
    { id: "smart-money", label: "Smart Money", delay: 2000 },
    { id: "whale-tracker", label: "Whale Tracker", delay: 2500, condition: isCrypto },
    { id: "correlations", label: "Correlations", delay: 2500, condition: isGold },
    { id: "gold-macro", label: "Gold Macro", delay: 2500, condition: isGold },
    { id: "cot", label: "COT Report", delay: 2500 },
  ], [isCrypto, isGold]);

  // Build widget entries for sortable list (filtered by condition + hidden + trial)
  const widgetEntries = useMemo(() => {
    return WIDGET_DEFS
      .filter((def) => def.condition !== false)
      .filter((def) => !hiddenWidgets.includes(def.id))
      .filter((def) => !isTrial || TRIAL_WIDGETS.has(def.id))
      .map((def) => ({
        id: def.id,
        node: def.delay > 0 ? (
          <LazyWidget delay={def.delay}>
            {WIDGET_COMPONENTS[def.id]()}
          </LazyWidget>
        ) : (
          WIDGET_COMPONENTS[def.id]()
        ),
      }));
  }, [WIDGET_DEFS, hiddenWidgets, isTrial]);

  // Widgets available for settings panel (only those passing condition)
  const availableWidgets = useMemo(
    () => WIDGET_DEFS.filter((d) => d.condition !== false),
    [WIDGET_DEFS],
  );

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg-primary)] grid-pattern overflow-hidden lg:overflow-hidden">
      <OnboardingTour />
      <Header />
      <BackendStatusBanner />
      <div className="flex-1 min-h-0 p-2 md:p-3 overflow-y-auto lg:overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-2 md:gap-3 lg:h-full">
          {/* Left: Chart + Bottom row */}
          <div className="lg:flex-1 flex flex-col gap-2 min-w-0 lg:min-h-0" data-tour="chart">
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
          <div className={`w-full lg:w-[440px] lg:shrink-0 lg:overflow-y-auto lg:min-h-0 px-1 sm:px-0 ${chartExpanded ? "hidden" : ""}`} data-tour="widgets">
            {/* Widget toolbar */}
            <div className="flex items-center justify-between px-1 py-1.5 mb-1">
              <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Widgets ({widgetEntries.length})
              </span>
              {!isTrial && (
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded transition-colors ${
                    showSettings ? "bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)]" : "hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
                  }`}
                  title="Toggle widget visibility"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {showSettings && (
              <div className="card-glass rounded-lg mb-2 p-3 space-y-0.5 max-h-[300px] overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase">
                    Show / Hide
                  </p>
                  <button
                    onClick={resetOrder}
                    className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-neon-blue)] transition-colors"
                    title="Reset to defaults"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
                {availableWidgets.map((def) => (
                  <label key={def.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--color-bg-hover)] rounded px-1">
                    <input
                      type="checkbox"
                      checked={!hiddenWidgets.includes(def.id)}
                      onChange={() => toggleWidget(def.id)}
                      className="accent-[var(--color-neon-blue)] w-3.5 h-3.5"
                    />
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {def.label}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <SortableWidgetList widgets={widgetEntries} />

            {/* Trial upgrade banner */}
            {isTrial && (
              <div className="mt-3 rounded-lg border border-[var(--color-neon-amber)]/30 bg-[var(--color-neon-amber)]/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-neon-amber)] animate-pulse" />
                  <span className="text-[11px] font-bold text-[var(--color-neon-amber)] uppercase tracking-wider">
                    Free Trial — {trialDays} day{trialDays !== 1 ? "s" : ""} remaining
                  </span>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mb-3 leading-relaxed">
                  You're viewing a limited preview. Upgrade to unlock{" "}
                  <span className="font-semibold text-[var(--color-text-secondary)]">20+ professional widgets</span>,{" "}
                  <span className="font-semibold text-[var(--color-text-secondary)]">ML predictions</span>,{" "}
                  <span className="font-semibold text-[var(--color-text-secondary)]">smart money analysis</span>,{" "}
                  <span className="font-semibold text-[var(--color-text-secondary)]">order flow</span>, and more.
                </p>
                <a
                  href="/subscription"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[var(--color-neon-amber)] text-black hover:bg-[var(--color-neon-amber)]/90 transition-all"
                >
                  Upgrade — $4,999/year
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
