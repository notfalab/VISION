"use client";

import Header from "@/components/layout/Header";
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

export default function Dashboard() {
  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg-primary)] grid-pattern overflow-hidden lg:overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 p-2 overflow-y-auto lg:overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-2 lg:h-full">
          {/* Left: Chart + Bottom row */}
          <div className="lg:flex-1 flex flex-col gap-2 min-w-0 lg:min-h-0">
            {/* Chart */}
            <div className="h-[300px] md:h-[400px] lg:flex-1 lg:min-h-0 shrink-0 lg:shrink">
              <PriceChart />
            </div>

            {/* Bottom row: Volume Profile + Indicators (desktop only) */}
            <div className="hidden lg:flex gap-2 shrink-0" style={{ height: "240px" }}>
              <div className="w-40 shrink-0 h-full">
                <VolumeProfile />
              </div>
              <div className="flex-1 min-w-0 h-full">
                <IndicatorPanel />
              </div>
            </div>
          </div>

          {/* Right panel — scrollable on desktop, inline on mobile */}
          <div className="w-full lg:w-[340px] lg:shrink-0 lg:overflow-y-auto lg:min-h-0">
            <div className="space-y-2">
              <ScalperMode />
              <TradeScore />
              <MLPrediction />
              <OrderFlow />
              <MTFConfluence />
              <SmartMoney />
              <Correlations />
              <GoldMacro />
              <COTReport />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
