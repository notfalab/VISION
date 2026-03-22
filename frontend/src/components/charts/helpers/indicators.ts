import type { OHLCV } from "@/types/market";
import type { UTCTimestamp, Time } from "lightweight-charts";

export interface IndicatorPoint {
  time: Time;
  value: number;
}

const DAILY_TFS = new Set(["1d", "1w", "1M"]);

function toTime(ts: string, tf?: string): Time {
  if (tf && DAILY_TFS.has(tf)) {
    const d = new Date(ts);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}` as unknown as Time;
  }
  return (new Date(ts).getTime() / 1000) as UTCTimestamp;
}

export function computeSMA(data: OHLCV[], period: number, tf?: string): IndicatorPoint[] {
  if (data.length < period) return [];
  const result: IndicatorPoint[] = [];
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= period) {
      sum -= data[i - period].close;
    }
    if (i >= period - 1) {
      result.push({
        time: toTime(data[i].timestamp, tf),
        value: sum / period,
      });
    }
  }
  return result;
}

export function computeEMA(data: OHLCV[], period: number, tf?: string): IndicatorPoint[] {
  if (data.length < period) return [];
  const result: IndicatorPoint[] = [];
  const alpha = 2 / (period + 1);

  // Initialize EMA with SMA of first `period` candles
  let ema = 0;
  for (let i = 0; i < period; i++) {
    ema += data[i].close;
  }
  ema /= period;
  result.push({ time: toTime(data[period - 1].timestamp, tf), value: ema });

  for (let i = period; i < data.length; i++) {
    ema = data[i].close * alpha + ema * (1 - alpha);
    result.push({ time: toTime(data[i].timestamp, tf), value: ema });
  }
  return result;
}
