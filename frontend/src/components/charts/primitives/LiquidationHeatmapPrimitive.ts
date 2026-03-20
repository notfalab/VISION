/**
 * Liquidation Heatmap 2D — Inferno-colormap overlay on the candlestick chart.
 *
 * Professional rendering with:
 * - Perceptually uniform Inferno colormap (9-stop interpolation)
 * - Age-based opacity (recent columns brighter, old fade)
 * - Glow effect on hot zones (top 20% intensity)
 * - Subtle grid lines when zoomed
 * - Intensity legend bar in bottom-right corner
 * - Data source badge ("REAL" / "SYNTHETIC")
 *
 * Data from `/api/v1/prices/{symbol}/liquidation-heatmap`.
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
export interface HeatmapColumn {
  time: number;
  v: number[];
}

export interface HeatmapGrid {
  symbol: string;
  timeframe: string;
  price_min: number;
  price_max: number;
  price_step: number;
  n_levels: number;
  columns: HeatmapColumn[];
  data_source?: string;
  oi_usd?: number | null;
  funding_rate?: number | null;
}

/* ── Inferno colormap — perceptually uniform ── */

interface RGB { r: number; g: number; b: number }

const INFERNO_STOPS: [number, RGB][] = [
  [0.00, { r: 0, g: 0, b: 4 }],
  [0.13, { r: 40, g: 11, b: 84 }],
  [0.25, { r: 101, g: 21, b: 110 }],
  [0.38, { r: 159, g: 42, b: 99 }],
  [0.50, { r: 212, g: 72, b: 66 }],
  [0.63, { r: 245, g: 125, b: 21 }],
  [0.75, { r: 250, g: 193, b: 39 }],
  [0.88, { r: 226, g: 240, b: 130 }],
  [1.00, { r: 252, g: 255, b: 164 }],
];

function interpolateInferno(t: number): RGB {
  if (t <= 0) return INFERNO_STOPS[0][1];
  if (t >= 1) return INFERNO_STOPS[INFERNO_STOPS.length - 1][1];
  for (let i = 1; i < INFERNO_STOPS.length; i++) {
    if (t <= INFERNO_STOPS[i][0]) {
      const [t0, c0] = INFERNO_STOPS[i - 1];
      const [t1, c1] = INFERNO_STOPS[i];
      const s = (t - t0) / (t1 - t0);
      return {
        r: Math.round(c0.r + s * (c1.r - c0.r)),
        g: Math.round(c0.g + s * (c1.g - c0.g)),
        b: Math.round(c0.b + s * (c1.b - c0.b)),
      };
    }
  }
  return INFERNO_STOPS[INFERNO_STOPS.length - 1][1];
}

/** Pre-compute 256-entry LUT with separate r,g,b for alpha compositing */
const LUT_R = new Uint8Array(256);
const LUT_G = new Uint8Array(256);
const LUT_B = new Uint8Array(256);
(() => {
  for (let i = 0; i < 256; i++) {
    const c = interpolateInferno(i / 255);
    LUT_R[i] = c.r;
    LUT_G[i] = c.g;
    LUT_B[i] = c.b;
  }
})();

/* ── Cell ── */
interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  colorIdx: number;  // 0-255
  age: number;       // 0-1 (0=oldest, 1=newest)
}

/* ── Renderer ── */
class LiqHeatmapRenderer implements IPrimitivePaneRenderer {
  private _cells: Cell[] = [];
  private _dataSource: string = "synthetic";

  setCells(cells: Cell[], dataSource: string): void {
    this._cells = cells;
    this._dataSource = dataSource;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._cells.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width;
      const h = mediaSize.height;

      // Pass 1: fill cells with age-modulated opacity
      for (const cell of this._cells) {
        const t = cell.colorIdx / 255;
        const baseAlpha = Math.min(t * 0.90, 0.85);
        // Age modulation: old cells fade to 40%, recent at 100%
        const ageFactor = 0.4 + 0.6 * cell.age;
        const alpha = baseAlpha * ageFactor;

        ctx.fillStyle = `rgba(${LUT_R[cell.colorIdx]},${LUT_G[cell.colorIdx]},${LUT_B[cell.colorIdx]},${alpha.toFixed(3)})`;
        ctx.fillRect(cell.x, cell.y, cell.w + 1.0, cell.h + 1.0);
      }

      // Pass 1.5: glow on hot zones (top 20% intensity)
      for (const cell of this._cells) {
        if (cell.colorIdx < 200) continue;
        const glowR = Math.max(cell.w, cell.h) * 1.5;
        const cx = cell.x + cell.w / 2;
        const cy = cell.y + cell.h / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        grad.addColorStop(0, `rgba(${LUT_R[cell.colorIdx]},${LUT_G[cell.colorIdx]},${LUT_B[cell.colorIdx]},0.18)`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
      }

      // Pass 2: subtle grid lines when zoomed
      if (this._cells.length > 0 && this._cells[0].w > 8) {
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 0.5;
        for (const cell of this._cells) {
          if (cell.colorIdx < 15) continue;
          ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
        }
      }

      // Pass 3: numbers when zoomed in
      if (this._cells.length > 0 && this._cells[0].w > 30) {
        ctx.font = "bold 9px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const cell of this._cells) {
          if (cell.colorIdx < 20) continue;
          const val = Math.round((cell.colorIdx / 255) * 100);
          ctx.fillStyle = cell.colorIdx > 180 ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.7)";
          ctx.fillText(`${val}`, cell.x + cell.w / 2, cell.y + cell.h / 2);
        }
      }

      // Pass 4: intensity legend (bottom-right)
      const legendW = 12;
      const legendH = 80;
      const legendX = w - 32;
      const legendY = h - legendH - 20;

      // Background
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(legendX - 4, legendY - 16, legendW + 8, legendH + 32, 4);
      ctx.fill();

      // Gradient bar
      for (let iy = 0; iy < legendH; iy++) {
        const t = 1 - iy / legendH;
        const idx = Math.round(t * 255);
        ctx.fillStyle = `rgb(${LUT_R[idx]},${LUT_G[idx]},${LUT_B[idx]})`;
        ctx.fillRect(legendX, legendY + iy, legendW, 1);
      }

      // Labels
      ctx.font = "7px JetBrains Mono, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.textAlign = "center";
      ctx.fillText("High", legendX + legendW / 2, legendY - 5);
      ctx.fillText("Low", legendX + legendW / 2, legendY + legendH + 10);

      // Pass 5: data source badge (top-right)
      const badge = this._dataSource === "real" ? "REAL" : this._dataSource === "hybrid" ? "HYBRID" : "EST";
      const badgeColor = this._dataSource === "real" ? "rgba(16,185,129,0.9)"
        : this._dataSource === "hybrid" ? "rgba(245,158,11,0.9)"
        : "rgba(100,100,120,0.7)";
      ctx.font = "bold 8px JetBrains Mono, monospace";
      const tm = ctx.measureText(badge);
      const bx = w - tm.width - 16;
      const by = 10;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(bx - 4, by - 2, tm.width + 8, 14, 3);
      ctx.fill();
      ctx.fillStyle = badgeColor;
      ctx.fillText(badge, bx, by + 9);
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {}
}

/* ── View ── */
class LiqHeatmapView implements IPrimitivePaneView {
  private _source: LiquidationHeatmapPrimitive;
  private _renderer = new LiqHeatmapRenderer();

  constructor(source: LiquidationHeatmapPrimitive) {
    this._source = source;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _grid, _visible, _chart } = this._source;
    if (!_visible || !_grid || !_series || !_chart || !_grid.columns.length) {
      this._renderer.setCells([], "synthetic");
      return this._renderer;
    }

    const timeScale = _chart.timeScale();
    const cells: Cell[] = [];
    const cols = _grid.columns;
    const totalCols = cols.length;

    // Cell width from adjacent columns
    let cellWidth = 6;
    if (cols.length >= 2) {
      const x1 = timeScale.timeToCoordinate(cols[0].time as unknown as Time);
      const x2 = timeScale.timeToCoordinate(cols[1].time as unknown as Time);
      if (x1 !== null && x2 !== null) {
        cellWidth = Math.max(2, Math.abs(x2 - x1));
      }
    }

    // Cell height from price step
    let cellHeight = 2;
    const y1 = _series.priceToCoordinate(_grid.price_min);
    const y2 = _series.priceToCoordinate(_grid.price_min + _grid.price_step);
    if (y1 !== null && y2 !== null) {
      cellHeight = Math.max(1, Math.abs(y2 - y1));
    }

    const halfW = cellWidth / 2;
    const halfH = cellHeight / 2;
    const minIntensity = 0.03;

    for (let colIdx = 0; colIdx < cols.length; colIdx++) {
      const col = cols[colIdx];
      const x = timeScale.timeToCoordinate(col.time as unknown as Time);
      if (x === null) continue;

      const xPos = x - halfW;
      const values = col.v;
      if (!values) continue;
      const age = totalCols > 1 ? colIdx / (totalCols - 1) : 1;

      for (let i = 0; i < values.length; i++) {
        const intensity = values[i];
        if (intensity < minIntensity) continue;

        const price = _grid.price_min + i * _grid.price_step;
        const y = _series.priceToCoordinate(price);
        if (y === null) continue;

        cells.push({
          x: xPos,
          y: y - halfH,
          w: cellWidth,
          h: cellHeight,
          colorIdx: Math.min(255, Math.max(0, Math.round(intensity * 255))),
          age,
        });
      }
    }

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

  updateGrid(grid: HeatmapGrid): void {
    this._grid = grid;
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

  updateLevels(_levels: any[], _currentPrice: number): void {}
}
