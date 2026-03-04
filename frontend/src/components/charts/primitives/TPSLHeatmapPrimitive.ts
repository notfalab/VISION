/**
 * TP/SL Heatmap chart primitive — draws estimated take-profit and
 * stop-loss order cluster zones on the candlestick chart.
 *
 * Follows the same ISeriesPrimitive pattern as AccZonePrimitive.
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
import { THEME_CANVAS, type ThemeName, type CanvasColors } from "@/stores/theme";

/* ── Types ── */
export interface TPSLCluster {
  price_min: number;
  price_max: number;
  volume: number;
  strength: number;
  type: "long_tp" | "short_tp" | "long_sl" | "short_sl";
  distance_pct: number;
}

export interface RoundLevel {
  price: number;
  type: "above" | "below";
  distance_pct: number;
  magnitude: "major" | "medium" | "minor";
}

/* ── Renderer ── */
class TPSLRenderer implements IPrimitivePaneRenderer {
  private _series: ISeriesApi<SeriesType, Time>;
  private _tp: TPSLCluster[];
  private _sl: TPSLCluster[];
  private _roundLevels: RoundLevel[];
  private _tc: CanvasColors;

  constructor(
    series: ISeriesApi<SeriesType, Time>,
    tp: TPSLCluster[],
    sl: TPSLCluster[],
    roundLevels: RoundLevel[],
    tc: CanvasColors,
  ) {
    this._series = series;
    this._tp = tp;
    this._sl = sl;
    this._roundLevels = roundLevels;
    this._tc = tc;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    const clusters = [...this._tp, ...this._sl];
    if (clusters.length === 0 && this._roundLevels.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const tc = this._tc;

      // Draw cluster zones
      for (const c of clusters) {
        const yTop = this._series.priceToCoordinate(c.price_max);
        const yBot = this._series.priceToCoordinate(c.price_min);
        if (yTop === null || yBot === null) continue;

        const rawH = yBot - yTop;
        const zoneH = Math.max(3, rawH);
        const yCenter = (yTop + yBot) / 2;
        const drawYTop = yCenter - zoneH / 2;

        if (drawYTop > mediaSize.height || drawYTop + zoneH < 0) continue;

        const isTP = c.type === "long_tp" || c.type === "short_tp";
        const rgb = isTP ? tc.tpZone : tc.slZone;
        const alpha = 0.06 + c.strength * 0.14;

        // Zone fill
        ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
        ctx.fillRect(0, drawYTop, mediaSize.width, zoneH);

        // Zone edge line
        const edgeAlpha = 0.15 + c.strength * 0.25;
        ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${edgeAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(0, yCenter);
        ctx.lineTo(mediaSize.width, yCenter);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        if (c.strength > 0.3) {
          const label = isTP ? "EST. TP" : "EST. SL";
          const pct = c.distance_pct.toFixed(1);
          ctx.font = "bold 8px JetBrains Mono, monospace";
          const labelAlpha = 0.4 + c.strength * 0.5;
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${labelAlpha})`;
          ctx.textAlign = "right";
          ctx.fillText(`${label} ${pct}%`, mediaSize.width - 6, yCenter + 3);
        }
      }

      // Draw round number tick marks (subtle dashed lines)
      for (const rl of this._roundLevels) {
        if (rl.magnitude === "minor") continue; // skip minor levels for cleanliness
        const y = this._series.priceToCoordinate(rl.price);
        if (y === null) continue;
        if (y < 0 || y > mediaSize.height) continue;

        const isMajor = rl.magnitude === "major";
        const alpha = isMajor ? 0.12 : 0.06;
        ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.setLineDash(isMajor ? [6, 6] : [2, 6]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mediaSize.width, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {
    // No foreground drawing needed
  }
}

/* ── View ── */
class TPSLView implements IPrimitivePaneView {
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _tp: TPSLCluster[] = [];
  private _sl: TPSLCluster[] = [];
  private _roundLevels: RoundLevel[] = [];
  private _tc: CanvasColors = THEME_CANVAS.night;

  setParams(
    series: ISeriesApi<SeriesType, Time>,
    tp: TPSLCluster[],
    sl: TPSLCluster[],
    roundLevels: RoundLevel[],
    tc: CanvasColors,
  ) {
    this._series = series;
    this._tp = tp;
    this._sl = sl;
    this._roundLevels = roundLevels;
    this._tc = tc;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series) return null;
    return new TPSLRenderer(
      this._series,
      this._tp,
      this._sl,
      this._roundLevels,
      this._tc,
    );
  }
}

/* ── Primitive ── */
export class TPSLHeatmapPrimitive implements ISeriesPrimitive<Time> {
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _view = new TPSLView();
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];
  private _tp: TPSLCluster[] = [];
  private _sl: TPSLCluster[] = [];
  private _roundLevels: RoundLevel[] = [];
  private _tc: CanvasColors;
  private _visible = false;

  constructor(theme: ThemeName) {
    this._tc = THEME_CANVAS[theme];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews(): void {
    if (this._series && this._visible) {
      this._view.setParams(
        this._series,
        this._tp,
        this._sl,
        this._roundLevels,
        this._tc,
      );
    } else if (this._series) {
      this._view.setParams(this._series, [], [], [], this._tc);
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  updateData(tp: TPSLCluster[], sl: TPSLCluster[], roundLevels: RoundLevel[]): void {
    this._tp = tp;
    this._sl = sl;
    this._roundLevels = roundLevels;
    this._requestUpdate?.();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this._requestUpdate?.();
  }

  isVisible(): boolean {
    return this._visible;
  }

  setTheme(theme: ThemeName): void {
    this._tc = THEME_CANVAS[theme];
    this._requestUpdate?.();
  }
}
