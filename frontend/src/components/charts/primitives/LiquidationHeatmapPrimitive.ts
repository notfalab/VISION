/**
 * Liquidation Heatmap 2D — thermal color overlay on the candlestick chart.
 *
 * Renders a time × price grid of estimated liquidation intensities using a
 * cool-to-hot colormap (dark → blue → cyan → green → yellow → red).
 *
 * Data arrives from `/api/v1/prices/{symbol}/liquidation-heatmap` as a
 * compact grid: { price_min, price_max, price_step, n_levels, columns }.
 *
 * Follows the same ISeriesPrimitive<Time> pattern as AccZonePrimitive / TPSLHeatmapPrimitive.
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
  time: number;   // UTC timestamp (seconds)
  v: number[];    // Intensity values 0-1 for each price level
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

/* ── Color mapping — thermal / inferno-like ── */

/** Pre-compute 256-entry color LUT for fast lookup. */
const COLOR_LUT: string[] = (() => {
  const lut: string[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r: number, g: number, b: number;
    const a = Math.min(t * 0.88, 0.82);

    if (t < 0.12) {
      // Transparent → dark purple
      r = Math.floor((t / 0.12) * 25);
      g = 0;
      b = Math.floor((t / 0.12) * 80);
    } else if (t < 0.25) {
      // Dark purple → blue
      const s = (t - 0.12) / 0.13;
      r = Math.floor(25 - s * 25);
      g = 0;
      b = Math.floor(80 + s * 175);
    } else if (t < 0.40) {
      // Blue → cyan
      const s = (t - 0.25) / 0.15;
      r = 0;
      g = Math.floor(s * 220);
      b = 255;
    } else if (t < 0.55) {
      // Cyan → green
      const s = (t - 0.40) / 0.15;
      r = 0;
      g = Math.floor(220 + s * 35);
      b = Math.floor(255 * (1 - s));
    } else if (t < 0.70) {
      // Green → yellow
      const s = (t - 0.55) / 0.15;
      r = Math.floor(s * 255);
      g = 255;
      b = 0;
    } else if (t < 0.85) {
      // Yellow → orange
      const s = (t - 0.70) / 0.15;
      r = 255;
      g = Math.floor(255 - s * 110);
      b = 0;
    } else {
      // Orange → red/white
      const s = (t - 0.85) / 0.15;
      r = 255;
      g = Math.floor(145 - s * 90);
      b = Math.floor(s * 70);
    }

    lut[i] = `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }
  return lut;
})();

function heatColor(intensity: number): string {
  const idx = Math.min(255, Math.max(0, Math.round(intensity * 255)));
  return COLOR_LUT[idx];
}

/* ── Render cell ── */
interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  colorIdx: number; // 0-255
}

/* ── Renderer ── */
class LiqHeatmapRenderer implements IPrimitivePaneRenderer {
  private _cells: Cell[] = [];

  setCells(cells: Cell[]): void {
    this._cells = cells;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._cells.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const cell of this._cells) {
        ctx.fillStyle = COLOR_LUT[cell.colorIdx];
        ctx.fillRect(cell.x, cell.y, cell.w + 0.5, cell.h + 0.5);
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {
    // No foreground drawing needed — heatmap renders behind candles
  }
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
      this._renderer.setCells([]);
      return this._renderer;
    }

    const timeScale = _chart.timeScale();
    const cells: Cell[] = [];

    // Calculate cell width from adjacent columns
    let cellWidth = 6;
    const cols = _grid.columns;
    if (cols.length >= 2) {
      const x1 = timeScale.timeToCoordinate(cols[0].time as unknown as Time);
      const x2 = timeScale.timeToCoordinate(cols[1].time as unknown as Time);
      if (x1 !== null && x2 !== null) {
        cellWidth = Math.max(2, Math.abs(x2 - x1));
      }
    }

    // Calculate cell height from price step
    let cellHeight = 2;
    const y1 = _series.priceToCoordinate(_grid.price_min);
    const y2 = _series.priceToCoordinate(_grid.price_min + _grid.price_step);
    if (y1 !== null && y2 !== null) {
      cellHeight = Math.max(1, Math.abs(y2 - y1));
    }

    const halfW = cellWidth / 2;
    const halfH = cellHeight / 2;
    const minIntensity = 0.03; // Skip very dim cells

    for (const col of cols) {
      const x = timeScale.timeToCoordinate(col.time as unknown as Time);
      if (x === null) continue;

      const xPos = x - halfW;
      const values = col.v;

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
export class LiquidationHeatmapPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null; // IChartApi — typed as any to avoid import issues
  _grid: HeatmapGrid | null = null;
  _visible = false;

  private _requestUpdate: (() => void) | null = null;
  private _view = new LiqHeatmapView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

  constructor(_theme: ThemeName) {
    // Theme is not used for heatmap colors (we use the fixed thermal LUT)
    // but we keep the constructor signature for API compatibility.
  }

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

  updateAllViews(): void {
    // Views are stateless — they read from _source directly
  }

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
    // Thermal colors are theme-independent but trigger redraw
    this._requestUpdate?.();
  }

  // Backward-compatible stubs (old API used by sidebar widget)
  updateLevels(_levels: any[], _currentPrice: number): void {
    // Ignored — use updateGrid() for the 2D heatmap
  }
}
