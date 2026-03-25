/**
 * Economic Calendar Overlay — vertical event lines on chart.
 *
 * Red = high impact (FOMC, NFP, CPI)
 * Yellow = medium impact
 * Gray = low impact
 */

import type {
  ISeriesPrimitive, SeriesAttachedParameter, Time,
  IPrimitivePaneView, IPrimitivePaneRenderer, SeriesType, ISeriesApi,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

export interface CalendarEvent {
  time: number; // unix seconds
  title: string;
  impact: "high" | "medium" | "low";
}

const IMPACT_COLORS: Record<string, string> = {
  high: "rgba(239, 68, 68, 0.6)",
  medium: "rgba(245, 158, 11, 0.5)",
  low: "rgba(100, 116, 139, 0.3)",
};

const IMPACT_LINE: Record<string, string> = {
  high: "rgba(239, 68, 68, 0.25)",
  medium: "rgba(245, 158, 11, 0.15)",
  low: "rgba(100, 116, 139, 0.08)",
};

class EconCalRenderer implements IPrimitivePaneRenderer {
  private _events: CalendarEvent[] = [];
  private _chart: any = null;

  setData(events: CalendarEvent[], chart: any): void {
    this._events = events; this._chart = chart;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._events.length === 0 || !this._chart) return;
    const ts = this._chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const ev of this._events) {
        const x = ts.timeToCoordinate(ev.time as unknown as Time);
        if (x === null || x < 0 || x > mediaSize.width) continue;

        // Vertical line
        ctx.strokeStyle = IMPACT_LINE[ev.impact] || IMPACT_LINE.low;
        ctx.lineWidth = ev.impact === "high" ? 1.5 : 1;
        ctx.setLineDash(ev.impact === "high" ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mediaSize.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label background + text at top
        const label = ev.title.length > 20 ? ev.title.slice(0, 18) + ".." : ev.title;
        ctx.font = "bold 7px monospace";
        const tw = ctx.measureText(label).width;
        const lx = Math.min(x + 3, mediaSize.width - tw - 6);

        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(lx - 2, 2, tw + 4, 11);
        ctx.fillStyle = IMPACT_COLORS[ev.impact] || IMPACT_COLORS.low;
        ctx.textAlign = "left";
        ctx.fillText(label, lx, 10);

        // Impact dot
        ctx.beginPath();
        ctx.arc(x, 18, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = IMPACT_COLORS[ev.impact];
        ctx.fill();
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {}
}

class EconCalView implements IPrimitivePaneView {
  private _source: EconCalendarPrimitive;
  private _renderer = new EconCalRenderer();

  constructor(source: EconCalendarPrimitive) { this._source = source; }
  zOrder(): "bottom" { return "bottom"; }

  renderer(): IPrimitivePaneRenderer | null {
    const { _chart, _visible, _events } = this._source;
    if (!_visible || !_chart || _events.length === 0) {
      this._renderer.setData([], null);
      return this._renderer;
    }
    this._renderer.setData(_events, _chart);
    return this._renderer;
  }
}

export class EconCalendarPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _visible = false;
  _events: CalendarEvent[] = [];

  private _requestUpdate: (() => void) | null = null;
  private _view = new EconCalView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series; this._chart = param.chart; this._requestUpdate = param.requestUpdate;
  }
  detached(): void { this._series = null; this._chart = null; this._requestUpdate = null; }
  updateAllViews(): void {}
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews; }

  update(visible: boolean, events: CalendarEvent[]): void {
    this._visible = visible;
    this._events = visible ? events : [];
    this._requestUpdate?.();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    if (!visible) this._events = [];
    this._requestUpdate?.();
  }
}
