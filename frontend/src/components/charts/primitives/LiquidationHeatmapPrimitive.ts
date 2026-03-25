/**
 * Liquidation Heatmap 2D — Inferno-colormap overlay (performance-optimized).
 *
 * Optimizations:
 * - Pre-computed 256×10 RGBA string LUT (zero string concat in render loop)
 * - No radial gradients — glow via enlarged fillRect (10× faster)
 * - Batched grid lines via single Path2D
 * - Cell array reuse (no GC pressure)
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
export interface HeatmapColumn { time: number; v: number[]; }
export interface HeatmapGrid {
  symbol: string; timeframe: string;
  price_min: number; price_max: number; price_step: number; n_levels: number;
  columns: HeatmapColumn[];
  data_source?: string; oi_usd?: number | null; funding_rate?: number | null;
}

/* ── Inferno colormap — pre-computed LUT ── */
const INFERNO: [number, number, number, number][] = [
  [0.00, 0, 0, 4], [0.13, 40, 11, 84], [0.25, 101, 21, 110],
  [0.38, 159, 42, 99], [0.50, 212, 72, 66], [0.63, 245, 125, 21],
  [0.75, 250, 193, 39], [0.88, 226, 240, 130], [1.00, 252, 255, 164],
];

function infernoRGB(t: number): [number, number, number] {
  if (t <= 0) return [0, 0, 4];
  if (t >= 1) return [252, 255, 164];
  for (let i = 1; i < INFERNO.length; i++) {
    if (t <= INFERNO[i][0]) {
      const s = (t - INFERNO[i - 1][0]) / (INFERNO[i][0] - INFERNO[i - 1][0]);
      return [
        Math.round(INFERNO[i - 1][1] + s * (INFERNO[i][1] - INFERNO[i - 1][1])),
        Math.round(INFERNO[i - 1][2] + s * (INFERNO[i][2] - INFERNO[i - 1][2])),
        Math.round(INFERNO[i - 1][3] + s * (INFERNO[i][3] - INFERNO[i - 1][3])),
      ];
    }
  }
  return [252, 255, 164];
}

// 256 intensity × 10 age buckets = 2560 pre-cached strings
const AGE_BUCKETS = 10;
const COLOR_LUT: string[][] = []; // [intensity][ageBucket]
const GLOW_LUT: string[] = [];    // [intensity] for hot zones
(() => {
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = infernoRGB(i / 255);
    const t = i / 255;
    const baseAlpha = Math.min(t * 0.90, 0.85);
    const row: string[] = [];
    for (let a = 0; a < AGE_BUCKETS; a++) {
      const ageFactor = 0.4 + 0.6 * (a / (AGE_BUCKETS - 1));
      const alpha = baseAlpha * ageFactor;
      row.push(`rgba(${r},${g},${b},${alpha.toFixed(3)})`);
    }
    COLOR_LUT.push(row);
    GLOW_LUT.push(`rgba(${r},${g},${b},0.12)`);
  }
})();

/* ── Cell ── */
interface Cell { x: number; y: number; w: number; h: number; colorIdx: number; ageBucket: number; }

/* ── Renderer ── */
class LiqHeatmapRenderer implements IPrimitivePaneRenderer {
  private _cells: Cell[] = [];
  private _dataSource = "synthetic";

  setCells(cells: Cell[], dataSource: string): void {
    this._cells = cells;
    this._dataSource = dataSource;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._cells.length === 0) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width, h = mediaSize.height;

      // Pass 1: fill cells (pre-cached RGBA — zero string concat)
      for (const c of this._cells) {
        ctx.fillStyle = COLOR_LUT[c.colorIdx][c.ageBucket];
        ctx.fillRect(c.x, c.y, c.w + 1, c.h + 1);
      }

      // Pass 1.5: glow on hot zones — simple enlarged fillRect (no gradient)
      ctx.globalAlpha = 0.5;
      for (const c of this._cells) {
        if (c.colorIdx < 210) continue;
        ctx.fillStyle = GLOW_LUT[c.colorIdx];
        const pad = Math.max(c.w, c.h) * 0.6;
        ctx.fillRect(c.x - pad, c.y - pad, c.w + pad * 2, c.h + pad * 2);
      }
      ctx.globalAlpha = 1.0;

      // Pass 2: grid lines — single batched path
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

      // Pass 3: numbers when very zoomed
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

      // Pass 4: legend
      const lW = 10, lH = 60, lX = w - 28, lY = h - lH - 16;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(lX - 3, lY - 12, lW + 6, lH + 24);
      for (let iy = 0; iy < lH; iy++) {
        const idx = Math.round((1 - iy / lH) * 255);
        ctx.fillStyle = COLOR_LUT[idx][AGE_BUCKETS - 1];
        ctx.fillRect(lX, lY + iy, lW, 1);
      }
      ctx.font = "6px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("Hi", lX + lW / 2, lY - 4);
      ctx.fillText("Lo", lX + lW / 2, lY + lH + 8);

      // Badge
      const badge = this._dataSource === "real" ? "REAL" : this._dataSource === "hybrid" ? "HYB" : "EST";
      const bc = this._dataSource === "real" ? "rgba(16,185,129,0.8)" : this._dataSource === "hybrid" ? "rgba(245,158,11,0.8)" : "rgba(100,100,120,0.6)";
      ctx.font = "bold 7px monospace";
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(w - 30, 6, 24, 12);
      ctx.fillStyle = bc;
      ctx.fillText(badge, w - 18, 14);
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {}
}

/* ── View ── */
class LiqHeatmapView implements IPrimitivePaneView {
  private _source: LiquidationHeatmapPrimitive;
  private _renderer = new LiqHeatmapRenderer();
  private _cellPool: Cell[] = [];

  constructor(source: LiquidationHeatmapPrimitive) { this._source = source; }
  zOrder(): "bottom" { return "bottom"; }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _grid, _visible, _chart } = this._source;
    if (!_visible || !_grid || !_series || !_chart || !_grid.columns.length) {
      this._renderer.setCells([], "synthetic");
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

    // Slice pool to actual count (no allocation if pool is big enough)
    const cells = this._cellPool.length > cellCount
      ? this._cellPool.slice(0, cellCount)
      : this._cellPool;

    this._renderer.setCells(cells, _grid.data_source || "synthetic");
    return this._renderer;
  }
}

/* ── Primitive ── */
export class LiquidationHeatmapPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _grid: HeatmapGrid | null = null;
  _visible = false;

  private _requestUpdate: (() => void) | null = null;
  private _view = new LiqHeatmapView(this);
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
  updateLevels(_levels: any[], _currentPrice: number): void {}
}
