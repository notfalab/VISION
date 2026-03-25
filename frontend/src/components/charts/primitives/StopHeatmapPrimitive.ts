/**
 * Stop Heatmap 2D — Plasma-colormap overlay (performance-optimized).
 *
 * Same optimizations as LiquidationHeatmapPrimitive:
 * - Pre-computed RGBA string LUT
 * - No radial gradients
 * - Batched grid lines
 * - Cell array reuse
 */

import type {
  ISeriesPrimitive, SeriesAttachedParameter, Time,
  IPrimitivePaneView, IPrimitivePaneRenderer, SeriesType, ISeriesApi,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { ThemeName } from "@/stores/theme";

export interface HeatmapColumn { time: number; v: number[]; }
export interface HeatmapGrid {
  symbol: string; timeframe: string;
  price_min: number; price_max: number; price_step: number; n_levels: number;
  columns: HeatmapColumn[]; data_source?: string;
}

/* ── Plasma colormap LUT ── */
const PLASMA: [number, number, number, number][] = [
  [0.00, 13, 8, 135], [0.14, 75, 3, 161], [0.28, 126, 3, 168],
  [0.42, 168, 34, 150], [0.56, 204, 71, 120], [0.70, 231, 116, 83],
  [0.84, 248, 149, 64], [0.92, 246, 200, 40], [1.00, 240, 249, 33],
];

function plasmaRGB(t: number): [number, number, number] {
  if (t <= 0) return [13, 8, 135];
  if (t >= 1) return [240, 249, 33];
  for (let i = 1; i < PLASMA.length; i++) {
    if (t <= PLASMA[i][0]) {
      const s = (t - PLASMA[i - 1][0]) / (PLASMA[i][0] - PLASMA[i - 1][0]);
      return [
        Math.round(PLASMA[i - 1][1] + s * (PLASMA[i][1] - PLASMA[i - 1][1])),
        Math.round(PLASMA[i - 1][2] + s * (PLASMA[i][2] - PLASMA[i - 1][2])),
        Math.round(PLASMA[i - 1][3] + s * (PLASMA[i][3] - PLASMA[i - 1][3])),
      ];
    }
  }
  return [240, 249, 33];
}

const AGE_BUCKETS = 10;
const COLOR_LUT: string[][] = [];
const GLOW_LUT: string[] = [];
(() => {
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = plasmaRGB(i / 255);
    const t = i / 255;
    const baseAlpha = Math.min(t * 0.90, 0.85);
    const row: string[] = [];
    for (let a = 0; a < AGE_BUCKETS; a++) {
      const ageFactor = 0.4 + 0.6 * (a / (AGE_BUCKETS - 1));
      row.push(`rgba(${r},${g},${b},${(baseAlpha * ageFactor).toFixed(3)})`);
    }
    COLOR_LUT.push(row);
    GLOW_LUT.push(`rgba(${r},${g},${b},0.12)`);
  }
})();

interface Cell { x: number; y: number; w: number; h: number; colorIdx: number; ageBucket: number; }

class StopHeatmapRenderer implements IPrimitivePaneRenderer {
  private _cells: Cell[] = [];

  setCells(cells: Cell[]): void { this._cells = cells; }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._cells.length === 0) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width, h = mediaSize.height;

      for (const c of this._cells) {
        ctx.fillStyle = COLOR_LUT[c.colorIdx][c.ageBucket];
        ctx.fillRect(c.x, c.y, c.w + 1, c.h + 1);
      }

      ctx.globalAlpha = 0.5;
      for (const c of this._cells) {
        if (c.colorIdx < 210) continue;
        ctx.fillStyle = GLOW_LUT[c.colorIdx];
        const pad = Math.max(c.w, c.h) * 0.6;
        ctx.fillRect(c.x - pad, c.y - pad, c.w + pad * 2, c.h + pad * 2);
      }
      ctx.globalAlpha = 1.0;

      if (this._cells.length > 0 && this._cells[0].w > 10) {
        ctx.strokeStyle = "rgba(255,255,255,0.035)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (const c of this._cells) {
          if (c.colorIdx < 15) continue;
          ctx.rect(c.x, c.y, c.w, c.h);
        }
        ctx.stroke();
      }

      if (this._cells.length > 0 && this._cells[0].w > 35) {
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const c of this._cells) {
          if (c.colorIdx < 25) continue;
          ctx.fillStyle = c.colorIdx > 180 ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.7)";
          ctx.fillText(`${Math.round(c.colorIdx * 0.392)}`, c.x + c.w / 2, c.y + c.h / 2);
        }
      }

      // Legend
      const lW = 10, lH = 60, lX = w - 48, lY = h - lH - 16;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(lX - 3, lY - 12, lW + 6, lH + 24);
      for (let iy = 0; iy < lH; iy++) {
        ctx.fillStyle = COLOR_LUT[Math.round((1 - iy / lH) * 255)][AGE_BUCKETS - 1];
        ctx.fillRect(lX, lY + iy, lW, 1);
      }
      ctx.font = "6px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("Hi", lX + lW / 2, lY - 4);
      ctx.fillText("Lo", lX + lW / 2, lY + lH + 8);

      // Label
      ctx.font = "bold 7px monospace";
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(w - 54, 6, 24, 12);
      ctx.fillStyle = "rgba(204,71,120,0.8)";
      ctx.fillText("STP", w - 42, 14);
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {}
}

class StopHeatmapView implements IPrimitivePaneView {
  private _source: StopHeatmapPrimitive;
  private _renderer = new StopHeatmapRenderer();
  private _cellPool: Cell[] = [];

  constructor(source: StopHeatmapPrimitive) { this._source = source; }
  zOrder(): "bottom" { return "bottom"; }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _grid, _visible, _chart } = this._source;
    if (!_visible || !_grid || !_series || !_chart || !_grid.columns.length) {
      this._renderer.setCells([]);
      return this._renderer;
    }

    const timeScale = _chart.timeScale();
    const cols = _grid.columns;
    const totalCols = cols.length;

    let cellWidth = 6;
    if (cols.length >= 2) {
      const x1 = timeScale.timeToCoordinate(cols[0].time as unknown as Time);
      const x2 = timeScale.timeToCoordinate(cols[1].time as unknown as Time);
      if (x1 !== null && x2 !== null) cellWidth = Math.max(2, Math.abs(x2 - x1));
    }

    let cellHeight = 2;
    const y1 = _series.priceToCoordinate(_grid.price_min);
    const y2 = _series.priceToCoordinate(_grid.price_min + _grid.price_step);
    if (y1 !== null && y2 !== null) cellHeight = Math.max(1, Math.abs(y2 - y1));

    const halfW = cellWidth / 2, halfH = cellHeight / 2;
    let cellCount = 0;

    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const x = timeScale.timeToCoordinate(col.time as unknown as Time);
      if (x === null) continue;
      const xPos = x - halfW;
      const values = col.v;
      if (!values) continue;
      const ageBucket = totalCols > 1 ? Math.min(AGE_BUCKETS - 1, Math.floor(ci / (totalCols - 1) * (AGE_BUCKETS - 1))) : AGE_BUCKETS - 1;

      for (let i = 0; i < values.length; i++) {
        if (values[i] < 0.03) continue;
        const price = _grid.price_min + i * _grid.price_step;
        const y = _series.priceToCoordinate(price);
        if (y === null) continue;

        if (cellCount >= this._cellPool.length) {
          this._cellPool.push({ x: 0, y: 0, w: 0, h: 0, colorIdx: 0, ageBucket: 0 });
        }
        const cell = this._cellPool[cellCount];
        cell.x = xPos; cell.y = y - halfH; cell.w = cellWidth; cell.h = cellHeight;
        cell.colorIdx = Math.min(255, Math.max(0, Math.round(values[i] * 255)));
        cell.ageBucket = ageBucket;
        cellCount++;
      }
    }

    this._renderer.setCells(cellCount < this._cellPool.length ? this._cellPool.slice(0, cellCount) : this._cellPool);
    return this._renderer;
  }
}

export class StopHeatmapPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _grid: HeatmapGrid | null = null;
  _visible = false;

  private _requestUpdate: (() => void) | null = null;
  private _view = new StopHeatmapView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

  constructor(_theme: ThemeName) {}

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series; this._chart = param.chart; this._requestUpdate = param.requestUpdate;
  }
  detached(): void { this._series = null; this._chart = null; this._requestUpdate = null; }
  updateAllViews(): void {}
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews; }
  updateGrid(grid: HeatmapGrid): void { this._grid = grid; this._requestUpdate?.(); }
  setVisible(visible: boolean): void { this._visible = visible; this._requestUpdate?.(); }
  isVisible(): boolean { return this._visible; }
  setTheme(_theme: ThemeName): void { this._requestUpdate?.(); }
}
