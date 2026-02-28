"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMarketStore } from "@/stores/market";
import { useThemeStore, THEME_CANVAS } from "@/stores/theme";
import { api } from "@/lib/api";
import { formatPrice, formatVolume } from "@/lib/format";
import { binanceKlineWS, isBinanceSymbol } from "@/lib/binance-ws";
import type { LiveCandle } from "@/lib/binance-ws";
import type { OHLCV, Timeframe } from "@/types/market";

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

/* ── Trading Sessions (UTC hours) ── */
interface TradingSession {
  name: string;
  startHour: number;
  endHour: number;
  color: string;
  labelColor: string;
}

const SESSIONS: TradingSession[] = [
  { name: "ASIA", startHour: 0, endHour: 8, color: "rgba(59, 130, 246, 0.04)", labelColor: "rgba(59, 130, 246, 0.5)" },
  { name: "LONDON", startHour: 7, endHour: 16, color: "rgba(16, 185, 129, 0.04)", labelColor: "rgba(16, 185, 129, 0.5)" },
  { name: "NEW YORK", startHour: 13, endHour: 22, color: "rgba(245, 158, 11, 0.04)", labelColor: "rgba(245, 158, 11, 0.5)" },
];

const OVERLAP_COLOR = "rgba(168, 85, 247, 0.06)";

function getSessionForHour(hour: number): { sessions: string[]; isOverlap: boolean } {
  const active = SESSIONS.filter(s => {
    if (s.startHour < s.endHour) return hour >= s.startHour && hour < s.endHour;
    return hour >= s.startHour || hour < s.endHour;
  });
  return {
    sessions: active.map(s => s.name),
    isOverlap: active.length > 1,
  };
}

/* ── Accumulation Zone types ── */
interface AccZone {
  priceMin: number;
  priceMax: number;
  volume: number;
  type: "buy" | "sell";
  strength: number;
}

interface ZoneShift {
  zone: AccZone;
  direction: "new" | "growing" | "shrinking" | "gone";
  timestamp: number;
}

/* ── Zone computation helpers ── */
function clusterLevels(
  levels: { price: number; quantity: number }[],
  thresholdPct = 0.005
): { priceMin: number; priceMax: number; volume: number }[] {
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; volumes: number[] }[] = [];
  let current = { prices: [sorted[0].price], volumes: [sorted[0].quantity] };

  for (let i = 1; i < sorted.length; i++) {
    const dist = Math.abs(sorted[i].price - current.prices[current.prices.length - 1]) / sorted[i].price;
    if (dist < thresholdPct) {
      current.prices.push(sorted[i].price);
      current.volumes.push(sorted[i].quantity);
    } else {
      clusters.push(current);
      current = { prices: [sorted[i].price], volumes: [sorted[i].quantity] };
    }
  }
  clusters.push(current);

  return clusters.map((c) => ({
    priceMin: Math.min(...c.prices),
    priceMax: Math.max(...c.prices),
    volume: c.volumes.reduce((a, b) => a + b, 0),
  }));
}

function computeAccumulationZones(
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
      zones.push({ priceMin: c.priceMin, priceMax: c.priceMax, volume: c.volume, type: "buy", strength });
    }
  }

  for (const c of askClusters) {
    const strength = c.volume / maxVol;
    if (strength > 0.25) {
      zones.push({ priceMin: c.priceMin, priceMax: c.priceMax, volume: c.volume, type: "sell", strength });
    }
  }

  return zones;
}

function detectZoneShifts(prev: AccZone[], next: AccZone[]): ZoneShift[] {
  const shifts: ZoneShift[] = [];
  const now = Date.now();

  for (const nz of next) {
    const mid = (nz.priceMin + nz.priceMax) / 2;
    const match = prev.find((pz) => {
      const pMid = (pz.priceMin + pz.priceMax) / 2;
      return Math.abs(pMid - mid) / mid < 0.005 && pz.type === nz.type;
    });
    if (!match) {
      if (nz.strength > 0.4) shifts.push({ zone: nz, direction: "new", timestamp: now });
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

/* ── Component ── */
export default function PriceChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { activeSymbol, activeTimeframe, setActiveTimeframe, setCandles, candles, livePrices } = useMarketStore();
  const theme = useThemeStore((s) => s.theme);
  const [data, setData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredCandle, setHoveredCandle] = useState<OHLCV | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isLive, setIsLive] = useState(false);
  const [zones, setZones] = useState<AccZone[]>([]);
  const [zoneShifts, setZoneShifts] = useState<ZoneShift[]>([]);
  const [showSessions, setShowSessions] = useState(true);
  const prevZonesRef = useRef<AccZone[]>([]);

  // Candle pattern markers
  interface PatternMarker {
    timestamp: string;
    pattern: string;
    bias: string;      // bullish, bearish, neutral
    strength: number;
    type: string;       // reversal, continuation
  }
  const [patternMarkers, setPatternMarkers] = useState<PatternMarker[]>([]);

  // Zone tooltip state
  const [hoveredZone, setHoveredZone] = useState<AccZone | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Pan/drag state
  const [panOffset, setPanOffset] = useState(0); // positive = shifted right (viewing older data)
  const [zoomLevel, setZoomLevel] = useState(1); // 1x = 200 candles, 2x = 100, 0.5x = 400
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);

  // Touch state
  const touchStartX = useRef(0);
  const touchStartOffset = useRef(0);
  const pinchStartDist = useRef(0);
  const pinchStartZoom = useRef(1);
  const isTouching = useRef(false);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;
  const BASE_SLOTS = 200;

  const getViewSlots = useCallback(() => {
    return Math.round(BASE_SLOTS / zoomLevel);
  }, [zoomLevel]);

  // Store chart geometry for mouse hit-testing
  const chartGeomRef = useRef({
    paddingTop: 20, paddingLeft: 10, paddingRight: 70, priceAreaH: 0,
    priceMin: 0, priceMax: 0,
  });

  const livePrice = livePrices[activeSymbol]?.price;
  const cacheKey = `${activeSymbol}_${activeTimeframe}`;
  const canStream = isBinanceSymbol(activeSymbol);

  const isIntraday = ["1m", "5m", "15m", "1h", "4h"].includes(activeTimeframe);

  // Reset pan and zoom when symbol/timeframe changes
  useEffect(() => {
    setPanOffset(0);
    setZoomLevel(1);
  }, [activeSymbol, activeTimeframe]);

  // Fetch historical data
  useEffect(() => {
    const load = async () => {
      if (candles[cacheKey]) {
        setData(candles[cacheKey]);
        return;
      }
      setLoading(true);
      try {
        // Always trigger ingestion first to ensure data exists in DB
        await api.fetchPrices(activeSymbol, activeTimeframe, 2000);
        const prices = await api.prices(activeSymbol, activeTimeframe, 2000);
        const sorted = [...prices].reverse();
        setData(sorted);
        setCandles(cacheKey, sorted);
      } catch (err) {
        console.error("Failed to load prices:", err);
        // Try a smaller fetch as fallback
        try {
          await api.fetchPrices(activeSymbol, activeTimeframe, 500);
          const prices = await api.prices(activeSymbol, activeTimeframe, 500);
          const sorted = [...prices].reverse();
          setData(sorted);
          setCandles(cacheKey, sorted);
        } catch {
          // Data source may be unavailable
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSymbol, activeTimeframe, cacheKey]);

  // Real-time kline WebSocket subscription
  const gapRefetchDone = useRef(false);
  useEffect(() => {
    gapRefetchDone.current = false;
  }, [activeSymbol, activeTimeframe]);

  useEffect(() => {
    if (!canStream || data.length === 0) {
      setIsLive(false);
      return;
    }

    setIsLive(true);
    const intervalMs = getIntervalMs(activeTimeframe);

    binanceKlineWS.subscribe(activeSymbol, activeTimeframe, (_symbol: string, candle: LiveCandle) => {
      setData((prev) => {
        if (prev.length === 0) return prev;

        const lastCandle = prev[prev.length - 1];
        const lastTs = new Date(lastCandle.timestamp).getTime();
        const candleTs = candle.timestamp;
        const gap = candleTs - lastTs;

        // Same candle — update in place
        if (Math.abs(gap) < intervalMs * 0.9) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...lastCandle,
            high: Math.max(lastCandle.high, candle.high),
            low: Math.min(lastCandle.low, candle.low),
            close: candle.close,
            volume: candle.volume,
          };
          return updated;
        }

        // Gap detected — re-fetch historical data to fill it (once)
        if (gap > intervalMs * 2 && !gapRefetchDone.current) {
          gapRefetchDone.current = true;
          // Async re-fetch in background to fill the gap
          (async () => {
            try {
              await api.fetchPrices(activeSymbol, activeTimeframe, 200);
              const prices = await api.prices(activeSymbol, activeTimeframe, 200);
              const sorted = [...prices].reverse();
              setData(sorted);
            } catch { /* ignore */ }
          })();
          // Still append live candle for now
        }

        // Next candle — append
        if (candleTs > lastTs) {
          const newCandle: OHLCV = {
            timestamp: new Date(candleTs).toISOString(),
            open: candle.open, high: candle.high, low: candle.low,
            close: candle.close, volume: candle.volume,
          };
          return [...prev.slice(-499), newCandle];
        }

        return prev;
      });
    });

    return () => {
      binanceKlineWS.close();
      setIsLive(false);
    };
  }, [canStream, activeSymbol, activeTimeframe, data.length > 0]);

  // Fetch all candle pattern markers from dedicated patterns endpoint
  useEffect(() => {
    if (data.length < 30) {
      setPatternMarkers([]);
      return;
    }
    const fetchPatterns = async () => {
      try {
        const result = await api.patternHistory(activeSymbol, activeTimeframe, Math.min(data.length, 500));
        if (result?.patterns?.length > 0) {
          const markers: PatternMarker[] = result.patterns
            .filter((p: any) => p.strength >= 0.6)
            .map((p: any) => ({
              timestamp: p.timestamp,
              pattern: p.pattern,
              bias: p.bias,
              strength: p.strength,
              type: p.type,
            }));
          setPatternMarkers(markers);
        } else {
          setPatternMarkers([]);
        }
      } catch {
        setPatternMarkers([]);
      }
    };
    fetchPatterns();
  }, [data.length, activeSymbol, activeTimeframe]);

  // Fetch accumulation zones from order book (crypto symbols only)
  useEffect(() => {
    const crypto = activeSymbol.endsWith("USDT") || activeSymbol.endsWith("USDC") || activeSymbol.endsWith("BTC");
    if (!crypto) {
      setZones([]);
      return;
    }

    const fetchZones = async () => {
      try {
        const ob = await api.orderBook(activeSymbol, 500);
        const bids = (ob.bids || []).map((b: any) => ({ price: b.price, quantity: b.quantity }));
        const asks = (ob.asks || []).map((a: any) => ({ price: a.price, quantity: a.quantity }));
        const newZones = computeAccumulationZones(bids, asks);

        if (prevZonesRef.current.length > 0) {
          const shifts = detectZoneShifts(prevZonesRef.current, newZones);
          if (shifts.length > 0) {
            setZoneShifts((prev) => [...prev, ...shifts].slice(-20));
          }
        }

        prevZonesRef.current = newZones;
        setZones(newZones);
      } catch {
        // Order book not available
      }
    };

    fetchZones();
    const interval = setInterval(fetchZones, 60000);
    return () => clearInterval(interval);
  }, [activeSymbol]);

  // Clean up old zone shifts (fade after 30s)
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 30000;
      setZoneShifts((prev) => prev.filter((s) => s.timestamp > cutoff));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw chart
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0 || dimensions.width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tc = THEME_CANVAS[theme];

    // Compute visible slice based on pan offset
    // panOffset > 0 = viewing older data, panOffset < 0 = empty space on right
    const VIEW_SLOTS = getViewSlots();
    const MIN_OFFSET = -Math.round(VIEW_SLOTS * 0.3); // allow 30% empty space on right
    const maxOffset = Math.max(0, data.length - VIEW_SLOTS);
    const clampedOffset = Math.max(MIN_OFFSET, Math.min(panOffset, maxOffset));
    const emptyRight = clampedOffset < 0 ? -clampedOffset : 0;
    const dataSlots = VIEW_SLOTS - emptyRight;
    const effectiveOffset = Math.max(0, clampedOffset);
    const startIdx = Math.max(0, data.length - dataSlots - effectiveOffset);
    const endIdx = startIdx + dataSlots;
    const visibleData = data.slice(startIdx, Math.min(endIdx, data.length));

    if (visibleData.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = dimensions.width;
    const H = dimensions.height;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, W, H);

    const PADDING = { top: 20, right: 70, bottom: 50, left: 10 };
    const chartW = W - PADDING.left - PADDING.right;
    const priceAreaH = (H - PADDING.top - PADDING.bottom) * 0.75;
    const volumeAreaH = (H - PADDING.top - PADDING.bottom) * 0.2;
    const volumeTop = PADDING.top + priceAreaH + 10;

    const allHighs = visibleData.map((d) => d.high);
    const allLows = visibleData.map((d) => d.low);
    const allVols = visibleData.map((d) => d.volume);
    const priceMin = Math.min(...allLows) * 0.999;
    const priceMax = Math.max(...allHighs) * 1.001;
    const volMax = Math.max(...allVols) * 1.1;

    // Each slot has fixed width; candles are drawn from left, empty space on right
    const candleW = chartW / VIEW_SLOTS;
    const bodyW = Math.max(1, candleW * 0.6);

    const priceToY = (p: number) =>
      PADDING.top + priceAreaH - ((p - priceMin) / (priceMax - priceMin)) * priceAreaH;
    const volToH = (v: number) => (v / volMax) * volumeAreaH;

    // Store geometry for hit-testing
    chartGeomRef.current = {
      paddingTop: PADDING.top, paddingLeft: PADDING.left,
      paddingRight: PADDING.right, priceAreaH, priceMin, priceMax,
    };

    // ── Draw trading session bands (behind everything) ──
    if (showSessions && isIntraday) {
      // Group consecutive candles by session
      let currentSessionKey = "";
      let bandStart = -1;

      for (let i = 0; i <= visibleData.length; i++) {
        let sessionKey = "";
        let sessionColor = "";
        let sessionLabel = "";

        if (i < visibleData.length) {
          const d = new Date(visibleData[i].timestamp);
          const hour = d.getUTCHours();
          const info = getSessionForHour(hour);

          if (info.isOverlap) {
            sessionKey = "OVERLAP";
            sessionColor = OVERLAP_COLOR;
            sessionLabel = "OVERLAP";
          } else if (info.sessions.length > 0) {
            const sess = SESSIONS.find(s => s.name === info.sessions[0]);
            sessionKey = info.sessions[0];
            sessionColor = sess?.color || "";
            sessionLabel = sess?.name || "";
          }
        }

        if (sessionKey !== currentSessionKey || i === visibleData.length) {
          // Draw previous band
          if (bandStart >= 0 && currentSessionKey) {
            const x1 = PADDING.left + candleW * bandStart;
            const x2 = PADDING.left + candleW * i;
            const bandW = x2 - x1;

            // Background fill for entire chart height
            let bgColor = "";
            if (currentSessionKey === "OVERLAP") {
              bgColor = OVERLAP_COLOR;
            } else {
              const sess = SESSIONS.find(s => s.name === currentSessionKey);
              bgColor = sess?.color || "";
            }

            if (bgColor) {
              ctx.fillStyle = bgColor;
              ctx.fillRect(x1, PADDING.top, bandW, priceAreaH + volumeAreaH + 10);
            }

            // Session label at top
            const labelSess = currentSessionKey === "OVERLAP"
              ? null
              : SESSIONS.find(s => s.name === currentSessionKey);
            const labelColor = currentSessionKey === "OVERLAP"
              ? "rgba(168, 85, 247, 0.45)"
              : (labelSess?.labelColor || "rgba(100,100,100,0.4)");

            ctx.font = "bold 8px JetBrains Mono, monospace";
            ctx.fillStyle = labelColor;
            ctx.textAlign = "center";
            const labelX = x1 + bandW / 2;
            if (bandW > 30) {
              ctx.fillText(
                currentSessionKey === "OVERLAP" ? "L/NY" : currentSessionKey,
                labelX, PADDING.top + 10
              );
            }

            // Vertical separator line
            ctx.strokeStyle = labelColor;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(x1, PADDING.top);
            ctx.lineTo(x1, PADDING.top + priceAreaH);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          bandStart = i;
          currentSessionKey = sessionKey;
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      const y = PADDING.top + (priceAreaH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(W - PADDING.right, y);
      ctx.stroke();

      const price = priceMax - ((priceMax - priceMin) / 4) * i;
      ctx.fillStyle = tc.textMuted;
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.fillText(formatPrice(price, activeSymbol), W - PADDING.right + 5, y + 3);
    }

    // ── Draw accumulation zones (behind candles) ──
    const lastPrice = visibleData.length > 0 ? visibleData[visibleData.length - 1].close : 0;
    for (const zone of zones) {
      const yTop = priceToY(zone.priceMax);
      const yBot = priceToY(zone.priceMin);
      // Ensure minimum visible height of 4px
      const rawH = yBot - yTop;
      const zoneH = Math.max(4, rawH);
      const yCenter = (yTop + yBot) / 2;
      const drawYTop = yCenter - zoneH / 2;

      if (drawYTop > PADDING.top + priceAreaH || drawYTop + zoneH < PADDING.top) continue;

      const alpha = 0.08 + zone.strength * 0.15;
      const zRgb = zone.type === "buy" ? tc.zonesBuy : tc.zonesSell;
      ctx.fillStyle = `rgba(${zRgb[0]}, ${zRgb[1]}, ${zRgb[2]}, ${alpha})`;

      ctx.fillRect(PADDING.left, drawYTop, chartW, zoneH);

      // Zone edge line
      const edgeAlpha = 0.2 + zone.strength * 0.3;
      ctx.strokeStyle = `rgba(${zRgb[0]}, ${zRgb[1]}, ${zRgb[2]}, ${edgeAlpha})`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, yCenter);
      ctx.lineTo(W - PADDING.right, yCenter);
      ctx.stroke();
      ctx.setLineDash([]);

      // Zone label — show for strong zones, offset buy labels down and sell labels up
      if (zone.strength > 0.4) {
        const label = zone.type === "buy" ? "BUY WALL" : "SELL WALL";
        ctx.font = "bold 8px JetBrains Mono, monospace";
        const labelAlpha = 0.5 + zone.strength * 0.4;
        ctx.fillStyle = `rgba(${zRgb[0]}, ${zRgb[1]}, ${zRgb[2]}, ${labelAlpha})`;
        ctx.textAlign = "left";
        // Position label slightly away from center to avoid overlap with price line
        const labelY = zone.type === "buy" ? yCenter + 10 : yCenter - 4;
        ctx.fillText(label, PADDING.left + 4, labelY);
      }
    }

    // ── Draw zone shift markers ──
    const now = Date.now();
    for (const shift of zoneShifts) {
      const age = now - shift.timestamp;
      if (age > 30000) continue;
      const fade = 1 - age / 30000;

      const midPrice = (shift.zone.priceMin + shift.zone.priceMax) / 2;
      const y = priceToY(midPrice);
      if (y < PADDING.top || y > PADDING.top + priceAreaH) continue;

      let marker = "";
      let color = "";
      const sn = tc.shiftNew, sg = tc.shiftGrowing, ss = tc.shiftShrinking, sgo = tc.shiftGone;
      if (shift.direction === "new") {
        marker = "NEW"; color = `rgba(${sn[0]}, ${sn[1]}, ${sn[2]}, ${fade})`;
      } else if (shift.direction === "growing") {
        marker = shift.zone.type === "buy" ? "++BUY" : "++SELL";
        color = `rgba(${sg[0]}, ${sg[1]}, ${sg[2]}, ${fade})`;
      } else if (shift.direction === "shrinking") {
        marker = "WEAK"; color = `rgba(${ss[0]}, ${ss[1]}, ${ss[2]}, ${fade})`;
      } else if (shift.direction === "gone") {
        marker = "GONE"; color = `rgba(${sgo[0]}, ${sgo[1]}, ${sgo[2]}, ${fade * 0.7})`;
      }

      if (marker) {
        ctx.font = "bold 9px JetBrains Mono, monospace";
        ctx.fillStyle = color;
        ctx.textAlign = "right";
        ctx.fillText(marker, W - PADDING.right - 4, y + 3);

        ctx.beginPath();
        ctx.arc(W - PADDING.right - ctx.measureText(marker).width - 8, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Candlesticks ──
    visibleData.forEach((candle, i) => {
      const x = PADDING.left + candleW * i + candleW / 2;
      const isBull = candle.close >= candle.open;
      const color = isBull ? tc.bull : tc.bear;

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, priceToY(candle.high));
      ctx.lineTo(x, priceToY(candle.low));
      ctx.stroke();

      // Body
      const bodyTop = priceToY(Math.max(candle.open, candle.close));
      const bodyBot = priceToY(Math.min(candle.open, candle.close));
      const bodyH = Math.max(1, bodyBot - bodyTop);

      ctx.fillStyle = color;
      if (isBull) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      } else {
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      }

      // Volume bar
      const vH = volToH(candle.volume);
      ctx.fillStyle = isBull ? tc.bullAlpha : tc.bearAlpha;
      ctx.fillRect(x - bodyW / 2, volumeTop + volumeAreaH - vH, bodyW, vH);
    });

    // ── Candle Pattern Markers (enhanced with pill labels + strength glow) ──
    if (patternMarkers.length > 0) {
      // Build timestamp lookup for fast matching
      const patternMap = new Map<number, PatternMarker>();
      patternMarkers.forEach((m) => patternMap.set(new Date(m.timestamp).getTime(), m));

      visibleData.forEach((candle, i) => {
        const match = patternMap.get(new Date(candle.timestamp).getTime());
        if (!match) return;
        const x = PADDING.left + candleW * i + candleW / 2;
        const markerSize = Math.max(5, Math.min(10, candleW * 0.5));
        const alpha = 0.6 + match.strength * 0.4; // stronger = more opaque
        const isReversal = match.type === "reversal";
        const fontSize = Math.max(7, Math.min(9, candleW * 0.35));

        if (match.bias === "bullish") {
          const y = priceToY(candle.low) + 8;
          // Arrow up triangle
          ctx.globalAlpha = alpha;
          ctx.fillStyle = tc.patternBull;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - markerSize * 0.6, y + markerSize * 1.2);
          ctx.lineTo(x + markerSize * 0.6, y + markerSize * 1.2);
          ctx.closePath();
          ctx.fill();
          // Reversal patterns get a glow ring
          if (isReversal && match.strength >= 0.8) {
            ctx.strokeStyle = tc.patternBull;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(x, y + markerSize * 0.6, markerSize * 1.2, 0, Math.PI * 2);
            ctx.stroke();
          }
          // Pill label with background
          ctx.globalAlpha = alpha;
          const label = match.pattern.replace(/_/g, " ").toUpperCase();
          ctx.font = `bold ${fontSize}px JetBrains Mono, monospace`;
          ctx.textAlign = "center";
          const textW = ctx.measureText(label).width;
          const pillY = y + markerSize * 1.2 + 4;
          ctx.fillStyle = tc.patternBull;
          ctx.globalAlpha = 0.15;
          ctx.beginPath();
          ctx.roundRect(x - textW / 2 - 3, pillY, textW + 6, fontSize + 4, 3);
          ctx.fill();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = tc.patternBull;
          ctx.fillText(label, x, pillY + fontSize + 1);
        } else if (match.bias === "bearish") {
          const y = priceToY(candle.high) - 8;
          // Arrow down triangle
          ctx.globalAlpha = alpha;
          ctx.fillStyle = tc.patternBear;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - markerSize * 0.6, y - markerSize * 1.2);
          ctx.lineTo(x + markerSize * 0.6, y - markerSize * 1.2);
          ctx.closePath();
          ctx.fill();
          // Reversal glow
          if (isReversal && match.strength >= 0.8) {
            ctx.strokeStyle = tc.patternBear;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(x, y - markerSize * 0.6, markerSize * 1.2, 0, Math.PI * 2);
            ctx.stroke();
          }
          // Pill label
          ctx.globalAlpha = alpha;
          const label = match.pattern.replace(/_/g, " ").toUpperCase();
          ctx.font = `bold ${fontSize}px JetBrains Mono, monospace`;
          ctx.textAlign = "center";
          const textW = ctx.measureText(label).width;
          const pillY = y - markerSize * 1.2 - fontSize - 8;
          ctx.fillStyle = tc.patternBear;
          ctx.globalAlpha = 0.15;
          ctx.beginPath();
          ctx.roundRect(x - textW / 2 - 3, pillY, textW + 6, fontSize + 4, 3);
          ctx.fill();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = tc.patternBear;
          ctx.fillText(label, x, pillY + fontSize + 1);
        } else {
          // Amber diamond for neutral (doji)
          const y = priceToY(candle.high) - 12;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = tc.patternNeutral;
          ctx.beginPath();
          ctx.moveTo(x, y - markerSize);
          ctx.lineTo(x + markerSize * 0.6, y);
          ctx.lineTo(x, y + markerSize);
          ctx.lineTo(x - markerSize * 0.6, y);
          ctx.closePath();
          ctx.fill();
          // Label
          ctx.font = `bold ${fontSize}px JetBrains Mono, monospace`;
          ctx.textAlign = "center";
          ctx.fillText("DOJI", x, y - markerSize - 4);
        }
        ctx.globalAlpha = 1; // reset
      });
    }

    // Date labels
    const labelInterval = Math.max(1, Math.floor(visibleData.length / 6));
    ctx.fillStyle = tc.textMuted;
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    visibleData.forEach((candle, i) => {
      if (i % labelInterval === 0) {
        const x = PADDING.left + candleW * i + candleW / 2;
        const d = new Date(candle.timestamp);
        const label =
          activeTimeframe === "1d" || activeTimeframe === "1w"
            ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
        ctx.fillText(label, x, H - PADDING.bottom + 20);
      }
    });

    // Current price line
    if (visibleData.length > 0) {
      const lastCandle = visibleData[visibleData.length - 1];
      const lastPrice = livePrice ?? lastCandle.close;
      const y = priceToY(lastPrice);
      const isBull = lastPrice >= lastCandle.open;

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isBull ? tc.bull : tc.bear;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(W - PADDING.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isBull ? tc.bull : tc.bear;
      ctx.fillRect(W - PADDING.right, y - 10, PADDING.right - 2, 20);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.fillText(formatPrice(lastPrice, activeSymbol), W - PADDING.right + 4, y + 4);
    }
  }, [data, dimensions, activeSymbol, activeTimeframe, livePrice, zones, zoneShifts, showSessions, isIntraday, panOffset, getViewSlots, patternMarkers, theme]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Compute visible data for hover hit-testing (same logic as draw)
  const getVisibleData = useCallback(() => {
    const VIEW_SLOTS = getViewSlots();
    const MIN_OFFSET = -Math.round(VIEW_SLOTS * 0.3);
    const maxOffset = Math.max(0, data.length - VIEW_SLOTS);
    const clampedOffset = Math.max(MIN_OFFSET, Math.min(panOffset, maxOffset));
    const emptyRight = clampedOffset < 0 ? -clampedOffset : 0;
    const dataSlots = VIEW_SLOTS - emptyRight;
    const effectiveOffset = Math.max(0, clampedOffset);
    const startIdx = Math.max(0, data.length - dataSlots - effectiveOffset);
    const endIdx = startIdx + dataSlots;
    return data.slice(startIdx, Math.min(endIdx, data.length));
  }, [data, panOffset, getViewSlots]);

  // Mouse drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartOffset.current = panOffset;
    if (containerRef.current) containerRef.current.style.cursor = "grabbing";
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || data.length === 0) return;

    // Handle dragging
    if (isDragging.current) {
      const dx = e.clientX - dragStartX.current;
      const geom = chartGeomRef.current;
      const chartW = dimensions.width - geom.paddingLeft - geom.paddingRight;
      const VIEW_SLOTS = getViewSlots();
      const candleW = chartW / VIEW_SLOTS;
      const candleShift = Math.round(dx / candleW);
      const MIN_OFFSET = -Math.round(VIEW_SLOTS * 0.3);
      const maxOffset = Math.max(0, data.length - VIEW_SLOTS);
      const newOffset = Math.max(MIN_OFFSET, Math.min(dragStartOffset.current + candleShift, maxOffset));
      setPanOffset(newOffset);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const geom = chartGeomRef.current;
    const visibleData = getVisibleData();
    const chartW = dimensions.width - geom.paddingLeft - geom.paddingRight;
    const candleW = chartW / Math.max(visibleData.length, 1);

    // Candle hover
    const idx = Math.floor((x - geom.paddingLeft) / candleW);
    if (idx >= 0 && idx < visibleData.length) {
      setHoveredCandle(visibleData[idx]);
    }

    // Zone hover — check if mouse Y falls within any zone
    if (zones.length > 0 && geom.priceAreaH > 0) {
      const yToPrice = (yPos: number) =>
        geom.priceMax - ((yPos - geom.paddingTop) / geom.priceAreaH) * (geom.priceMax - geom.priceMin);

      const mousePrice = yToPrice(y);
      const hit = zones.find(z => mousePrice >= z.priceMin && mousePrice <= z.priceMax);

      if (hit) {
        setHoveredZone(hit);
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setHoveredZone(null);
      }
    } else {
      setHoveredZone(null);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    if (containerRef.current) containerRef.current.style.cursor = "crosshair";
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
    if (containerRef.current) containerRef.current.style.cursor = "crosshair";
    setHoveredCandle(null);
    setHoveredZone(null);
  };

  // Scroll wheel: plain = pan, Ctrl/Cmd = zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom: scroll up = zoom in, scroll down = zoom out
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoomLevel((prev) => {
        const next = Math.round((prev + delta) * 100) / 100;
        return Math.max(ZOOM_MIN, Math.min(next, ZOOM_MAX));
      });
      return;
    }

    // Pan
    const VIEW_SLOTS = getViewSlots();
    const MIN_OFFSET = -Math.round(VIEW_SLOTS * 0.3);
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    const shift = delta > 0 ? -3 : 3;
    const maxOffset = Math.max(0, data.length - VIEW_SLOTS);
    setPanOffset((prev) => Math.max(MIN_OFFSET, Math.min(prev + shift, maxOffset)));
  };

  // Touch handlers for mobile pinch-zoom and pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single finger — pan
      isTouching.current = true;
      touchStartX.current = e.touches[0].clientX;
      touchStartOffset.current = panOffset;
    } else if (e.touches.length === 2) {
      // Two fingers — pinch zoom
      isTouching.current = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartZoom.current = zoomLevel;
    }
  }, [panOffset, zoomLevel]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && isTouching.current) {
      // Pan
      const dx = e.touches[0].clientX - touchStartX.current;
      const geom = chartGeomRef.current;
      const chartW = dimensions.width - geom.paddingLeft - geom.paddingRight;
      const VIEW_SLOTS = getViewSlots();
      const candleW = chartW / VIEW_SLOTS;
      const candleShift = Math.round(dx / candleW);
      const MIN_OFFSET = -Math.round(VIEW_SLOTS * 0.3);
      const maxOffset = Math.max(0, data.length - VIEW_SLOTS);
      const newOffset = Math.max(MIN_OFFSET, Math.min(touchStartOffset.current + candleShift, maxOffset));
      setPanOffset(newOffset);
    } else if (e.touches.length === 2 && pinchStartDist.current > 0) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchStartDist.current;
      const newZoom = Math.round(pinchStartZoom.current * scale * 100) / 100;
      setZoomLevel(Math.max(ZOOM_MIN, Math.min(newZoom, ZOOM_MAX)));
    }
  }, [dimensions.width, getViewSlots, data.length, ZOOM_MIN, ZOOM_MAX]);

  const handleTouchEnd = useCallback(() => {
    isTouching.current = false;
    pinchStartDist.current = 0;
  }, []);

  const buyZoneCount = zones.filter((z) => z.type === "buy").length;
  const sellZoneCount = zones.filter((z) => z.type === "sell").length;

  return (
    <div className="card-glass rounded-lg flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-sm md:text-base font-mono font-bold text-[var(--color-text-primary)]">
            {activeSymbol}
          </span>
          {isLive && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-bull)] animate-pulse" />
              <span className="text-[10px] font-mono text-[var(--color-bull)] uppercase">Live</span>
            </span>
          )}
          {zones.length > 0 && (
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
              <span className="text-[var(--color-bull)]">{buyZoneCount}B</span>
              {" / "}
              <span className="text-[var(--color-bear)]">{sellZoneCount}S</span>
              {" zones"}
            </span>
          )}
          {hoveredCandle && (
            <div className="hidden md:flex items-center gap-3 text-[12px] font-mono">
              <span className="text-[var(--color-text-muted)]">
                O <span className="text-[var(--color-text-primary)]">{formatPrice(hoveredCandle.open, activeSymbol)}</span>
              </span>
              <span className="text-[var(--color-text-muted)]">
                H <span className="text-[var(--color-bull)]">{formatPrice(hoveredCandle.high, activeSymbol)}</span>
              </span>
              <span className="text-[var(--color-text-muted)]">
                L <span className="text-[var(--color-bear)]">{formatPrice(hoveredCandle.low, activeSymbol)}</span>
              </span>
              <span className="text-[var(--color-text-muted)]">
                C <span className="text-[var(--color-text-primary)]">{formatPrice(hoveredCandle.close, activeSymbol)}</span>
              </span>
              <span className="text-[var(--color-text-muted)]">
                V <span className="text-[var(--color-neon-cyan)]">{formatVolume(hoveredCandle.volume)}</span>
              </span>
            </div>
          )}
        </div>
        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Sessions toggle */}
          {isIntraday && (
            <button
              onClick={() => setShowSessions(!showSessions)}
              className={`
                px-2 py-1 text-[11px] font-mono rounded transition-all border min-h-[32px]
                ${showSessions
                  ? "border-[var(--color-neon-purple)]/30 text-[var(--color-neon-purple)] bg-[var(--color-neon-purple)]/10"
                  : "border-[var(--color-border-primary)] text-[var(--color-text-muted)]"
                }
              `}
            >
              Sessions
            </button>
          )}
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 mr-1">
            <button
              onClick={() => setZoomLevel((prev) => Math.max(ZOOM_MIN, Math.round((prev - 0.25) * 100) / 100))}
              className="px-2 py-1 text-sm font-mono rounded transition-all text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] min-w-[32px] min-h-[32px] flex items-center justify-center"
              title="Zoom out"
            >
              −
            </button>
            <span className="text-[11px] font-mono text-[var(--color-text-muted)] min-w-[32px] text-center tabular-nums">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              onClick={() => setZoomLevel((prev) => Math.min(ZOOM_MAX, Math.round((prev + 0.25) * 100) / 100))}
              className="px-2 py-1 text-sm font-mono rounded transition-all text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] min-w-[32px] min-h-[32px] flex items-center justify-center"
              title="Zoom in"
            >
              +
            </button>
          </div>
          {/* Timeframe selector */}
          <div className="flex items-center gap-0.5 md:gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setActiveTimeframe(tf.value)}
                className={`
                  px-2 py-1 text-xs md:text-sm font-mono rounded transition-all min-w-[32px] min-h-[32px] flex items-center justify-center
                  ${tf.value === "1m" ? "hidden sm:flex" : ""}
                  ${
                    activeTimeframe === tf.value
                      ? "bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }
                `}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div
        ref={containerRef}
        className="flex-1 relative min-h-0 touch-none"
        style={{ cursor: "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-sm text-[var(--color-text-muted)] animate-pulse">
              Loading {activeSymbol}...
            </div>
          </div>
        ) : (
          <canvas ref={canvasRef} className="absolute inset-0" />
        )}

        {/* Zone hover tooltip */}
        {hoveredZone && (
          <div
            className="absolute z-50 pointer-events-none"
            style={{
              left: Math.min(tooltipPos.x + 12, dimensions.width - 180),
              top: Math.max(tooltipPos.y - 80, 4),
            }}
          >
            <div className="rounded-lg border shadow-xl backdrop-blur-md px-3 py-2 min-w-[160px]"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-bg-card) 92%, transparent)",
                borderColor: hoveredZone.type === "buy"
                  ? "color-mix(in srgb, var(--color-bull) 30%, transparent)"
                  : "color-mix(in srgb, var(--color-bear) 30%, transparent)",
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-[var(--color-border-primary)]">
                <div className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: hoveredZone.type === "buy" ? "var(--color-bull)" : "var(--color-bear)" }}
                />
                <span className="text-[10px] font-mono font-bold"
                  style={{ color: hoveredZone.type === "buy" ? "var(--color-bull)" : "var(--color-bear)" }}
                >
                  {hoveredZone.type === "buy" ? "BUY ZONE" : "SELL ZONE"}
                </span>
                <span className="text-[8px] font-mono text-[var(--color-text-secondary)] ml-auto">
                  {(hoveredZone.strength * 100).toFixed(0)}% str
                </span>
              </div>

              {/* Price range */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-[var(--color-text-secondary)]">Range</span>
                  <span className="text-[var(--color-text-primary)]">
                    {formatPrice(hoveredZone.priceMin, activeSymbol)} – {formatPrice(hoveredZone.priceMax, activeSymbol)}
                  </span>
                </div>

                {/* Accumulated volume */}
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-[var(--color-text-secondary)]">
                    {hoveredZone.type === "buy" ? "Acc. Buy Vol" : "Acc. Sell Vol"}
                  </span>
                  <span className="font-bold"
                    style={{ color: hoveredZone.type === "buy" ? "var(--color-bull)" : "var(--color-bear)" }}
                  >
                    {formatVolume(hoveredZone.volume)}
                  </span>
                </div>

                {/* Strength bar */}
                <div className="mt-1 flex items-center gap-1">
                  <div className="flex-1 h-1 rounded-full bg-[rgba(100,116,139,0.2)] overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${hoveredZone.strength * 100}%`,
                        backgroundColor: hoveredZone.type === "buy" ? "var(--color-bull)" : "var(--color-bear)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */
function getIntervalMs(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
    "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000,
  };
  return map[tf] || 86_400_000;
}
