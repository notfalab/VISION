import type { OHLCV } from "@/types/market";
import type { UTCTimestamp } from "lightweight-charts";

export interface IndicatorPoint {
  time: UTCTimestamp;
  value: number;
}

function toUTC(ts: string): UTCTimestamp {
  return (new Date(ts).getTime() / 1000) as UTCTimestamp;
}

export function computeSMA(data: OHLCV[], period: number): IndicatorPoint[] {
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
        time: toUTC(data[i].timestamp),
        value: sum / period,
      });
    }
  }
  return result;
}

export function computeEMA(data: OHLCV[], period: number): IndicatorPoint[] {
  if (data.length < period) return [];
  const result: IndicatorPoint[] = [];
  const alpha = 2 / (period + 1);

  // Initialize EMA with SMA of first `period` candles
  let ema = 0;
  for (let i = 0; i < period; i++) {
    ema += data[i].close;
  }
  ema /= period;
  result.push({ time: toUTC(data[period - 1].timestamp), value: ema });

  for (let i = period; i < data.length; i++) {
    ema = data[i].close * alpha + ema * (1 - alpha);
    result.push({ time: toUTC(data[i].timestamp), value: ema });
  }
  return result;
}
