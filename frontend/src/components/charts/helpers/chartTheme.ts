import { THEME_CANVAS, type ThemeName } from "@/stores/theme";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  type DeepPartial,
  type ChartOptions,
  type CandlestickSeriesPartialOptions,
  type HistogramSeriesPartialOptions,
} from "lightweight-charts";

export function getChartOptions(theme: ThemeName): DeepPartial<ChartOptions> {
  const tc = THEME_CANVAS[theme];
  return {
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: tc.textMuted,
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 11,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: tc.grid, style: LineStyle.Dotted },
      horzLines: { color: tc.grid, style: LineStyle.Dotted },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: tc.textMuted,
        width: 1,
        style: LineStyle.Dotted,
        labelBackgroundColor: "#1e293b",
      },
      horzLine: {
        color: tc.textMuted,
        width: 1,
        style: LineStyle.Dotted,
        labelBackgroundColor: "#1e293b",
      },
    },
    rightPriceScale: {
      borderColor: tc.grid,
      scaleMargins: { top: 0.05, bottom: 0.25 },
    },
    timeScale: {
      borderColor: tc.grid,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      barSpacing: 8,
      minBarSpacing: 2,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  };
}

export function getCandlestickOptions(
  theme: ThemeName
): CandlestickSeriesPartialOptions {
  const tc = THEME_CANVAS[theme];
  return {
    upColor: tc.bull,
    downColor: tc.bear,
    borderUpColor: tc.bull,
    borderDownColor: tc.bear,
    wickUpColor: tc.bull,
    wickDownColor: tc.bear,
  };
}

export function getVolumeOptions(
  theme: ThemeName
): HistogramSeriesPartialOptions {
  const tc = THEME_CANVAS[theme];
  return {
    color: tc.bullAlpha,
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
    lastValueVisible: false,
    priceLineVisible: false,
  };
}
