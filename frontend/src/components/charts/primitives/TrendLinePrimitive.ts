import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesApi,
  SeriesType,
  IChartApi,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

export interface TrendLineData {
  id: string;
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  color: string;
  lineWidth: number;
}

export type HitPart = "p1" | "p2" | "body";
export interface HitResult {
  id: string;
  part: HitPart;
}

// ── Geometry helpers ──

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

// ── Renderer ──

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  _source: TrendLinePrimitive;

  constructor(source: TrendLinePrimitive) {
    this._source = source;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const series = this._source._series;
    const chart = this._source._chart;
    if (!series || !chart || this._source._lines.length === 0) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const timeScale = chart.timeScale();
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;

      for (const line of this._source._lines) {
        const x1 = timeScale.timeToCoordinate(line.p1.time as Time);
        const y1 = series.priceToCoordinate(line.p1.price);
        const x2 = timeScale.timeToCoordinate(line.p2.time as Time);
        const y2 = series.priceToCoordinate(line.p2.price);

        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

        const isSelected = this._source.selectedId === line.id;
        const isHovered = this._source.hoveredId === line.id;

        ctx.save();

        // Draw selection highlight behind the line
        if (isSelected) {
          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = (line.lineWidth + 6) * hr;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(x1 * hr, y1 * vr);
          ctx.lineTo(x2 * hr, y2 * vr);
          ctx.stroke();
        }

        // Main line
        ctx.strokeStyle = isSelected ? "#60a5fa" : isHovered ? "#93c5fd" : line.color;
        ctx.lineWidth = (isSelected ? line.lineWidth + 1 : line.lineWidth) * hr;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1 * hr, y1 * vr);
        ctx.lineTo(x2 * hr, y2 * vr);
        ctx.stroke();

        // Endpoint circles
        const endpointRadius = isSelected ? 5 : isHovered ? 4 : 3;
        for (const [px, py] of [
          [x1, y1],
          [x2, y2],
        ]) {
          // White ring for selected
          if (isSelected) {
            ctx.beginPath();
            ctx.arc(px * hr, py * vr, (endpointRadius + 2) * hr, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(px * hr, py * vr, endpointRadius * hr, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? "#60a5fa" : isHovered ? "#93c5fd" : line.color;
          ctx.fill();
        }

        ctx.restore();
      }
    });
  }
}

// ── Pane View ──

class TrendLinePaneView implements IPrimitivePaneView {
  _source: TrendLinePrimitive;

  constructor(source: TrendLinePrimitive) {
    this._source = source;
  }

  renderer(): IPrimitivePaneRenderer {
    return new TrendLinePaneRenderer(this._source);
  }
}

// ── Main Primitive ──

export class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType> | null = null;
  _chart: IChartApi | null = null;
  _lines: TrendLineData[] = [];
  _paneView: TrendLinePaneView;

  selectedId: string | null = null;
  hoveredId: string | null = null;

  constructor() {
    this._paneView = new TrendLinePaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._series = param.series;
    this._chart = param.chart;
  }

  detached(): void {
    this._series = null;
    this._chart = null;
  }

  paneViews() {
    return [this._paneView];
  }

  /** Force visual update */
  requestUpdate(): void {
    if (this._series) this._series.applyOptions({});
  }

  // ── Hit testing ──

  customHitTest(cssX: number, cssY: number): HitResult | null {
    if (!this._series || !this._chart) return null;
    const timeScale = this._chart.timeScale();

    const ENDPOINT_R = 10;
    const LINE_THRESH = 7;

    // Iterate in reverse so topmost line is matched first
    for (let i = this._lines.length - 1; i >= 0; i--) {
      const line = this._lines[i];
      const x1 = timeScale.timeToCoordinate(line.p1.time as Time);
      const y1 = this._series.priceToCoordinate(line.p1.price);
      const x2 = timeScale.timeToCoordinate(line.p2.time as Time);
      const y2 = this._series.priceToCoordinate(line.p2.price);

      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

      // Check endpoints first (higher priority)
      if (dist(cssX, cssY, x1, y1) < ENDPOINT_R) return { id: line.id, part: "p1" };
      if (dist(cssX, cssY, x2, y2) < ENDPOINT_R) return { id: line.id, part: "p2" };

      // Check line body
      if (distToSegment(cssX, cssY, x1, y1, x2, y2) < LINE_THRESH) return { id: line.id, part: "body" };
    }

    return null;
  }

  // ── Line CRUD ──

  setLines(lines: TrendLineData[]): void {
    this._lines = lines;
    this.selectedId = null;
    this.hoveredId = null;
    this.requestUpdate();
  }

  addLine(line: TrendLineData): void {
    this._lines.push(line);
    this.requestUpdate();
  }

  removeLine(id: string): void {
    this._lines = this._lines.filter((l) => l.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    if (this.hoveredId === id) this.hoveredId = null;
    this.requestUpdate();
  }

  getLine(id: string): TrendLineData | undefined {
    return this._lines.find((l) => l.id === id);
  }

  updateLine(id: string, p1: { time: number; price: number }, p2: { time: number; price: number }): void {
    const line = this._lines.find((l) => l.id === id);
    if (line) {
      line.p1 = p1;
      line.p2 = p2;
      this.requestUpdate();
    }
  }

  setSelected(id: string | null): void {
    if (this.selectedId !== id) {
      this.selectedId = id;
      this.requestUpdate();
    }
  }

  setHovered(id: string | null): void {
    if (this.hoveredId !== id) {
      this.hoveredId = id;
      this.requestUpdate();
    }
  }
}
