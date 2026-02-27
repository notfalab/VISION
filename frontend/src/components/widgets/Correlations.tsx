"use client";

import { useEffect, useState, useRef } from "react";
import { GitCompareArrows, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

interface CorrelationData {
  correlations: {
    gold_dxy?: number;
    gold_10y?: number;
  };
  dxy: {
    current: number | null;
    trend: string;
    sparkline: number[];
    gold_signal: string;
  };
  treasury_10y: {
    current: number | null;
    trend: string;
    sparkline: number[];
    gold_signal: string;
  };
  gold_macro_signal: string;
}

function MiniSparkline({
  data,
  color,
  width = 80,
  height = 20,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";

    data.forEach((val, i) => {
      const x = i * step;
      const y = height - ((val - min) / range) * (height - 2) - 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill gradient below
    const lastX = (data.length - 1) * step;
    const lastY =
      height - ((data[data.length - 1] - min) / range) * (height - 2) - 1;
    ctx.lineTo(lastX, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, color + "30");
    grad.addColorStop(1, color + "05");
    ctx.fillStyle = grad;
    ctx.fill();
  }, [data, color, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "rising")
    return <TrendingUp className="w-2.5 h-2.5 text-[var(--color-bull)]" />;
  if (trend === "falling")
    return <TrendingDown className="w-2.5 h-2.5 text-[var(--color-bear)]" />;
  return <Minus className="w-2.5 h-2.5 text-[var(--color-text-muted)]" />;
}

function signalColor(signal: string) {
  if (signal === "bullish") return "var(--color-bull)";
  if (signal === "bearish") return "var(--color-bear)";
  return "var(--color-text-muted)";
}

export default function Correlations() {
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.goldCorrelations();
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-28 mb-2" />
        <div className="h-16 bg-[var(--color-bg-hover)] rounded" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
          <GitCompareArrows className="w-3.5 h-3.5 text-[var(--color-neon-amber)]" />
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Correlations
          </h3>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] text-[var(--color-text-muted)]">
            Correlation data unavailable.
          </p>
        </div>
      </div>
    );
  }

  const macroColor = signalColor(data.gold_macro_signal);

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <GitCompareArrows className="w-3.5 h-3.5 text-[var(--color-neon-amber)]" />
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Gold Correlations
        </h3>
        <span
          className="text-[7px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ml-auto"
          style={{
            color: macroColor,
            backgroundColor: `color-mix(in srgb, ${macroColor} 12%, transparent)`,
          }}
        >
          {data.gold_macro_signal.toUpperCase()} FOR GOLD
        </span>
        <button
          onClick={load}
          className="p-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
        >
          <RefreshCw
            className={`w-3 h-3 text-[var(--color-text-muted)] ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <div className="p-2.5 space-y-1.5">
        {/* DXY */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-1.5 border border-[var(--color-border-primary)]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] font-semibold text-[var(--color-text-primary)] uppercase">
              DXY (Dollar Index)
            </span>
            <TrendIcon trend={data.dxy.trend} />
            {data.dxy.current && (
              <span className="text-[9px] font-mono text-[var(--color-text-primary)] ml-auto">
                {data.dxy.current.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data.dxy.sparkline?.length > 0 && (
              <MiniSparkline
                data={data.dxy.sparkline}
                color={
                  data.dxy.trend === "rising"
                    ? "#ff1744"
                    : data.dxy.trend === "falling"
                      ? "#00e676"
                      : "#666"
                }
              />
            )}
            <div className="flex-1 text-right">
              <div
                className="text-[7px] font-mono uppercase"
                style={{ color: signalColor(data.dxy.gold_signal) }}
              >
                {data.dxy.gold_signal} for gold
              </div>
              {data.correlations.gold_dxy !== undefined && (
                <div className="text-[7px] font-mono text-[var(--color-text-muted)]">
                  Corr: {data.correlations.gold_dxy.toFixed(3)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 10Y Treasury */}
        <div className="rounded-md bg-[var(--color-bg-secondary)] px-2.5 py-1.5 border border-[var(--color-border-primary)]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] font-semibold text-[var(--color-text-primary)] uppercase">
              10Y Treasury Yield
            </span>
            <TrendIcon trend={data.treasury_10y.trend} />
            {data.treasury_10y.current && (
              <span className="text-[9px] font-mono text-[var(--color-text-primary)] ml-auto">
                {data.treasury_10y.current.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data.treasury_10y.sparkline?.length > 0 && (
              <MiniSparkline
                data={data.treasury_10y.sparkline}
                color={
                  data.treasury_10y.trend === "rising"
                    ? "#ff1744"
                    : data.treasury_10y.trend === "falling"
                      ? "#00e676"
                      : "#666"
                }
              />
            )}
            <div className="flex-1 text-right">
              <div
                className="text-[7px] font-mono uppercase"
                style={{ color: signalColor(data.treasury_10y.gold_signal) }}
              >
                {data.treasury_10y.gold_signal} for gold
              </div>
              {data.correlations.gold_10y !== undefined && (
                <div className="text-[7px] font-mono text-[var(--color-text-muted)]">
                  Corr: {data.correlations.gold_10y.toFixed(3)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
