/**
 * Fair Value Gap (FVG) — Smart Money Concepts overlay.
 *
 * Detects price imbalances where a candle's range doesn't overlap
 * with the candle two bars prior, leaving a "gap" in fair value.
 *
 * Bullish FVG: candle[i+1].low > candle[i-1].high
 * Bearish FVG: candle[i+1].high < candle[i-1].low
 *
 * FVGs are mitigated (dimmed) when price revisits the gap zone.
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

/* ── Types ── */
interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface FVG {
  type: "bullish" | "bearish";
  startTime: number;
  endTime: number;
  priceTop: number;
  priceBottom: number;
  mitigated: boolean;
}

/* ── Detection ── */
export function detectFVGs(candles: OHLCV[]): FVG[] {
  if (candles.length < 3) return [];
  const fvgs: FVG[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    // Bullish FVG: gap between prev.high and next.low
    if (next.low > prev.high) {
      const gap: FVG = {
        type: "bullish",
        startTime: curr.time,
        endTime: next.time,
        priceTop: next.low,
        priceBottom: prev.high,
        mitigated: false,
      };
      // Check mitigation: any subsequent candle's low enters the zone
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].low <= gap.priceTop) {
          gap.mitigated = true;
          break;
        }
      }
      fvgs.push(gap);
    }

    // Bearish FVG: gap between next.high and prev.low
    if (next.high < prev.low) {
      const gap: FVG = {
        type: "bearish",
        startTime: curr.time,
        endTime: next.time,
        priceTop: prev.low,
        priceBottom: next.high,
        mitigated: false,
      };
      // Check mitigation: any subsequent candle's high enters the zone
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].high >= gap.priceBottom) {
          gap.mitigated = true;
          break;
        }
      }
      fvgs.push(gap);
    }
  }

  return fvgs;
}

/* ── Renderer ── */
class FVGRenderer implements IPrimitivePaneRenderer {
  private _fvgs: FVG[] = [];
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: any = null;

  setData(fvgs: FVG[], series: ISeriesApi<SeriesType, Time>, chart: any): void {
    this._fvgs = fvgs;
    this._series = series;
    this._chart = chart;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._fvgs.length === 0 || !this._series || !this._chart) return;

    const timeScale = this._chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const fvg of this._fvgs) {
        const x1 = timeScale.timeToCoordinate(fvg.startTime as unknown as Time);
        if (x1 === null) continue;

        const yTop = this._series!.priceToCoordinate(fvg.priceTop);
        const yBot = this._series!.priceToCoordinate(fvg.priceBottom);
        if (yTop === null || yBot === null) continue;

        const rectH = Math.abs(yBot - yTop);
        if (rectH < 1) continue;

        const y = Math.min(yTop, yBot);
        // Extend to right edge of chart
        const rectW = mediaSize.width - x1;
        if (rectW < 2) continue;

        const alpha = fvg.mitigated ? 0.04 : 0.12;
        const borderAlpha = fvg.mitigated ? 0.08 : 0.35;

        if (fvg.type === "bullish") {
          ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
          ctx.fillRect(x1, y, rectW, rectH);
          // Top/bottom border lines
          ctx.strokeStyle = `rgba(34, 197, 94, ${borderAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, yTop);
          ctx.lineTo(x1 + rectW, yTop);
          ctx.moveTo(x1, yBot);
          ctx.lineTo(x1 + rectW, yBot);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.fillRect(x1, y, rectW, rectH);
          ctx.strokeStyle = `rgba(239, 68, 68, ${borderAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, yTop);
          ctx.lineTo(x1 + rectW, yTop);
          ctx.moveTo(x1, yBot);
          ctx.lineTo(x1 + rectW, yBot);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Label at left edge (only for unmitigated)
        if (!fvg.mitigated && rectH > 10) {
          ctx.font = "bold 8px JetBrains Mono, monospace";
          ctx.textAlign = "left";
          ctx.fillStyle = fvg.type === "bullish"
            ? "rgba(34, 197, 94, 0.6)"
            : "rgba(239, 68, 68, 0.6)";
          ctx.fillText("FVG", x1 + 3, y + rectH / 2 + 3);
        }
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {}
}

/* ── View ── */
class FVGView implements IPrimitivePaneView {
  private _source: FVGPrimitive;
  private _renderer = new FVGRenderer();

  constructor(source: FVGPrimitive) {
    this._source = source;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _chart, _visible, _fvgs } = this._source;
    if (!_visible || !_series || !_chart || _fvgs.length === 0) {
      this._renderer.setData([], null as any, null);
      return this._renderer;
    }
    this._renderer.setData(_fvgs, _series, _chart);
    return this._renderer;
  }
}

/* ── Primitive ── */
export class FVGPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _visible = false;
  _fvgs: FVG[] = [];

  private _requestUpdate: (() => void) | null = null;
  private _view = new FVGView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

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

  update(visible: boolean, candles: OHLCV[]): void {
    this._visible = visible;
    if (visible && candles.length >= 3) {
      this._fvgs = detectFVGs(candles);
    } else {
      this._fvgs = [];
    }
    this._requestUpdate?.();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    if (!visible) this._fvgs = [];
    this._requestUpdate?.();
  }

  setTheme(): void {
    this._requestUpdate?.();
  }
}
