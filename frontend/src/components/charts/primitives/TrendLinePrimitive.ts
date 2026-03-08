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
      const ratio = scope.horizontalPixelRatio;

      for (const line of this._source._lines) {
        const x1 = timeScale.timeToCoordinate(line.p1.time as Time);
        const y1 = series.priceToCoordinate(line.p1.price);
        const x2 = timeScale.timeToCoordinate(line.p2.time as Time);
        const y2 = series.priceToCoordinate(line.p2.price);

        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

        ctx.save();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.lineWidth * ratio;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1 * ratio, y1 * ratio);
        ctx.lineTo(x2 * ratio, y2 * ratio);
        ctx.stroke();

        // Draw small circles at endpoints
        ctx.fillStyle = line.color;
        for (const [px, py] of [[x1, y1], [x2, y2]]) {
          ctx.beginPath();
          ctx.arc(px * ratio, py * ratio, 3 * ratio, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    });
  }
}

class TrendLinePaneView implements IPrimitivePaneView {
  _source: TrendLinePrimitive;

  constructor(source: TrendLinePrimitive) {
    this._source = source;
  }

  renderer(): IPrimitivePaneRenderer {
    return new TrendLinePaneRenderer(this._source);
  }
}

export class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType> | null = null;
  _chart: IChartApi | null = null;
  _lines: TrendLineData[] = [];
  _paneView: TrendLinePaneView;

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

  setLines(lines: TrendLineData[]): void {
    this._lines = lines;
    if (this._series) this._series.applyOptions({});
  }

  addLine(line: TrendLineData): void {
    this._lines.push(line);
    if (this._series) this._series.applyOptions({});
  }

  removeLine(id: string): void {
    this._lines = this._lines.filter((l) => l.id !== id);
    if (this._series) this._series.applyOptions({});
  }
}
