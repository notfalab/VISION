/**
 * Volume Bubbles — Visual footprint-like market order size overlay.
 *
 * Renders scaled circles on each candle, sized proportionally to volume
 * and colored by buy/sell pressure (bullish = green, bearish = red).
 *
 * Features:
 * - Volume threshold filtering (show only above-average bars)
 * - Custom bubble scaling with sqrt normalization
 * - Alpha intensity mapped to volume magnitude
 * - Volume text labels when zoomed in
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
export interface CandleForBubbles {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BubbleEntry {
  time: Time;
  price: number;     // midpoint (high+low)/2
  radius: number;    // normalized radius (pixels, set during render)
  bullish: boolean;
  volume: number;    // raw volume for label
  intensity: number; // 0-1 for alpha
}

/* ── Colors ── */
const BULL_COLOR = { r: 16, g: 185, b: 129 };  // emerald-500
const BEAR_COLOR = { r: 239, g: 68, b: 68 };   // red-500

function bubbleColor(bullish: boolean, intensity: number): string {
  const c = bullish ? BULL_COLOR : BEAR_COLOR;
  const alpha = 0.20 + 0.45 * intensity;
  return `rgba(${c.r},${c.g},${c.b},${alpha.toFixed(3)})`;
}

function bubbleStroke(bullish: boolean): string {
  const c = bullish ? BULL_COLOR : BEAR_COLOR;
  return `rgba(${c.r},${c.g},${c.b},0.5)`;
}

/* ── Renderer ── */
class VolBubblesRenderer implements IPrimitivePaneRenderer {
  private _bubbles: { x: number; y: number; r: number; bullish: boolean; intensity: number; volume: number }[] = [];

  setBubbles(bubbles: typeof this._bubbles): void {
    this._bubbles = bubbles;
  }

  drawBackground(_target: CanvasRenderingTarget2D): void {
    // No background drawing — bubbles render above candles
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._bubbles.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      // Pass 1: fill bubbles
      for (const b of this._bubbles) {
        if (b.r < 1) continue;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = bubbleColor(b.bullish, b.intensity);
        ctx.fill();
        ctx.strokeStyle = bubbleStroke(b.bullish);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Pass 2: volume text when zoomed in (radius > 18px)
      const showLabels = this._bubbles.some((b) => b.r > 18);
      if (showLabels) {
        ctx.font = "bold 9px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const b of this._bubbles) {
          if (b.r < 18) continue;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillText(formatVol(b.volume), b.x, b.y);
        }
      }
    });
  }
}

/** Compact volume label: 1.2K, 3.4M, etc. */
function formatVol(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(0);
}

/* ── View ── */
class VolBubblesView implements IPrimitivePaneView {
  private _source: VolumeBubblesPrimitive;
  private _renderer = new VolBubblesRenderer();

  constructor(source: VolumeBubblesPrimitive) {
    this._source = source;
  }

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _chart, _visible, _entries } = this._source;
    if (!_visible || !_entries.length || !_series || !_chart) {
      this._renderer.setBubbles([]);
      return this._renderer;
    }

    const timeScale = _chart.timeScale();
    const bubbles: { x: number; y: number; r: number; bullish: boolean; intensity: number; volume: number }[] = [];

    // Calculate base radius from bar width
    let barWidth = 8;
    if (_entries.length >= 2) {
      const x1 = timeScale.timeToCoordinate(_entries[0].time);
      const x2 = timeScale.timeToCoordinate(_entries[1].time);
      if (x1 !== null && x2 !== null) {
        barWidth = Math.max(3, Math.abs(x2 - x1));
      }
    }

    const minR = Math.max(2, barWidth * 0.3);
    const maxR = Math.max(8, barWidth * 2.5);

    for (const entry of _entries) {
      const x = timeScale.timeToCoordinate(entry.time);
      if (x === null) continue;

      const y = _series.priceToCoordinate(entry.price);
      if (y === null) continue;

      // Scale radius between min and max based on intensity
      const r = minR + (maxR - minR) * entry.intensity;

      bubbles.push({
        x,
        y,
        r,
        bullish: entry.bullish,
        intensity: entry.intensity,
        volume: entry.volume,
      });
    }

    this._renderer.setBubbles(bubbles);
    return this._renderer;
  }
}

/* ── Primitive ── */
export class VolumeBubblesPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _visible = false;
  _entries: BubbleEntry[] = [];

  private _requestUpdate: (() => void) | null = null;
  private _view = new VolBubblesView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

  constructor(_theme: ThemeName) {
    // Theme stored for potential future use
  }

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

  updateAllViews(): void {
    // Views read from _source directly
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  /**
   * Update bubble data from OHLCV candles.
   * @param candles — OHLCV data with Time timestamps
   * @param threshold — minimum volume multiplier vs average (1.0 = show all, 2.0 = show 2x+ avg)
   * @param scale — bubble size multiplier (1.0 = normal)
   */
  updateData(candles: CandleForBubbles[], threshold: number = 1.0, scale: number = 1.0): void {
    if (candles.length === 0) {
      this._entries = [];
      this._requestUpdate?.();
      return;
    }

    // Compute average volume
    let totalVol = 0;
    for (const c of candles) totalVol += c.volume;
    const avgVol = totalVol / candles.length || 1;

    // Find max volume for normalization
    let maxVol = 0;
    for (const c of candles) {
      if (c.volume > maxVol) maxVol = c.volume;
    }
    if (maxVol === 0) maxVol = 1;

    const entries: BubbleEntry[] = [];
    const thresholdVol = avgVol * threshold;

    for (const c of candles) {
      if (c.volume < thresholdVol) continue;

      // Intensity: sqrt-normalized relative to max (prevents outlier domination)
      const rawIntensity = Math.sqrt(c.volume / maxVol);
      const intensity = Math.min(1, rawIntensity * scale);

      entries.push({
        time: c.time,
        price: (c.high + c.low) / 2,
        radius: 0, // computed during render based on screen coords
        bullish: c.close >= c.open,
        volume: c.volume,
        intensity,
      });
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
