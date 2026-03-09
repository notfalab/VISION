/**
 * Bar Stats — Intensity-graded overlay behind each candle.
 *
 * Grades each candle relative to full chart context by computing z-scores
 * for volume, range (high-low), and body (|close-open|). Anomalous bars
 * get vivid colored backgrounds, normal bars are invisible.
 *
 * Features:
 * - Volume, range, and body anomaly detection
 * - Cool-to-hot color gradient (transparent → yellow → orange → red)
 * - Stats badge when zoomed in showing which metrics are anomalous
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
export interface CandleForStats {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StatEntry {
  time: Time;
  low: number;
  high: number;
  intensity: number;  // 0-1 combined anomaly grade
  volX: number;       // volume multiplier vs average (e.g. 2.1x)
  rangeX: number;     // range multiplier
  bodyX: number;      // body multiplier
}

/* ── Color mapping — cool to hot ── */
function statColor(intensity: number): string {
  // intensity 0-1 → transparent → amber → orange → red
  if (intensity < 0.15) return "rgba(0,0,0,0)"; // invisible

  const t = Math.min(1, intensity);
  let r: number, g: number, b: number;

  if (t < 0.4) {
    // Faint yellow-amber
    const s = (t - 0.15) / 0.25;
    r = Math.floor(200 + s * 55);
    g = Math.floor(170 + s * 50);
    b = Math.floor(50 - s * 30);
  } else if (t < 0.7) {
    // Amber → orange
    const s = (t - 0.4) / 0.3;
    r = 255;
    g = Math.floor(220 - s * 100);
    b = Math.floor(20 - s * 20);
  } else {
    // Orange → red
    const s = (t - 0.7) / 0.3;
    r = 255;
    g = Math.floor(120 - s * 80);
    b = Math.floor(s * 30);
  }

  const alpha = 0.06 + t * 0.18;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

/* ── Renderer ── */
class BarStatsRenderer implements IPrimitivePaneRenderer {
  private _bars: { x: number; y: number; w: number; h: number; color: string; label: string }[] = [];

  setBars(bars: typeof this._bars): void {
    this._bars = bars;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._bars.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      // Pass 1: fill rectangles behind candles
      for (const bar of this._bars) {
        if (bar.h < 1) continue;
        ctx.fillStyle = bar.color;
        ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
      }

      // Pass 2: stat badges when zoomed in (bar width > 35px)
      const showLabels = this._bars.length > 0 && this._bars[0].w > 35;
      if (showLabels) {
        ctx.font = "bold 8px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        for (const bar of this._bars) {
          if (!bar.label) continue;
          // Background pill
          const metrics = ctx.measureText(bar.label);
          const pw = metrics.width + 6;
          const ph = 12;
          const px = bar.x + bar.w / 2 - pw / 2;
          const py = bar.y - ph - 2;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, 3);
          ctx.fill();
          ctx.fillStyle = "rgba(255,200,50,0.9)";
          ctx.fillText(bar.label, bar.x + bar.w / 2, bar.y - 3);
        }
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {
    // No foreground drawing needed
  }
}

/* ── View ── */
class BarStatsView implements IPrimitivePaneView {
  private _source: BarStatsPrimitive;
  private _renderer = new BarStatsRenderer();

  constructor(source: BarStatsPrimitive) {
    this._source = source;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _chart, _visible, _entries } = this._source;
    if (!_visible || !_entries.length || !_series || !_chart) {
      this._renderer.setBars([]);
      return this._renderer;
    }

    const timeScale = _chart.timeScale();
    const bars: { x: number; y: number; w: number; h: number; color: string; label: string }[] = [];

    // Calculate bar width from adjacent entries
    let barWidth = 6;
    if (_entries.length >= 2) {
      const x1 = timeScale.timeToCoordinate(_entries[0].time);
      const x2 = timeScale.timeToCoordinate(_entries[1].time);
      if (x1 !== null && x2 !== null) {
        barWidth = Math.max(2, Math.abs(x2 - x1));
      }
    }

    const halfW = barWidth / 2;

    for (const entry of _entries) {
      if (entry.intensity < 0.15) continue; // skip normal bars

      const x = timeScale.timeToCoordinate(entry.time);
      if (x === null) continue;

      const yHigh = _series.priceToCoordinate(entry.high);
      const yLow = _series.priceToCoordinate(entry.low);
      if (yHigh === null || yLow === null) continue;

      const top = Math.min(yHigh, yLow);
      const height = Math.max(2, Math.abs(yLow - yHigh));

      // Build label showing which metrics are anomalous (only for significant ones)
      let label = "";
      if (barWidth > 35) {
        const parts: string[] = [];
        if (entry.volX >= 1.5) parts.push(`V:${entry.volX.toFixed(1)}x`);
        if (entry.rangeX >= 1.5) parts.push(`R:${entry.rangeX.toFixed(1)}x`);
        if (entry.bodyX >= 1.5) parts.push(`B:${entry.bodyX.toFixed(1)}x`);
        label = parts.join(" ");
      }

      bars.push({
        x: x - halfW,
        y: top,
        w: barWidth,
        h: height,
        color: statColor(entry.intensity),
        label,
      });
    }

    this._renderer.setBars(bars);
    return this._renderer;
  }
}

/* ── Primitive ── */
export class BarStatsPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _visible = false;
  _entries: StatEntry[] = [];

  private _requestUpdate: (() => void) | null = null;
  private _view = new BarStatsView(this);
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
   * Compute bar stats from OHLCV candles.
   * Grades each candle's volume, range, and body relative to chart averages.
   */
  updateData(candles: CandleForStats[]): void {
    if (candles.length < 5) {
      this._entries = [];
      this._requestUpdate?.();
      return;
    }

    // Compute averages and standard deviations
    let sumVol = 0, sumRange = 0, sumBody = 0;
    const volumes: number[] = [];
    const ranges: number[] = [];
    const bodies: number[] = [];

    for (const c of candles) {
      const vol = c.volume;
      const range = c.high - c.low;
      const body = Math.abs(c.close - c.open);
      sumVol += vol;
      sumRange += range;
      sumBody += body;
      volumes.push(vol);
      ranges.push(range);
      bodies.push(body);
    }

    const n = candles.length;
    const avgVol = sumVol / n || 1;
    const avgRange = sumRange / n || 1;
    const avgBody = sumBody / n || 1;

    // Std deviations
    let varVol = 0, varRange = 0, varBody = 0;
    for (let i = 0; i < n; i++) {
      varVol += (volumes[i] - avgVol) ** 2;
      varRange += (ranges[i] - avgRange) ** 2;
      varBody += (bodies[i] - avgBody) ** 2;
    }
    const stdVol = Math.sqrt(varVol / n) || 1;
    const stdRange = Math.sqrt(varRange / n) || 1;
    const stdBody = Math.sqrt(varBody / n) || 1;

    const entries: StatEntry[] = [];

    for (const c of candles) {
      const volZ = Math.max(0, (c.volume - avgVol) / stdVol);
      const rangeZ = Math.max(0, ((c.high - c.low) - avgRange) / stdRange);
      const bodyZ = Math.max(0, (Math.abs(c.close - c.open) - avgBody) / stdBody);

      // Combined intensity: max of z-scores, mapped to 0-1 (z=3 → 1.0)
      const maxZ = Math.max(volZ, rangeZ, bodyZ);
      const intensity = Math.min(1, maxZ / 3);

      entries.push({
        time: c.time,
        low: c.low,
        high: c.high,
        intensity,
        volX: c.volume / avgVol,
        rangeX: (c.high - c.low) / avgRange,
        bodyX: Math.abs(c.close - c.open) / avgBody,
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
