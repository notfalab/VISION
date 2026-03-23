/**
 * Order Blocks — Smart Money Concepts overlay.
 *
 * Detects the last opposite candle before a strong impulse move.
 * Bullish OB: last bearish candle before a strong bullish impulse (>2× ATR)
 * Bearish OB: last bullish candle before a strong bearish impulse
 *
 * Zones extend to the right edge of the chart until mitigated.
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

/* ── Types ── */
interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface OrderBlock {
  type: "bullish" | "bearish";
  time: number;
  priceTop: number;   // high of OB candle
  priceBottom: number; // low of OB candle
  mitigated: boolean;
}

/* ── ATR computation ── */
function computeATR(candles: OHLCV[], period: number = 14): number[] {
  const atrs: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      atrs[i] = candles[i].high - candles[i].low;
      continue;
    }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    if (i < period) {
      atrs[i] = tr;
    } else {
      atrs[i] = atrs[i - 1] * (period - 1) / period + tr / period;
    }
  }
  return atrs;
}

/* ── Detection ── */
export function detectOrderBlocks(candles: OHLCV[]): OrderBlock[] {
  if (candles.length < 5) return [];

  const atrs = computeATR(candles, 14);
  const obs: OrderBlock[] = [];
  const impulseLen = 3;

  for (let i = 0; i < candles.length - impulseLen; i++) {
    const atr = atrs[i];
    if (atr <= 0) continue;

    // Check impulse magnitude over next 3 candles
    let impulseHigh = -Infinity;
    let impulseLow = Infinity;
    for (let j = i + 1; j <= i + impulseLen && j < candles.length; j++) {
      impulseHigh = Math.max(impulseHigh, candles[j].high);
      impulseLow = Math.min(impulseLow, candles[j].low);
    }

    const impulseMove = impulseHigh - impulseLow;
    if (impulseMove < 2 * atr) continue;

    const c = candles[i];
    const impulseClose = candles[Math.min(i + impulseLen, candles.length - 1)].close;
    const isBearishCandle = c.close < c.open;
    const isBullishCandle = c.close >= c.open;

    // Bullish OB: bearish candle before bullish impulse
    if (isBearishCandle && impulseClose > c.close) {
      const ob: OrderBlock = {
        type: "bullish",
        time: c.time,
        priceTop: c.high,
        priceBottom: c.low,
        mitigated: false,
      };
      // Check mitigation
      for (let j = i + impulseLen + 1; j < candles.length; j++) {
        if (candles[j].low <= ob.priceTop) {
          ob.mitigated = true;
          break;
        }
      }
      obs.push(ob);
    }

    // Bearish OB: bullish candle before bearish impulse
    if (isBullishCandle && impulseClose < c.close) {
      const ob: OrderBlock = {
        type: "bearish",
        time: c.time,
        priceTop: c.high,
        priceBottom: c.low,
        mitigated: false,
      };
      // Check mitigation
      for (let j = i + impulseLen + 1; j < candles.length; j++) {
        if (candles[j].high >= ob.priceBottom) {
          ob.mitigated = true;
          break;
        }
      }
      obs.push(ob);
    }
  }

  return obs;
}

/* ── Renderer ── */
class OBRenderer implements IPrimitivePaneRenderer {
  private _obs: OrderBlock[] = [];
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: any = null;

  setData(obs: OrderBlock[], series: ISeriesApi<SeriesType, Time>, chart: any): void {
    this._obs = obs;
    this._series = series;
    this._chart = chart;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._obs.length === 0 || !this._series || !this._chart) return;

    const timeScale = this._chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const ob of this._obs) {
        const x1 = timeScale.timeToCoordinate(ob.time as unknown as Time);
        if (x1 === null) continue;

        const yTop = this._series!.priceToCoordinate(ob.priceTop);
        const yBot = this._series!.priceToCoordinate(ob.priceBottom);
        if (yTop === null || yBot === null) continue;

        const rectH = Math.abs(yBot - yTop);
        if (rectH < 1) continue;

        const y = Math.min(yTop, yBot);
        const rectW = mediaSize.width - x1;
        if (rectW < 2) continue;

        const alpha = ob.mitigated ? 0.04 : 0.10;
        const borderAlpha = ob.mitigated ? 0.06 : 0.30;

        if (ob.type === "bullish") {
          // Blue zone
          ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
          ctx.fillRect(x1, y, rectW, rectH);
          ctx.strokeStyle = `rgba(59, 130, 246, ${borderAlpha})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(x1, y, rectW, rectH);
        } else {
          // Orange zone
          ctx.fillStyle = `rgba(249, 115, 22, ${alpha})`;
          ctx.fillRect(x1, y, rectW, rectH);
          ctx.strokeStyle = `rgba(249, 115, 22, ${borderAlpha})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(x1, y, rectW, rectH);
        }

        // "OB" label at left edge (unmitigated only)
        if (!ob.mitigated && rectH > 8) {
          ctx.font = "bold 8px JetBrains Mono, monospace";
          ctx.textAlign = "left";
          ctx.fillStyle = ob.type === "bullish"
            ? "rgba(59, 130, 246, 0.6)"
            : "rgba(249, 115, 22, 0.6)";
          ctx.fillText("OB", x1 + 3, y + rectH / 2 + 3);
        }
      }
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {}
}

/* ── View ── */
class OBView implements IPrimitivePaneView {
  private _source: OrderBlockPrimitive;
  private _renderer = new OBRenderer();

  constructor(source: OrderBlockPrimitive) {
    this._source = source;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const { _series, _chart, _visible, _obs } = this._source;
    if (!_visible || !_series || !_chart || _obs.length === 0) {
      this._renderer.setData([], null as any, null);
      return this._renderer;
    }
    this._renderer.setData(_obs, _series, _chart);
    return this._renderer;
  }
}

/* ── Primitive ── */
export class OrderBlockPrimitive implements ISeriesPrimitive<Time> {
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _chart: any = null;
  _visible = false;
  _obs: OrderBlock[] = [];

  private _requestUpdate: (() => void) | null = null;
  private _view = new OBView(this);
  private _paneViews: readonly IPrimitivePaneView[] = [this._view];

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

  update(visible: boolean, candles: OHLCV[]): void {
    this._visible = visible;
    if (visible && candles.length >= 5) {
      this._obs = detectOrderBlocks(candles);
    } else {
      this._obs = [];
    }
    this._requestUpdate?.();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    if (!visible) this._obs = [];
    this._requestUpdate?.();
  }

  setTheme(): void {
    this._requestUpdate?.();
  }
}
