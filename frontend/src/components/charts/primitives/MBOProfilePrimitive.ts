/**
 * MBO Profile — Market by Order depth profile rendered as horizontal bars
 * from the right edge of the chart.
 *
 * Shows orderbook depth segmented by estimated order size:
 *   institutional (bright pink) > large (magenta) > medium (dark pink) > small (faded)
 *
 * Data arrives from `/api/v1/prices/{symbol}/mbo-profile` as bucketed
 * bid/ask levels with volume, order count, and segment classification.
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
export interface MBOLevel {
  price: number;
  volume: number;
  orders: number;
  segment: "institutional" | "large" | "medium" | "small";
  side: "bid" | "ask";
}

export interface MBOProfileData {
  symbol: string;
  current_price: number;
  bids: MBOLevel[];
  asks: MBOLevel[];
  max_volume: number;
  bucket_size: number;
}

/* ── Colors by segment and side ── */
const BID_SEGMENT_COLORS: Record<string, string> = {
  institutional: "rgba(16, 185, 129, 0.85)",   // bright green
  large:         "rgba(16, 185, 129, 0.65)",   // green
  medium:        "rgba(16, 185, 129, 0.45)",   // muted green
  small:         "rgba(16, 185, 129, 0.25)",   // faded green
};
const ASK_SEGMENT_COLORS: Record<string, string> = {
  institutional: "rgba(239, 68, 68, 0.85)",    // bright red
  large:         "rgba(239, 68, 68, 0.65)",    // red
  medium:        "rgba(239, 68, 68, 0.45)",    // muted red
  small:         "rgba(239, 68, 68, 0.25)",    // faded red
};

/* ── Bar info for rendering ── */
interface Bar {
  y: number;
  h: number;
  width: number;   // pixels from right edge
  color: string;
  orders: number;
  side: "bid" | "ask";
}

/* ── Renderer ── */
class MBOProfileRenderer implements IPrimitivePaneRenderer {
  private _bars: Bar[] = [];
  private _chartWidth = 0;

  setBars(bars: Bar[], chartWidth: number): void {
    this._bars = bars;
    this._chartWidth = chartWidth;
  }

  drawBackground(_target: CanvasRenderingTarget2D): void {
    // MBO renders in foreground (on top of candles, at right edge)
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._bars.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const rightEdge = mediaSize.width;
      const barH = Math.max(1, this._bars[0]?.h ?? 4);

      for (const bar of this._bars) {
        const x = rightEdge - bar.width;
        const h = Math.max(2, bar.h - 1); // 1px gap between bars

        // Fill bar with rounded right edge
        ctx.fillStyle = bar.color;
        ctx.beginPath();
        const r = Math.min(2, h / 2);
        ctx.roundRect(x, bar.y, bar.width, h, [r, 0, 0, r]);
        ctx.fill();

        // Order count number when bar is wide enough
        if (bar.width > 30 && h >= 8) {
          ctx.font = "bold 9px JetBrains Mono, monospace";
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `${bar.orders}`,
            rightEdge - 4,
            bar.y + h / 2,
          );
        }
      }
    });
  }
}

/* ── View ── */
class MBOProfileView implements IPrimitivePaneView {
  private _source: MBOProfilePrimitive;
  private _renderer = new MBOProfileRenderer();

  constructor(source: MBOProfilePrimitive) {
    this._source = source;
  }

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _data, _visible } = this._source;
    if (!_visible || !_data || !_series) {
      this._renderer.setBars([], 0);
      return this._renderer;
    }

    const bars: Bar[] = [];
    const maxBarWidth = 200; // max pixels width for largest bar

    // Cell height from bucket_size — enforce minimum 4px for visibility
    let cellHeight = 4;
    if (_data.bucket_size > 0) {
      const y1 = _series.priceToCoordinate(_data.current_price);
      const y2 = _series.priceToCoordinate(
        _data.current_price + _data.bucket_size,
      );
      if (y1 !== null && y2 !== null) {
        cellHeight = Math.max(4, Math.abs(y2 - y1));
      }
    }

    const halfH = cellHeight / 2;
    const maxVol = _data.max_volume || 1;
    const minBarWidth = 6; // minimum bar width so small levels are still visible

    const processLevels = (levels: MBOLevel[]) => {
      for (const level of levels) {
        const y = _series!.priceToCoordinate(level.price);
        if (y === null) continue;

        // Sqrt scaling — makes small bars more visible vs. linear
        const ratio = level.volume / maxVol;
        const barWidth = Math.sqrt(ratio) * maxBarWidth;
        if (barWidth < 1) continue;

        const palette = level.side === "bid" ? BID_SEGMENT_COLORS : ASK_SEGMENT_COLORS;
        bars.push({
          y: y - halfH,
          h: cellHeight,
          width: Math.max(minBarWidth, barWidth),
          color: palette[level.segment] || palette.small,
          orders: level.orders,
          side: level.side,
        });
      }
    };

    processLevels(_data.bids);
    processLevels(_data.asks);

    this._renderer.setBars(bars, 0);
    return this._renderer;
  }
}

/* ── Primitive ── */
export class MBOProfilePrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _data: MBOProfileData | null = null;
  _visible = false;

  private _requestUpdate: (() => void) | null = null;
  private _view = new MBOProfileView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

  constructor(_theme: ThemeName) {}

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews(): void {}

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  updateProfile(data: MBOProfileData): void {
    this._data = data;
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
