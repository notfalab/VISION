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
    <div className="h-screen flex flex-col bg-[var(--color-bg-primary)] grid-pattern">
      <Header />
      <div className="flex-1 min-h-0 p-2">
        <div className="flex gap-2 h-full">
          {/* Left: Chart + Bottom row */}
          <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
            {/* Chart */}
            <div className="flex-1 min-h-0">
              <PriceChart />
            </div>

            {/* Bottom row: Volume Profile + Indicators */}
            <div className="flex gap-2 shrink-0" style={{ height: "240px" }}>
              <div className="w-40 shrink-0 h-full">
                <VolumeProfile />
              </div>
              <div className="flex-1 min-w-0 h-full">
                <IndicatorPanel />
              </div>
            </div>
          </div>

          {/* Right panel — scrollable */}
          <div className="w-[340px] shrink-0 overflow-y-auto min-h-0">
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
