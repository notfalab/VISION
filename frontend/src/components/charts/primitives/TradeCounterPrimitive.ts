/**
 * Trade Counter — Dual histogram showing estimated buy/sell trade counts.
 *
 * Renders a dual histogram at the bottom of the chart pane:
 * - Buy bars (green) extend upward from a baseline
 * - Sell bars (red) extend downward from the baseline
 *
 * Trade counts are estimated from OHLCV data by splitting volume
 * based on candle direction and body-to-range ratio.
 *
 * Features:
 * - Independent market buy & sell counts
 * - Dual histogram render with distinct colors
 * - Visual distinctive across timeframes
 *
 * Follows the ISeriesPrimitive<Time> pattern used by all chart overlays.
 */

import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesType,
  ISeriesApi,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { ThemeName } from "@/stores/theme";

/* ── Types ── */
export interface CandleForTrades {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradeEntry {
  time: Time;
  buyCount: number;
  sellCount: number;
  buyIntensity: number;  // 0-1 normalized
  sellIntensity: number; // 0-1 normalized
}

/* ── Colors ── */
const BUY_FILL = "rgba(16,185,129,0.35)";   // emerald
const BUY_STROKE = "rgba(16,185,129,0.6)";
const SELL_FILL = "rgba(239,68,68,0.35)";    // red
const SELL_STROKE = "rgba(239,68,68,0.6)";
const BASELINE_COLOR = "rgba(148,163,184,0.2)"; // slate-400

/* ── Renderer ── */
class TradeCounterRenderer implements IPrimitivePaneRenderer {
  private _bars: {
    x: number; w: number;
    buyH: number; sellH: number;
    baseline: number;
    buyCount: number; sellCount: number;
  }[] = [];

  setBars(bars: typeof this._bars): void {
    this._bars = bars;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._bars.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const baseline = mediaSize.height * 0.87;
      const maxBarH = mediaSize.height * 0.10;

      // Draw baseline
      ctx.strokeStyle = BASELINE_COLOR;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, baseline);
      ctx.lineTo(mediaSize.width, baseline);
      ctx.stroke();

      // Draw bars — buyH/sellH are 0-1 intensity, scale to maxBarH pixels
      for (const bar of this._bars) {
        const halfW = bar.w / 2;
        const barW = Math.max(1, bar.w - 1);
        const buyPx = bar.buyH * maxBarH;
        const sellPx = bar.sellH * maxBarH;

        // Buy bar (upward from baseline)
        if (buyPx > 0.5) {
          ctx.fillStyle = BUY_FILL;
          ctx.fillRect(bar.x - halfW + 0.5, baseline - buyPx, barW, buyPx);
          ctx.strokeStyle = BUY_STROKE;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(bar.x - halfW + 0.5, baseline - buyPx, barW, buyPx);
        }

        // Sell bar (downward from baseline)
        if (sellPx > 0.5) {
          ctx.fillStyle = SELL_FILL;
          ctx.fillRect(bar.x - halfW + 0.5, baseline, barW, sellPx);
          ctx.strokeStyle = SELL_STROKE;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(bar.x - halfW + 0.5, baseline, barW, sellPx);
        }
      }

      // Pass 2: count labels when zoomed in (bar width > 30px)
      const showLabels = this._bars.length > 0 && this._bars[0].w > 30;
      if (showLabels) {
        ctx.font = "bold 8px JetBrains Mono, monospace";
        ctx.textAlign = "center";

        for (const bar of this._bars) {
          const buyPx = bar.buyH * maxBarH;
          const sellPx = bar.sellH * maxBarH;

          if (buyPx > 10) {
            ctx.textBaseline = "bottom";
            ctx.fillStyle = "rgba(16,185,129,0.9)";
            ctx.fillText(String(Math.round(bar.buyCount)), bar.x, baseline - buyPx - 1);
          }
          if (sellPx > 10) {
            ctx.textBaseline = "top";
            ctx.fillStyle = "rgba(239,68,68,0.9)";
            ctx.fillText(String(Math.round(bar.sellCount)), bar.x, baseline + sellPx + 1);
          }
        }
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {
    // No foreground drawing needed
  }
}

/* ── View ── */
class TradeCounterView implements IPrimitivePaneView {
  private _source: TradeCounterPrimitive;
  private _renderer = new TradeCounterRenderer();

  constructor(source: TradeCounterPrimitive) {
    this._source = source;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _chart, _visible, _entries, _maxCount } = this._source;
    if (!_visible || !_entries.length || !_series || !_chart) {
      this._renderer.setBars([]);
      return this._renderer;
    }

    const timeScale = _chart.timeScale();
    const bars: {
      x: number; w: number;
      buyH: number; sellH: number;
      baseline: number;
      buyCount: number; sellCount: number;
    }[] = [];

    // Calculate bar width
    let barWidth = 6;
    if (_entries.length >= 2) {
      const x1 = timeScale.timeToCoordinate(_entries[0].time);
      const x2 = timeScale.timeToCoordinate(_entries[1].time);
      if (x1 !== null && x2 !== null) {
        barWidth = Math.max(2, Math.abs(x2 - x1));
      }
    }

    // Pass entries with x coordinates — baseline/height computed in renderer with mediaSize
    for (const entry of _entries) {
      const x = timeScale.timeToCoordinate(entry.time);
      if (x === null) continue;

      bars.push({
        x,
        w: barWidth,
        buyH: entry.buyIntensity,   // 0-1, renderer scales to pixels
        sellH: entry.sellIntensity, // 0-1, renderer scales to pixels
        baseline: 0, // computed in renderer
        buyCount: entry.buyCount,
        sellCount: entry.sellCount,
      });
    }

    this._renderer.setBars(bars);
    return this._renderer;
  }
}

/* ── Primitive ── */
export class TradeCounterPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _visible = false;
  _entries: TradeEntry[] = [];
  _maxCount = 1;

  private _requestUpdate: (() => void) | null = null;
  private _view = new TradeCounterView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

  constructor(_theme: ThemeName) {}

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series;
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._series = null;
    this._chart = null;
    this._requestUpdate = null;
  }

  updateAllViews(): void {}

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  /**
   * Compute trade counts from OHLCV candles.
   * Splits volume into buy/sell based on candle direction and body-to-range ratio.
   */
  updateData(candles: CandleForTrades[]): void {
    if (candles.length < 2) {
      this._entries = [];
      this._requestUpdate?.();
      return;
    }

    // Compute average volume for normalization to ~100 trades baseline
    let totalVol = 0;
    for (const c of candles) totalVol += c.volume;
    const avgVol = totalVol / candles.length || 1;

    const entries: TradeEntry[] = [];
    let maxBuy = 0;
    let maxSell = 0;

    for (const c of candles) {
      const range = c.high - c.low;
      const body = Math.abs(c.close - c.open);
      const bullish = c.close >= c.open;

      // Body-to-range ratio determines how directional the bar was
      // Higher ratio = more one-sided, so split is more extreme
      const bodyRatio = range > 0 ? Math.min(1, body / range) : 0.5;

      // Base split: 60/40 for directional bar, adjusted by body ratio
      // bodyRatio 0 → 50/50, bodyRatio 1 → 70/30
      const dominantPct = 0.50 + bodyRatio * 0.20;
      const minorPct = 1 - dominantPct;

      let buyVol: number, sellVol: number;
      if (bullish) {
        buyVol = c.volume * dominantPct;
        sellVol = c.volume * minorPct;
      } else {
        sellVol = c.volume * dominantPct;
        buyVol = c.volume * minorPct;
      }

      // Normalize to trade count (avg volume = 100 trades)
      const buyCount = (buyVol / avgVol) * 100;
      const sellCount = (sellVol / avgVol) * 100;

      if (buyCount > maxBuy) maxBuy = buyCount;
      if (sellCount > maxSell) maxSell = sellCount;

      entries.push({
        time: c.time,
        buyCount,
        sellCount,
        buyIntensity: 0, // set below after max is known
        sellIntensity: 0,
      });
    }

    // Normalize intensities
    const maxC = Math.max(maxBuy, maxSell, 1);
    this._maxCount = maxC;
    for (const e of entries) {
      e.buyIntensity = e.buyCount / maxC;
      e.sellIntensity = e.sellCount / maxC;
    }

    this._entries = entries;
    this._requestUpdate?.();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this._requestUpdate?.();
  }

  isVisible(): boolean {
    return this._visible;
  }

  setTheme(_theme: ThemeName): void {
    this._requestUpdate?.();
  }
}
