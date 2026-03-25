/**
 * Smart Money Concepts (SMC) — auto-detection overlay.
 *
 * Detects and renders:
 * - CHoCH (Change of Character) — trend reversal markers
 * - BOS (Break of Structure) — trend continuation lines
 * - Equal Highs/Lows — liquidity pool dotted lines
 * - Premium/Discount zones — shaded top/bottom halves of swing range
 *
 * All computed client-side from OHLCV data.
 */

import type {
  ISeriesPrimitive, SeriesAttachedParameter, Time,
  IPrimitivePaneView, IPrimitivePaneRenderer, SeriesType, ISeriesApi,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

interface OHLCV { time: number; open: number; high: number; low: number; close: number; }

interface SwingPoint { time: number; price: number; type: "high" | "low"; index: number; }

interface SMCMarker {
  type: "choch" | "bos";
  time: number;
  price: number;
  direction: "bullish" | "bearish";
}

interface EqualLevel {
  price: number;
  time1: number;
  time2: number;
  type: "high" | "low";
}

interface PremDiscZone {
  topPrice: number;
  midPrice: number;
  bottomPrice: number;
  startTime: number;
}

/* ── Detection ── */

function detectSwings(candles: OHLCV[], lookback: number = 5): SwingPoint[] {
  const half = Math.floor(lookback / 2);
  const swings: SwingPoint[] = [];
  for (let i = half; i < candles.length - half; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - half; j <= i + half; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) swings.push({ time: candles[i].time, price: candles[i].high, type: "high", index: i });
    if (isLow) swings.push({ time: candles[i].time, price: candles[i].low, type: "low", index: i });
  }
  return swings;
}

function detectSMCMarkers(swings: SwingPoint[], _candles: OHLCV[]): SMCMarker[] {
  const markers: SMCMarker[] = [];
  if (swings.length < 4) return markers;

  // Process swings in chronological order to track trend changes
  let trend: string = "none"; // "up" | "down" | "none"
  let lastSwingHigh = -Infinity;
  let lastSwingLow = Infinity;

  for (let i = 1; i < swings.length; i++) {
    const s = swings[i];

    if (s.type === "high") {
      if (s.price > lastSwingHigh && lastSwingHigh > -Infinity) {
        // Higher High
        if (trend === "down") {
          markers.push({ type: "choch", time: s.time, price: s.price, direction: "bullish" });
        } else if (trend === "up") {
          markers.push({ type: "bos", time: s.time, price: s.price, direction: "bullish" });
        }
        trend = "up";
      }
      lastSwingHigh = s.price;
    } else {
      if (s.price < lastSwingLow && lastSwingLow < Infinity) {
        // Lower Low
        if (trend === "up") {
          markers.push({ type: "choch", time: s.time, price: s.price, direction: "bearish" });
        } else if (trend === "down") {
          markers.push({ type: "bos", time: s.time, price: s.price, direction: "bearish" });
        }
        trend = "down";
      }
      lastSwingLow = s.price;
    }
  }

  return markers;
}

function detectEqualLevels(swings: SwingPoint[], threshold: number = 0.001): EqualLevel[] {
  const levels: EqualLevel[] = [];
  const highs = swings.filter(s => s.type === "high");
  const lows = swings.filter(s => s.type === "low");

  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < Math.min(i + 6, highs.length); j++) {
      const diff = Math.abs(highs[i].price - highs[j].price) / highs[i].price;
      if (diff < threshold) {
        levels.push({ price: (highs[i].price + highs[j].price) / 2, time1: highs[i].time, time2: highs[j].time, type: "high" });
      }
    }
  }
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < Math.min(i + 6, lows.length); j++) {
      const diff = Math.abs(lows[i].price - lows[j].price) / lows[i].price;
      if (diff < threshold) {
        levels.push({ price: (lows[i].price + lows[j].price) / 2, time1: lows[i].time, time2: lows[j].time, type: "low" });
      }
    }
  }
  return levels;
}

function computePremiumDiscount(swings: SwingPoint[]): PremDiscZone | null {
  const recentHighs = swings.filter(s => s.type === "high").slice(-3);
  const recentLows = swings.filter(s => s.type === "low").slice(-3);
  if (recentHighs.length === 0 || recentLows.length === 0) return null;

  const top = Math.max(...recentHighs.map(s => s.price));
  const bottom = Math.min(...recentLows.map(s => s.price));
  const mid = (top + bottom) / 2;
  const startTime = Math.min(...[...recentHighs, ...recentLows].map(s => s.time));
  return { topPrice: top, midPrice: mid, bottomPrice: bottom, startTime };
}

/* ── Renderer ── */
class SMCRenderer implements IPrimitivePaneRenderer {
  private _markers: SMCMarker[] = [];
  private _equalLevels: EqualLevel[] = [];
  private _premDisc: PremDiscZone | null = null;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: any = null;

  setData(markers: SMCMarker[], levels: EqualLevel[], pd: PremDiscZone | null,
    series: ISeriesApi<SeriesType, Time>, chart: any): void {
    this._markers = markers; this._equalLevels = levels; this._premDisc = pd;
    this._series = series; this._chart = chart;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (!this._series || !this._chart) return;
    const ts = this._chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      // Premium/Discount zones
      if (this._premDisc) {
        const pd = this._premDisc;
        const x0 = ts.timeToCoordinate(pd.startTime as unknown as Time);
        if (x0 !== null) {
          const yTop = this._series!.priceToCoordinate(pd.topPrice);
          const yMid = this._series!.priceToCoordinate(pd.midPrice);
          const yBot = this._series!.priceToCoordinate(pd.bottomPrice);
          if (yTop !== null && yMid !== null && yBot !== null) {
            const w = mediaSize.width - x0;
            // Premium zone (top half) — bearish territory
            ctx.fillStyle = "rgba(239, 68, 68, 0.04)";
            ctx.fillRect(x0, Math.min(yTop, yMid), w, Math.abs(yMid - yTop));
            // Discount zone (bottom half) — bullish territory
            ctx.fillStyle = "rgba(34, 197, 94, 0.04)";
            ctx.fillRect(x0, Math.min(yMid, yBot), w, Math.abs(yBot - yMid));
            // Equilibrium line
            ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
            ctx.lineWidth = 0.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x0, yMid);
            ctx.lineTo(mediaSize.width, yMid);
            ctx.stroke();
            ctx.setLineDash([]);
            // Labels
            ctx.font = "bold 7px monospace";
            ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
            ctx.textAlign = "right";
            ctx.fillText("PREMIUM", mediaSize.width - 4, Math.min(yTop, yMid) + 10);
            ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
            ctx.fillText("DISCOUNT", mediaSize.width - 4, Math.max(yMid, yBot) - 4);
          }
        }
      }

      // Equal Highs/Lows — liquidity pools
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 0.8;
      for (const eq of this._equalLevels) {
        const y = this._series!.priceToCoordinate(eq.price);
        const x1 = ts.timeToCoordinate(eq.time1 as unknown as Time);
        if (y === null || x1 === null) continue;
        ctx.strokeStyle = eq.type === "high" ? "rgba(239, 68, 68, 0.45)" : "rgba(34, 197, 94, 0.45)";
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(mediaSize.width, y);
        ctx.stroke();
        // $ label
        ctx.font = "bold 7px monospace";
        ctx.fillStyle = eq.type === "high" ? "rgba(239, 68, 68, 0.5)" : "rgba(34, 197, 94, 0.5)";
        ctx.textAlign = "left";
        ctx.fillText(eq.type === "high" ? "EQH $$$" : "EQL $$$", x1 + 3, y - 3);
      }
      ctx.setLineDash([]);
    });
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._markers.length === 0 || !this._series || !this._chart) return;
    const ts = this._chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const m of this._markers) {
        const x = ts.timeToCoordinate(m.time as unknown as Time);
        const y = this._series!.priceToCoordinate(m.price);
        if (x === null || y === null) continue;

        const isBull = m.direction === "bullish";
        const color = isBull ? "rgba(34, 197, 94, 0.9)" : "rgba(239, 68, 68, 0.9)";
        const bgColor = isBull ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)";

        if (m.type === "choch") {
          // CHoCH — prominent label with background
          const label = "CHoCH";
          ctx.font = "bold 9px monospace";
          const tw = ctx.measureText(label).width;
          const ly = isBull ? y - 14 : y + 6;
          ctx.fillStyle = bgColor;
          ctx.fillRect(x - tw / 2 - 3, ly - 1, tw + 6, 12);
          ctx.fillStyle = color;
          ctx.textAlign = "center";
          ctx.fillText(label, x, ly + 9);
          // Arrow
          ctx.beginPath();
          if (isBull) {
            ctx.moveTo(x, y - 2); ctx.lineTo(x - 4, y - 8); ctx.lineTo(x + 4, y - 8);
          } else {
            ctx.moveTo(x, y + 2); ctx.lineTo(x - 4, y + 8); ctx.lineTo(x + 4, y + 8);
          }
          ctx.fill();
        } else {
          // BOS — extending dashed line with small label
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.7;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(mediaSize.width, y);
          ctx.stroke();
          ctx.setLineDash([]);
          // Label
          ctx.font = "bold 7px monospace";
          ctx.fillStyle = color;
          ctx.textAlign = "left";
          ctx.fillText("BOS", x + 4, y - 3);
        }
      }
    });
  }
}

/* ── Views ── */
class SMCBgView implements IPrimitivePaneView {
  private _source: SMCPrimitive;
  private _renderer = new SMCRenderer();
  constructor(source: SMCPrimitive) { this._source = source; }
  zOrder(): "bottom" { return "bottom"; }
  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _chart, _visible, _equalLevels, _premDisc } = this._source;
    if (!_visible || !_series || !_chart) {
      this._renderer.setData([], [], null, null as any, null);
      return this._renderer;
    }
    this._renderer.setData([], _equalLevels, _premDisc, _series, _chart);
    return this._renderer;
  }
}

class SMCFgView implements IPrimitivePaneView {
  private _source: SMCPrimitive;
  private _renderer = new SMCRenderer();
  constructor(source: SMCPrimitive) { this._source = source; }
  zOrder(): "top" { return "top"; }
  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _chart, _visible, _markers } = this._source;
    if (!_visible || !_series || !_chart) {
      this._renderer.setData([], [], null, null as any, null);
      return this._renderer;
    }
    this._renderer.setData(_markers, [], null, _series, _chart);
    return this._renderer;
  }
}

/* ── Primitive ── */
export class SMCPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _visible = false;
  _markers: SMCMarker[] = [];
  _equalLevels: EqualLevel[] = [];
  _premDisc: PremDiscZone | null = null;

  private _requestUpdate: (() => void) | null = null;
  private _paneViews: readonly IPrimitivePaneView[];

  constructor() {
    this._paneViews = [new SMCBgView(this), new SMCFgView(this)];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series; this._chart = param.chart; this._requestUpdate = param.requestUpdate;
  }
  detached(): void { this._series = null; this._chart = null; this._requestUpdate = null; }
  updateAllViews(): void {}
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews; }

  update(visible: boolean, candles: OHLCV[]): void {
    this._visible = visible;
    if (visible && candles.length >= 10) {
      const swings = detectSwings(candles, 5);
      this._markers = detectSMCMarkers(swings, candles);
      this._equalLevels = detectEqualLevels(swings, 0.001);
      this._premDisc = computePremiumDiscount(swings);
    } else {
      this._markers = []; this._equalLevels = []; this._premDisc = null;
    }
    this._requestUpdate?.();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    if (!visible) { this._markers = []; this._equalLevels = []; this._premDisc = null; }
    this._requestUpdate?.();
  }
}
