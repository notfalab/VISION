/**
 * Stop Heatmap 2D — warm color overlay on the candlestick chart.
 *
 * Renders a time × price grid of estimated stop-loss density using a
 * warm colormap (dark → purple → red → orange → yellow).
 *
 * Shows numbers inside cells when zoomed in (cell width > 30px).
 *
 * Data arrives from `/api/v1/prices/{symbol}/stop-heatmap` as a
 * compact grid: { price_min, price_max, price_step, n_levels, columns }.
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

/* ── Types (same grid format as LiquidationHeatmap) ── */
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
}

/* ── Warm color palette: dark → purple → red → orange → yellow ── */

const STOP_COLOR_LUT: string[] = (() => {
  const lut: string[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r: number, g: number, b: number;
    const a = Math.min(t * 0.88, 0.82);

    if (t < 0.12) {
      // Transparent → dark
      r = Math.floor((t / 0.12) * 30);
      g = 0;
      b = Math.floor((t / 0.12) * 20);
    } else if (t < 0.30) {
      // Dark → purple
      const s = (t - 0.12) / 0.18;
      r = Math.floor(30 + s * 100);
      g = 0;
      b = Math.floor(20 + s * 120);
    } else if (t < 0.50) {
      // Purple → red
      const s = (t - 0.30) / 0.20;
      r = Math.floor(130 + s * 125);
      g = 0;
      b = Math.floor(140 * (1 - s));
    } else if (t < 0.70) {
      // Red → orange
      const s = (t - 0.50) / 0.20;
      r = 255;
      g = Math.floor(s * 165);
      b = 0;
    } else {
      // Orange → yellow
      const s = (t - 0.70) / 0.30;
      r = 255;
      g = Math.floor(165 + s * 90);
      b = Math.floor(s * 50);
    }

    lut[i] = `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }
  return lut;
})();

/* ── Cell ── */
interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  colorIdx: number;
}

/* ── Renderer ── */
class StopHeatmapRenderer implements IPrimitivePaneRenderer {
  private _cells: Cell[] = [];

  setCells(cells: Cell[]): void {
    this._cells = cells;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._cells.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      // Pass 1: fill cells
      for (const cell of this._cells) {
        ctx.fillStyle = STOP_COLOR_LUT[cell.colorIdx];
        ctx.fillRect(cell.x, cell.y, cell.w + 0.5, cell.h + 0.5);
      }

      // Pass 2: numbers when zoomed in
      if (this._cells.length > 0 && this._cells[0].w > 30) {
        ctx.font = "bold 9px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const cell of this._cells) {
          if (cell.colorIdx < 20) continue;
          const val = Math.round((cell.colorIdx / 255) * 100);
          ctx.fillStyle =
            cell.colorIdx > 180
              ? "rgba(0,0,0,0.7)"
              : "rgba(255,255,255,0.6)";
          ctx.fillText(`${val}`, cell.x + cell.w / 2, cell.y + cell.h / 2);
        }
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {
    // No foreground drawing
  }
}

/* ── View ── */
class StopHeatmapView implements IPrimitivePaneView {
  private _source: StopHeatmapPrimitive;
  private _renderer = new StopHeatmapRenderer();

  constructor(source: StopHeatmapPrimitive) {
    this._source = source;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _grid, _visible, _chart } = this._source;
    if (!_visible || !_grid || !_series || !_chart || !_grid.columns.length) {
      this._renderer.setCells([]);
      return this._renderer;
    }

    const timeScale = _chart.timeScale();
    const cells: Cell[] = [];

    // Cell width from adjacent columns
    let cellWidth = 6;
    const cols = _grid.columns;
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

    for (const col of cols) {
      const x = timeScale.timeToCoordinate(col.time as unknown as Time);
      if (x === null) continue;

      const xPos = x - halfW;
      const values = col.v;
      if (!values) continue;

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
        });
      }
    }

    this._renderer.setCells(cells);
    return this._renderer;
  }
}

/* ── Primitive ── */
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
}
