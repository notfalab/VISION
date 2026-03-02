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
import { THEME_CANVAS, type ThemeName, type CanvasColors } from "@/stores/theme";

/* ── Types ── */
export interface AccZone {
  priceMin: number;
  priceMax: number;
  volume: number;
  type: "buy" | "sell";
  strength: number;
}

export interface ZoneShift {
  zone: AccZone;
  direction: "new" | "growing" | "shrinking" | "gone";
  timestamp: number;
}

/* ── Zone computation helpers ── */
export function clusterLevels(
  levels: { price: number; quantity: number }[],
  thresholdPct = 0.005
): { priceMin: number; priceMax: number; volume: number }[] {
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; volumes: number[] }[] = [];
  let current = { prices: [sorted[0].price], volumes: [sorted[0].quantity] };

  for (let i = 1; i < sorted.length; i++) {
    const dist =
      Math.abs(sorted[i].price - current.prices[current.prices.length - 1]) /
      sorted[i].price;
    if (dist < thresholdPct) {
      current.prices.push(sorted[i].price);
      current.volumes.push(sorted[i].quantity);
    } else {
      clusters.push(current);
      current = {
        prices: [sorted[i].price],
        volumes: [sorted[i].quantity],
      };
    }
  }
  clusters.push(current);

  return clusters.map((c) => ({
    priceMin: Math.min(...c.prices),
    priceMax: Math.max(...c.prices),
    volume: c.volumes.reduce((a, b) => a + b, 0),
  }));
}

export function computeAccumulationZones(
  bids: { price: number; quantity: number }[],
  asks: { price: number; quantity: number }[]
): AccZone[] {
  const bidClusters = clusterLevels(bids);
  const askClusters = clusterLevels(asks);

  const allVolumes = [...bidClusters, ...askClusters].map((c) => c.volume);
  const maxVol = Math.max(...allVolumes, 1);

  const zones: AccZone[] = [];

  for (const c of bidClusters) {
    const strength = c.volume / maxVol;
    if (strength > 0.25) {
      zones.push({
        priceMin: c.priceMin,
        priceMax: c.priceMax,
        volume: c.volume,
        type: "buy",
        strength,
      });
    }
  }

  for (const c of askClusters) {
    const strength = c.volume / maxVol;
    if (strength > 0.25) {
      zones.push({
        priceMin: c.priceMin,
        priceMax: c.priceMax,
        volume: c.volume,
        type: "sell",
        strength,
      });
    }
  }

  return zones;
}

export function detectZoneShifts(
  prev: AccZone[],
  next: AccZone[]
): ZoneShift[] {
  const shifts: ZoneShift[] = [];
  const now = Date.now();

  for (const nz of next) {
    const mid = (nz.priceMin + nz.priceMax) / 2;
    const match = prev.find((pz) => {
      const pMid = (pz.priceMin + pz.priceMax) / 2;
      return Math.abs(pMid - mid) / mid < 0.005 && pz.type === nz.type;
    });
    if (!match) {
      if (nz.strength > 0.4)
        shifts.push({ zone: nz, direction: "new", timestamp: now });
    } else if (nz.volume > match.volume * 1.3) {
      shifts.push({ zone: nz, direction: "growing", timestamp: now });
    } else if (nz.volume < match.volume * 0.6) {
      shifts.push({ zone: nz, direction: "shrinking", timestamp: now });
    }
  }

  for (const pz of prev) {
    const pMid = (pz.priceMin + pz.priceMax) / 2;
    const still = next.find((nz) => {
      const nMid = (nz.priceMin + nz.priceMax) / 2;
      return Math.abs(nMid - pMid) / pMid < 0.005 && nz.type === pz.type;
    });
    if (!still && pz.strength > 0.4) {
      shifts.push({ zone: pz, direction: "gone", timestamp: now });
    }
  }

  return shifts;
}

/* ── Renderer ── */
class AccZoneRenderer implements IPrimitivePaneRenderer {
  private _series: ISeriesApi<SeriesType, Time>;
  private _zones: AccZone[];
  private _shifts: ZoneShift[];
  private _tc: CanvasColors;

  constructor(
    series: ISeriesApi<SeriesType, Time>,
    zones: AccZone[],
    shifts: ZoneShift[],
    tc: CanvasColors
  ) {
    this._series = series;
    this._zones = zones;
    this._shifts = shifts;
    this._tc = tc;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._zones.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const tc = this._tc;

      for (const zone of this._zones) {
        const yTop = this._series.priceToCoordinate(zone.priceMax);
        const yBot = this._series.priceToCoordinate(zone.priceMin);
        if (yTop === null || yBot === null) continue;

        const rawH = yBot - yTop;
        const zoneH = Math.max(4, rawH);
        const yCenter = (yTop + yBot) / 2;
        const drawYTop = yCenter - zoneH / 2;

        if (drawYTop > mediaSize.height || drawYTop + zoneH < 0) continue;

        const alpha = 0.08 + zone.strength * 0.15;
        const zRgb = zone.type === "buy" ? tc.zonesBuy : tc.zonesSell;
        ctx.fillStyle = `rgba(${zRgb[0]}, ${zRgb[1]}, ${zRgb[2]}, ${alpha})`;
        ctx.fillRect(0, drawYTop, mediaSize.width, zoneH);

        // Zone edge line
        const edgeAlpha = 0.2 + zone.strength * 0.3;
        ctx.strokeStyle = `rgba(${zRgb[0]}, ${zRgb[1]}, ${zRgb[2]}, ${edgeAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, yCenter);
        ctx.lineTo(mediaSize.width, yCenter);
        ctx.stroke();
        ctx.setLineDash([]);

        // Zone label
        if (zone.strength > 0.4) {
          const label = zone.type === "buy" ? "BUY WALL" : "SELL WALL";
          ctx.font = "bold 8px JetBrains Mono, monospace";
          const labelAlpha = 0.5 + zone.strength * 0.4;
          ctx.fillStyle = `rgba(${zRgb[0]}, ${zRgb[1]}, ${zRgb[2]}, ${labelAlpha})`;
          ctx.textAlign = "left";
          const labelY = zone.type === "buy" ? yCenter + 10 : yCenter - 4;
          ctx.fillText(label, 4, labelY);
        }
      }
    });
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._shifts.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const tc = this._tc;
      const now = Date.now();

      for (const shift of this._shifts) {
        const age = now - shift.timestamp;
        if (age > 30000) continue;
        const fade = 1 - age / 30000;

        const midPrice = (shift.zone.priceMin + shift.zone.priceMax) / 2;
        const y = this._series.priceToCoordinate(midPrice);
        if (y === null) continue;

        let marker = "";
        let color = "";
        const sn = tc.shiftNew,
          sg = tc.shiftGrowing,
          ss = tc.shiftShrinking,
          sgo = tc.shiftGone;

        if (shift.direction === "new") {
          marker = "NEW";
          color = `rgba(${sn[0]}, ${sn[1]}, ${sn[2]}, ${fade})`;
        } else if (shift.direction === "growing") {
          marker = shift.zone.type === "buy" ? "++BUY" : "++SELL";
          color = `rgba(${sg[0]}, ${sg[1]}, ${sg[2]}, ${fade})`;
        } else if (shift.direction === "shrinking") {
          marker = "WEAK";
          color = `rgba(${ss[0]}, ${ss[1]}, ${ss[2]}, ${fade})`;
        } else if (shift.direction === "gone") {
          marker = "GONE";
          color = `rgba(${sgo[0]}, ${sgo[1]}, ${sgo[2]}, ${fade * 0.7})`;
        }

        if (marker) {
          ctx.font = "bold 9px JetBrains Mono, monospace";
          ctx.fillStyle = color;
          ctx.textAlign = "right";
          ctx.fillText(marker, mediaSize.width - 75, y + 3);

          ctx.beginPath();
          ctx.arc(
            mediaSize.width - 75 - ctx.measureText(marker).width - 8,
            y,
            2.5,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    });
  }
}

/* ── View ── */
class AccZoneView implements IPrimitivePaneView {
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _zones: AccZone[] = [];
  private _shifts: ZoneShift[] = [];
  private _tc: CanvasColors = THEME_CANVAS.dim;

  setParams(
    series: ISeriesApi<SeriesType, Time>,
    zones: AccZone[],
    shifts: ZoneShift[],
    tc: CanvasColors
  ) {
    this._series = series;
    this._zones = zones;
    this._shifts = shifts;
    this._tc = tc;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series) return null;
    return new AccZoneRenderer(
      this._series,
      this._zones,
      this._shifts,
      this._tc
    );
  }
}

/* ── Primitive ── */
export class AccZonePrimitive implements ISeriesPrimitive<Time> {
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _view = new AccZoneView();
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];
  private _zones: AccZone[] = [];
  private _shifts: ZoneShift[] = [];
  private _tc: CanvasColors;

  constructor(theme: ThemeName) {
    this._tc = THEME_CANVAS[theme];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews(): void {
    if (this._series) {
      this._view.setParams(
        this._series,
        this._zones,
        this._shifts,
        this._tc
      );
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  updateZones(zones: AccZone[], shifts: ZoneShift[]): void {
    this._zones = zones;
    this._shifts = shifts;
    this._requestUpdate?.();
  }

  cleanOldShifts(): void {
    const cutoff = Date.now() - 30000;
    const before = this._shifts.length;
    this._shifts = this._shifts.filter((s) => s.timestamp > cutoff);
    if (this._shifts.length !== before) {
      this._requestUpdate?.();
    }
  }

  setTheme(theme: ThemeName): void {
    this._tc = THEME_CANVAS[theme];
    this._requestUpdate?.();
  }
}
