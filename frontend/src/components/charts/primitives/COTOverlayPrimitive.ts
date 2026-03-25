/**
 * COT (Commitment of Traders) Overlay — institutional positioning histogram.
 *
 * Green bars = managed money net long
 * Red bars = managed money net short
 * Rendered in the bottom 15% of the chart pane.
 */

import type {
  ISeriesPrimitive, SeriesAttachedParameter, Time,
  IPrimitivePaneView, IPrimitivePaneRenderer, SeriesType, ISeriesApi,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

export interface COTBar {
  time: number; // unix seconds
  netPosition: number; // positive = net long, negative = net short
}

class COTRenderer implements IPrimitivePaneRenderer {
  private _bars: COTBar[] = [];
  private _chart: any = null;
  private _maxAbs = 1;

  setData(bars: COTBar[], chart: any): void {
    this._bars = bars;
    this._chart = chart;
    this._maxAbs = 1;
    for (const b of bars) {
      const abs = Math.abs(b.netPosition);
      if (abs > this._maxAbs) this._maxAbs = abs;
    }
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._bars.length === 0 || !this._chart) return;
    const ts = this._chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const paneH = mediaSize.height;
      const zoneH = paneH * 0.13; // 13% of pane
      const baseline = paneH - 8; // small padding from bottom
      const maxBarH = zoneH * 0.9;

      // Baseline
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, baseline);
      ctx.lineTo(mediaSize.width, baseline);
      ctx.stroke();

      // "COT" label
      ctx.font = "bold 7px monospace";
      ctx.fillStyle = "rgba(148, 163, 184, 0.3)";
      ctx.textAlign = "left";
      ctx.fillText("COT NET", 4, baseline - zoneH + 8);

      // Calculate bar width from adjacent timestamps
      let barW = 20;
      if (this._bars.length >= 2) {
        const x1 = ts.timeToCoordinate(this._bars[0].time as unknown as Time);
        const x2 = ts.timeToCoordinate(this._bars[1].time as unknown as Time);
        if (x1 !== null && x2 !== null) barW = Math.max(4, Math.abs(x2 - x1) * 0.7);
      }

      for (const bar of this._bars) {
        const x = ts.timeToCoordinate(bar.time as unknown as Time);
        if (x === null) continue;

        const norm = bar.netPosition / this._maxAbs;
        const barH = Math.abs(norm) * maxBarH;
        const isLong = bar.netPosition >= 0;

        ctx.fillStyle = isLong ? "rgba(16, 185, 129, 0.45)" : "rgba(239, 68, 68, 0.45)";
        if (isLong) {
          ctx.fillRect(x - barW / 2, baseline - barH, barW, barH);
        } else {
          ctx.fillRect(x - barW / 2, baseline, barW, barH);
        }

        // Border
        ctx.strokeStyle = isLong ? "rgba(16, 185, 129, 0.6)" : "rgba(239, 68, 68, 0.6)";
        ctx.lineWidth = 0.5;
        if (isLong) {
          ctx.strokeRect(x - barW / 2, baseline - barH, barW, barH);
        } else {
          ctx.strokeRect(x - barW / 2, baseline, barW, barH);
        }
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {}
}

class COTView implements IPrimitivePaneView {
  private _source: COTOverlayPrimitive;
  private _renderer = new COTRenderer();

  constructor(source: COTOverlayPrimitive) { this._source = source; }
  zOrder(): "bottom" { return "bottom"; }

  renderer(): IPrimitivePaneRenderer | null {
    const { _chart, _visible, _bars } = this._source;
    if (!_visible || !_chart || _bars.length === 0) {
      this._renderer.setData([], null);
      return this._renderer;
    }
    this._renderer.setData(_bars, _chart);
    return this._renderer;
  }
}

export class COTOverlayPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _visible = false;
  _bars: COTBar[] = [];

  private _requestUpdate: (() => void) | null = null;
  private _view = new COTView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series; this._chart = param.chart; this._requestUpdate = param.requestUpdate;
  }
  detached(): void { this._series = null; this._chart = null; this._requestUpdate = null; }
  updateAllViews(): void {}
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews; }

  update(visible: boolean, bars: COTBar[]): void {
    this._visible = visible;
    this._bars = visible ? bars : [];
    this._requestUpdate?.();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    if (!visible) this._bars = [];
    this._requestUpdate?.();
  }
}
