import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  Logical,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesType,
  IChartApiBase,
  ISeriesApi,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

/* ── Trading Sessions (UTC hours) ── */
interface TradingSession {
  name: string;
  startHour: number;
  endHour: number;
  color: string;
  labelColor: string;
}

const SESSIONS: TradingSession[] = [
  {
    name: "ASIA",
    startHour: 0,
    endHour: 8,
    color: "rgba(59, 130, 246, 0.04)",
    labelColor: "rgba(59, 130, 246, 0.5)",
  },
  {
    name: "LONDON",
    startHour: 7,
    endHour: 16,
    color: "rgba(16, 185, 129, 0.04)",
    labelColor: "rgba(16, 185, 129, 0.5)",
  },
  {
    name: "NEW YORK",
    startHour: 13,
    endHour: 22,
    color: "rgba(245, 158, 11, 0.04)",
    labelColor: "rgba(245, 158, 11, 0.5)",
  },
];

const OVERLAP_COLOR = "rgba(168, 85, 247, 0.06)";
const OVERLAP_LABEL_COLOR = "rgba(168, 85, 247, 0.45)";

function getSessionForHour(hour: number): {
  sessions: string[];
  isOverlap: boolean;
} {
  const active = SESSIONS.filter((s) => {
    if (s.startHour < s.endHour)
      return hour >= s.startHour && hour < s.endHour;
    return hour >= s.startHour || hour < s.endHour;
  });
  return {
    sessions: active.map((s) => s.name),
    isOverlap: active.length > 1,
  };
}

class SessionBandsRenderer implements IPrimitivePaneRenderer {
  private _chart: IChartApiBase<Time>;
  private _series: ISeriesApi<SeriesType, Time>;
  private _visible: boolean;
  private _isIntraday: boolean;

  constructor(
    chart: IChartApiBase<Time>,
    series: ISeriesApi<SeriesType, Time>,
    visible: boolean,
    isIntraday: boolean
  ) {
    this._chart = chart;
    this._series = series;
    this._visible = visible;
    this._isIntraday = isIntraday;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (!this._visible || !this._isIntraday) return;

    const timeScale = this._chart.timeScale();
    const visibleRange = timeScale.getVisibleLogicalRange();
    if (!visibleRange) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const from = Math.max(0, Math.floor(visibleRange.from));
      const to = Math.ceil(visibleRange.to);

      // Get data for visible bars
      let currentSessionKey = "";
      let bandStartX = -1;
      let bandLabelColor = "";
      let bandBgColor = "";

      for (let i = from; i <= to; i++) {
        const time = this._series.dataByIndex(i as unknown as Logical)?.time;
        let sessionKey = "";
        let bgColor = "";
        let labelColor = "";

        if (time !== undefined && time !== null) {
          const d = new Date((time as number) * 1000);
          const hour = d.getUTCHours();
          const info = getSessionForHour(hour);

          if (info.isOverlap) {
            sessionKey = "OVERLAP";
            bgColor = OVERLAP_COLOR;
            labelColor = OVERLAP_LABEL_COLOR;
          } else if (info.sessions.length > 0) {
            const sess = SESSIONS.find((s) => s.name === info.sessions[0]);
            sessionKey = info.sessions[0];
            bgColor = sess?.color || "";
            labelColor = sess?.labelColor || "";
          }
        }

        if (sessionKey !== currentSessionKey || i === to) {
          // Draw previous band
          if (bandStartX >= 0 && currentSessionKey && bandBgColor) {
            const currentX =
              timeScale.logicalToCoordinate(i as unknown as Logical) ?? mediaSize.width;
            const bandW = currentX - bandStartX;

            // Background fill
            ctx.fillStyle = bandBgColor;
            ctx.fillRect(bandStartX, 0, bandW, mediaSize.height);

            // Session label at top
            if (bandW > 30) {
              ctx.font = "bold 8px JetBrains Mono, monospace";
              ctx.fillStyle = bandLabelColor;
              ctx.textAlign = "center";
              ctx.fillText(
                currentSessionKey === "OVERLAP" ? "L/NY" : currentSessionKey,
                bandStartX + bandW / 2,
                14
              );
            }

            // Vertical separator line
            ctx.strokeStyle = bandLabelColor;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(bandStartX, 0);
            ctx.lineTo(bandStartX, mediaSize.height * 0.75);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          bandStartX = timeScale.logicalToCoordinate(i as unknown as Logical) ?? 0;
          currentSessionKey = sessionKey;
          bandBgColor = bgColor;
          bandLabelColor = labelColor;
        }
      }
    });
  }

  draw(): void {
    // No foreground drawing needed
  }
}

class SessionBandsView implements IPrimitivePaneView {
  private _renderer: SessionBandsRenderer | null = null;
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _visible = true;
  private _isIntraday = true;

  setParams(
    chart: IChartApiBase<Time>,
    series: ISeriesApi<SeriesType, Time>,
    visible: boolean,
    isIntraday: boolean
  ) {
    this._chart = chart;
    this._series = series;
    this._visible = visible;
    this._isIntraday = isIntraday;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._chart || !this._series) return null;
    this._renderer = new SessionBandsRenderer(
      this._chart,
      this._series,
      this._visible,
      this._isIntraday
    );
    return this._renderer;
  }
}

export class SessionBandsPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _view = new SessionBandsView();
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];
  private _visible = true;
  private _isIntraday = true;

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews(): void {
    if (this._chart && this._series) {
      this._view.setParams(
        this._chart,
        this._series,
        this._visible,
        this._isIntraday
      );
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  update(visible: boolean, isIntraday: boolean): void {
    this._visible = visible;
    this._isIntraday = isIntraday;
    this._requestUpdate?.();
  }
}
