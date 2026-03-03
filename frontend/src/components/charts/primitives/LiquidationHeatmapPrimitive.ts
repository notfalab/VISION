/**
 * Liquidation Heatmap chart primitive — draws leveraged position
 * liquidation levels as horizontal bars on the candlestick chart.
 *
 * Crypto-only. Follows the same ISeriesPrimitive pattern as AccZonePrimitive.
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
export interface LiquidationLevel {
  price: number;
  long_liq_usd: number;
  short_liq_usd: number;
}

/* ── Renderer ── */
class LiqRenderer implements IPrimitivePaneRenderer {
  private _series: ISeriesApi<SeriesType, Time>;
  private _levels: LiquidationLevel[];
  private _currentPrice: number;
  private _tc: CanvasColors;

  constructor(
    series: ISeriesApi<SeriesType, Time>,
    levels: LiquidationLevel[],
    currentPrice: number,
    tc: CanvasColors,
  ) {
    this._series = series;
    this._levels = levels;
    this._currentPrice = currentPrice;
    this._tc = tc;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._levels.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const tc = this._tc;

      // Find max volume for normalization
      const maxVol = Math.max(
        ...this._levels.map((l) => Math.max(l.long_liq_usd, l.short_liq_usd)),
        1,
      );

      // Chart width available for bars (use right 30% of chart)
      const barMaxW = mediaSize.width * 0.25;
      const barStartX = mediaSize.width - barMaxW - 4;

      for (const level of this._levels) {
        const y = this._series.priceToCoordinate(level.price);
        if (y === null) continue;
        if (y < 0 || y > mediaSize.height) continue;

        const barH = 2;

        // Long liquidation (below current price) — red/purple bars extending left
        if (level.long_liq_usd > 0) {
          const w = (level.long_liq_usd / maxVol) * barMaxW;
          const rgb = tc.liqLong;
          // Proximity alpha: closer to current price = more opaque
          const dist = Math.abs(level.price - this._currentPrice) / this._currentPrice;
          const proxAlpha = Math.max(0.1, 0.5 - dist * 3);

          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${proxAlpha})`;
          ctx.fillRect(barStartX + barMaxW - w, y - barH / 2, w, barH);
        }

        // Short liquidation (above current price) — green bars extending left
        if (level.short_liq_usd > 0) {
          const w = (level.short_liq_usd / maxVol) * barMaxW;
          const rgb = tc.liqShort;
          const dist = Math.abs(level.price - this._currentPrice) / this._currentPrice;
          const proxAlpha = Math.max(0.1, 0.5 - dist * 3);

          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${proxAlpha})`;
          ctx.fillRect(barStartX + barMaxW - w, y - barH / 2, w, barH);
        }
      }

      // Current price marker line
      const cpY = this._series.priceToCoordinate(this._currentPrice);
      if (cpY !== null && cpY >= 0 && cpY <= mediaSize.height) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(barStartX, cpY);
        ctx.lineTo(barStartX + barMaxW, cpY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.font = "bold 7px JetBrains Mono, monospace";
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.textAlign = "right";
        ctx.fillText("LIQ MAP", mediaSize.width - 6, cpY - 4);
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {
    // No foreground drawing needed
  }
}

/* ── View ── */
class LiqView implements IPrimitivePaneView {
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _levels: LiquidationLevel[] = [];
  private _currentPrice = 0;
  private _tc: CanvasColors = THEME_CANVAS.dim;

  setParams(
    series: ISeriesApi<SeriesType, Time>,
    levels: LiquidationLevel[],
    currentPrice: number,
    tc: CanvasColors,
  ) {
    this._series = series;
    this._levels = levels;
    this._currentPrice = currentPrice;
    this._tc = tc;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series) return null;
    return new LiqRenderer(
      this._series,
      this._levels,
      this._currentPrice,
      this._tc,
    );
  }
}

/* ── Primitive ── */
export class LiquidationHeatmapPrimitive implements ISeriesPrimitive<Time> {
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _view = new LiqView();
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];
  private _levels: LiquidationLevel[] = [];
  private _currentPrice = 0;
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
        this._levels,
        this._currentPrice,
        this._tc,
      );
    } else if (this._series) {
      this._view.setParams(this._series, [], 0, this._tc);
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  updateLevels(levels: LiquidationLevel[], currentPrice: number): void {
    this._levels = levels;
    this._currentPrice = currentPrice;
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
