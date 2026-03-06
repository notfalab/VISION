"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Player } from "@remotion/player";
import { useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Sequence } from "remotion";
import {
  Activity,
  BarChart3,
  Brain,
  TrendingUp,
  Shield,
  Zap,
  Eye,
  Target,
  Layers,
  LineChart,
  Gauge,
  Globe,
  Newspaper,
  Calendar,
  Flame,
  BookOpen,
  ArrowRight,
  Check,
  Sparkles,
  Waves,
  Crosshair,
  ScanLine,
  Radio,
  GitBranch,
  AreaChart,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   VISION Landing Page — Premium Edition
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Scroll reveal hook (multi-type) ─────────────────────────────────── */
type RevealType = "fade-up" | "fade-down" | "fade-left" | "fade-right" | "scale-up" | "blur-in";

function useScrollReveal(type: RevealType = "fade-up", delay = 0) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--reveal-delay", `${delay}ms`);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, type]);
  return ref;
}

function RevealSection({
  children,
  type = "fade-up",
  delay = 0,
  className = "",
  stagger = false,
}: {
  children: React.ReactNode;
  type?: RevealType;
  delay?: number;
  className?: string;
  stagger?: boolean;
}) {
  const ref = useScrollReveal(type, delay);
  return (
    <div ref={ref} className={`reveal reveal-${type} ${stagger ? "stagger-children" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ── Count-up hook ──────────────────────────────────────────────────── */
function useCountUp(target: number, duration = 1400) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !done.current) {
          done.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
            el.textContent = String(Math.round(eased * target));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);
  return ref;
}

/* ── Card tilt 3D ───────────────────────────────────────────────────── */
function handleTilt(e: React.MouseEvent<HTMLDivElement>) {
  const c = e.currentTarget;
  const r = c.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
  const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  c.style.transform = `perspective(800px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg) translateY(-6px)`;
}
function resetTilt(e: React.MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.transform = "";
}

/* ── Magnetic button ────────────────────────────────────────────────── */
function handleMagnet(e: React.MouseEvent<HTMLElement>) {
  const b = e.currentTarget;
  const r = b.getBoundingClientRect();
  const x = e.clientX - r.left - r.width / 2;
  const y = e.clientY - r.top - r.height / 2;
  b.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
}
function resetMagnet(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.style.transform = "";
}

/* ── Ripple click ───────────────────────────────────────────────────── */
function createRipple(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const s = document.createElement("span");
  s.className = "ripple-dot";
  s.style.left = `${e.clientX - r.left}px`;
  s.style.top = `${e.clientY - r.top}px`;
  el.appendChild(s);
  setTimeout(() => s.remove(), 700);
}

/* ═══════════════════════════════════════════════════════════════════════
   REMOTION COMPOSITIONS
   ═══════════════════════════════════════════════════════════════════════ */

/* ── 1. Hero Particle Grid ──────────────────────────────────────────── */
const PARTICLE_COUNT = 50;
const PARTICLE_SEED = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  x: (i * 37.7 + 13) % 100,
  y: (i * 23.1 + 7) % 100,
  size: 1.5 + (i % 4) * 0.8,
  speed: 0.3 + (i % 5) * 0.15,
  phase: (i * 1.618) % 6.28,
}));

const CONNECTION_PAIRS: [number, number][] = [];
for (let i = 0; i < PARTICLE_COUNT; i++) {
  for (let j = i + 1; j < PARTICLE_COUNT; j++) {
    const dx = PARTICLE_SEED[i].x - PARTICLE_SEED[j].x;
    const dy = PARTICLE_SEED[i].y - PARTICLE_SEED[j].y;
    if (Math.sqrt(dx * dx + dy * dy) < 18) CONNECTION_PAIRS.push([i, j]);
  }
}

function HeroParticles() {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;

  const particles = PARTICLE_SEED.map((p, i) => {
    const px = p.x + Math.sin(t * p.speed + p.phase) * 3;
    const py = p.y + Math.cos(t * p.speed * 0.7 + p.phase) * 2.5;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.5 + p.phase);
    return { x: (px / 100) * width, y: (py / 100) * height, size: p.size, pulse };
  });

  return (
    <AbsoluteFill style={{ background: "transparent" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Connection lines */}
        {CONNECTION_PAIRS.map(([a, b], i) => {
          const pa = particles[a];
          const pb = particles[b];
          const dist = Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2);
          const maxDist = width * 0.18;
          if (dist > maxDist) return null;
          const opacity = interpolate(dist, [0, maxDist], [0.25, 0], { extrapolateRight: "clamp" });
          return (
            <line
              key={`l-${i}`}
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke="rgba(139,92,246,1)"
              strokeWidth={0.5}
              opacity={opacity * (0.6 + 0.4 * pa.pulse)}
            />
          );
        })}
        {/* Particles */}
        {particles.map((p, i) => (
          <g key={`p-${i}`}>
            <circle cx={p.x} cy={p.y} r={p.size + p.pulse * 1.5} fill="rgba(139,92,246,0.08)" />
            <circle cx={p.x} cy={p.y} r={p.size} fill={`rgba(167,139,250,${0.4 + p.pulse * 0.4})`} />
          </g>
        ))}
        {/* Pulsing focal nodes */}
        {[0, 12, 27, 38].map((idx) => {
          const p = particles[idx];
          const ring = interpolate(frame % 90, [0, 90], [0, 20]);
          const ringOp = interpolate(frame % 90, [0, 90], [0.3, 0]);
          return (
            <g key={`node-${idx}`}>
              <circle cx={p.x} cy={p.y} r={ring} fill="none" stroke="rgba(139,92,246,1)" strokeWidth={0.5} opacity={ringOp} />
              <circle cx={p.x} cy={p.y} r={3} fill="rgba(167,139,250,0.9)" />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
}

/* ── 2. Dashboard Mockup Animation ──────────────────────────────────── */
function DashboardMockup() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const candleIn = (i: number) => spring({ frame: frame - i * 2, fps, config: { damping: 15 } });
  const overlayIn = spring({ frame: frame - 40, fps, config: { damping: 12 } });
  const zoneIn = spring({ frame: frame - 60, fps, config: { damping: 12 } });
  const scoreIn = spring({ frame: frame - 80, fps, config: { damping: 12 } });
  const narratorIn = spring({ frame: frame - 100, fps, config: { damping: 12 } });

  // Generate candlestick data
  const candles = Array.from({ length: 24 }, (_, i) => {
    const base = 50 + Math.sin(i * 0.4) * 15 + Math.sin(i * 0.15) * 10;
    const open = base + (i % 3 - 1) * 3;
    const close = base + ((i + 1) % 3 - 1) * 3;
    const high = Math.max(open, close) + 2 + (i % 4);
    const low = Math.min(open, close) - 2 - (i % 3);
    return { open, close, high, low, bull: close > open };
  });

  const chartX = width * 0.05;
  const chartW = width * 0.6;
  const chartY = height * 0.12;
  const chartH = height * 0.7;
  const barW = chartW / candles.length;

  const mapY = (v: number) => chartY + chartH - ((v - 20) / 60) * chartH;

  return (
    <AbsoluteFill style={{ background: "transparent" }}>
      {/* Dashboard frame */}
      <div style={{
        position: "absolute", inset: 12, borderRadius: 12,
        border: "1px solid rgba(139,92,246,0.15)",
        background: "linear-gradient(135deg, rgba(6,0,16,0.9), rgba(10,0,20,0.9))",
        overflow: "hidden",
      }}>
        {/* Top bar */}
        <div style={{
          height: 32, borderBottom: "1px solid rgba(139,92,246,0.1)",
          display: "flex", alignItems: "center", padding: "0 12px", gap: 6,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#8b5cf6", opacity: 0.6 }} />
          <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace" }}>XAU/USD</span>
          <span style={{ fontSize: 9, color: "#10b981", fontFamily: "monospace", marginLeft: 4 }}>2,847.30</span>
          <span style={{ fontSize: 8, color: "#10b981", fontFamily: "monospace" }}>+0.42%</span>
        </div>

        <svg width={width - 24} height={height - 56} style={{ position: "absolute", top: 32, left: 0 }}>
          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((p) => (
            <line key={p} x1={chartX} y1={chartY + chartH * p - 32} x2={chartX + chartW} y2={chartY + chartH * p - 32}
              stroke="rgba(139,92,246,0.06)" strokeWidth={0.5} />
          ))}

          {/* Candlesticks */}
          {candles.map((c, i) => {
            const scale = candleIn(i);
            const x = chartX + i * barW + barW * 0.2;
            const w = barW * 0.6;
            const bodyTop = mapY(Math.max(c.open, c.close)) - 32;
            const bodyBot = mapY(Math.min(c.open, c.close)) - 32;
            const wickTop = mapY(c.high) - 32;
            const wickBot = mapY(c.low) - 32;
            const color = c.bull ? "#10b981" : "#8b5cf6";
            return (
              <g key={i} opacity={scale} transform={`translate(0, ${(1 - scale) * 20})`}>
                <line x1={x + w / 2} y1={wickTop} x2={x + w / 2} y2={wickBot} stroke={color} strokeWidth={0.8} />
                <rect x={x} y={bodyTop} width={w} height={Math.max(1, bodyBot - bodyTop)} fill={color} rx={1} />
              </g>
            );
          })}

          {/* Supply/Demand zones */}
          <rect x={chartX} y={mapY(60) - 32} width={chartW} height={mapY(55) - mapY(60)}
            fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth={0.5}
            opacity={zoneIn} rx={2} />
          <rect x={chartX} y={mapY(42) - 32} width={chartW} height={mapY(38) - mapY(42)}
            fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.2)" strokeWidth={0.5}
            opacity={zoneIn} rx={2} />

          {/* Moving average line */}
          <path
            d={candles.map((c, i) => {
              const avg = candles.slice(Math.max(0, i - 5), i + 1).reduce((s, v) => s + (v.open + v.close) / 2, 0) / Math.min(i + 1, 6);
              return `${i === 0 ? "M" : "L"} ${chartX + i * barW + barW / 2} ${mapY(avg) - 32}`;
            }).join(" ")}
            fill="none" stroke="rgba(167,139,250,0.5)" strokeWidth={1.2}
            opacity={overlayIn}
            strokeDasharray={overlayIn < 1 ? "4 2" : "none"}
          />
        </svg>

        {/* Right panel — AI Score */}
        <div style={{
          position: "absolute", top: 44, right: 16, width: 140,
          opacity: scoreIn, transform: `translateX(${(1 - scoreIn) * 30}px)`,
        }}>
          <div style={{
            background: "rgba(6,0,16,0.8)", border: "1px solid rgba(139,92,246,0.15)",
            borderRadius: 8, padding: 10,
          }}>
            <div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginBottom: 4 }}>AI TRADE SCORE</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981", fontFamily: "monospace" }}>87</div>
            <div style={{ fontSize: 7, color: "#94a3b8", fontFamily: "monospace", marginTop: 2 }}>Strong Buy Signal</div>
            <div style={{ height: 3, borderRadius: 2, background: "rgba(139,92,246,0.1)", marginTop: 6 }}>
              <div style={{ height: "100%", width: `${87}%`, borderRadius: 2, background: "linear-gradient(90deg, #8b5cf6, #10b981)" }} />
            </div>
          </div>

          {/* Zone retest probability */}
          <div style={{
            background: "rgba(6,0,16,0.8)", border: "1px solid rgba(139,92,246,0.15)",
            borderRadius: 8, padding: 10, marginTop: 8,
            opacity: narratorIn, transform: `translateY(${(1 - narratorIn) * 15}px)`,
          }}>
            <div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginBottom: 3 }}>ZONE RETEST</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace" }}>73%</div>
            <div style={{ fontSize: 7, color: "#94a3b8", fontFamily: "monospace" }}>Bounce probability</div>
          </div>
        </div>

        {/* AI Narrator bar */}
        <div style={{
          position: "absolute", bottom: 12, left: 12, right: 12,
          background: "rgba(6,0,16,0.85)", border: "1px solid rgba(139,92,246,0.12)",
          borderRadius: 8, padding: "8px 12px",
          opacity: narratorIn, transform: `translateY(${(1 - narratorIn) * 20}px)`,
        }}>
          <div style={{ fontSize: 8, color: "#8b5cf6", fontFamily: "monospace", marginBottom: 2 }}>AI NARRATOR</div>
          <div style={{ fontSize: 9, color: "#94a3b8", fontFamily: "Inter, sans-serif", lineHeight: 1.4 }}>
            Gold showing institutional accumulation near $2,840 demand zone. COT data confirms commercial long positioning. ML model signals 87% reversal probability with 3:1 R:R setup.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ── 3. Data Flow Animation ─────────────────────────────────────────── */
const DATA_SOURCES_ANIM = [
  // Traditional / Institutional
  "Bloomberg", "LSEG / Refinitiv", "S&P Global", "FactSet", "Morningstar",
  "ICE Data", "Moody's Analytics", "Intrinio", "Twelve Data", "Finage",
  "Financial Modeling Prep", "EOD Historical", "Alpha Vantage", "Finnworlds",
  "InfoTrie", "Exchange Data Intl",
  // Crypto Data
  "Kaiko", "CoinAPI", "Amberdata", "CryptoCompare", "CoinGecko",
  "Tardis.dev", "Glassnode", "Messari",
  // FX / Commodities
  "TraderMade", "FinPricing", "Xignite", "Barchart", "Polygon.io",
  "Tick Data", "Quandl / Nasdaq", "CSI Data", "Refinitiv DataScope",
  // Liquidity / Infrastructure
  "B2BROKER", "Integral FX", "oneZero", "PrimeXM", "CFH Clearing",
  // Exchanges
  "CME Group", "ICE Exchange", "Nasdaq", "Binance", "Coinbase", "Kraken",
];

function DataFlowAnimation() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const cx = width / 2;
  const cy = height / 2;
  const total = DATA_SOURCES_ANIM.length;

  // Central node pulse
  const pulse = 0.7 + 0.3 * Math.sin(t * 2);
  const ringExpand = interpolate(frame % 60, [0, 60], [0, 40]);
  const ringOpacity = interpolate(frame % 60, [0, 60], [0.35, 0]);
  const ring2Expand = interpolate((frame + 30) % 60, [0, 60], [0, 55]);
  const ring2Opacity = interpolate((frame + 30) % 60, [0, 60], [0.2, 0]);

  // Two elliptical rings for source placement
  const innerCount = Math.ceil(total * 0.4); // ~18 inner
  const outerCount = total - innerCount;       // ~27 outer
  const radiusXInner = width * 0.32;
  const radiusYInner = height * 0.36;
  const radiusXOuter = width * 0.46;
  const radiusYOuter = height * 0.44;

  return (
    <AbsoluteFill style={{ background: "transparent" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {DATA_SOURCES_ANIM.map((name, i) => {
          const isInner = i < innerCount;
          const ringIdx = isInner ? i : i - innerCount;
          const ringTotal = isInner ? innerCount : outerCount;
          const rx = isInner ? radiusXInner : radiusXOuter;
          const ry = isInner ? radiusYInner : radiusYOuter;
          const angleOffset = isInner ? 0 : Math.PI / outerCount; // stagger rings
          const angle = (ringIdx / ringTotal) * Math.PI * 2 + angleOffset;

          const sx = cx + Math.cos(angle) * rx;
          const sy = cy + Math.sin(angle) * ry;

          // Bezier control - curve inward
          const midAngle = angle + (i % 2 === 0 ? 0.15 : -0.15);
          const cpDist = (isInner ? 0.45 : 0.55) * (isInner ? radiusXInner : radiusXOuter);
          const cpx = cx + Math.cos(midAngle) * cpDist * 0.4;
          const cpy = cy + Math.sin(midAngle) * cpDist * 0.4;

          // Flowing particles
          const speed = 35 + (i % 5) * 3;
          const offset = (t * speed + i * 17) % 100;
          const pt = offset / 100;
          const px = (1 - pt) * (1 - pt) * sx + 2 * (1 - pt) * pt * cpx + pt * pt * cx;
          const py = (1 - pt) * (1 - pt) * sy + 2 * (1 - pt) * pt * cpy + pt * pt * cy;

          const pt2 = ((offset + 50) % 100) / 100;
          const px2 = (1 - pt2) * (1 - pt2) * sx + 2 * (1 - pt2) * pt2 * cpx + pt2 * pt2 * cx;
          const py2 = (1 - pt2) * (1 - pt2) * sy + 2 * (1 - pt2) * pt2 * cpy + pt2 * pt2 * cy;

          const sourceIn = spring({ frame: frame - i * 3, fps, config: { damping: 15 } });
          const nodeR = isInner ? 3 : 2.5;
          const fontSize = isInner ? 6.5 : 5.5;
          const labelY = sy > cy ? sy + 11 : sy - 8;

          return (
            <g key={name} opacity={sourceIn}>
              <path
                d={`M ${sx} ${sy} Q ${cpx} ${cpy} ${cx} ${cy}`}
                fill="none" stroke={`rgba(139,92,246,${isInner ? 0.1 : 0.06})`} strokeWidth={0.7}
              />
              <circle cx={px} cy={py} r={1.8} fill="rgba(167,139,250,0.7)">
                <animate attributeName="r" values="1.5;2.5;1.5" dur={`${1.2 + (i % 3) * 0.3}s`} repeatCount="indefinite" />
              </circle>
              <circle cx={px2} cy={py2} r={1.2} fill="rgba(139,92,246,0.4)" />
              <circle cx={sx} cy={sy} r={nodeR} fill="rgba(6,0,16,0.8)" stroke="rgba(139,92,246,0.25)" strokeWidth={0.7} />
              <circle cx={sx} cy={sy} r={nodeR * 0.5} fill={`rgba(167,139,250,${0.4 + 0.3 * Math.sin(t * 2 + i)})`} />
              <text x={sx} y={labelY} textAnchor="middle" fill="#64748b" fontSize={fontSize} fontFamily="monospace">
                {name}
              </text>
            </g>
          );
        })}

        {/* Central VISION node */}
        <circle cx={cx} cy={cy} r={ring2Expand} fill="none"
          stroke="rgba(139,92,246,0.3)" strokeWidth={0.5} opacity={ring2Opacity} />
        <circle cx={cx} cy={cy} r={ringExpand} fill="none"
          stroke="rgba(139,92,246,0.5)" strokeWidth={0.8} opacity={ringOpacity} />
        <circle cx={cx} cy={cy} r={20 * pulse}
          fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.35)" strokeWidth={1.2} />
        <circle cx={cx} cy={cy} r={7} fill="rgba(167,139,250,0.95)" />
        <text x={cx} y={cy + 30} textAnchor="middle" fill="#a78bfa" fontSize={10} fontWeight="bold" fontFamily="monospace">
          VISION
        </text>
      </svg>
    </AbsoluteFill>
  );
}

/* ── Data ─────────────────────────────────────────────────────────────── */
const PILLARS = [
  {
    icon: Eye,
    title: "Smart Money Detection",
    desc: "See what institutions see. Order blocks, fair value gaps, break of structure, change of character — mapped in real time across every timeframe.",
    features: ["Order Blocks & FVG", "BOS / CHoCH Detection", "Supply & Demand Zones", "Zone Retest Probability"],
  },
  {
    icon: Shield,
    title: "Institutional Intelligence",
    desc: "Track the positions that move markets. COT reports, whale wallet flows, and on-chain accumulation patterns — decoded and visualized.",
    features: ["COT Report Analysis", "Whale Wallet Tracking", "On-Chain Flow Detection", "Institutional Heat Score"],
  },
  {
    icon: Brain,
    title: "AI-Powered Analysis",
    desc: "Machine learning models trained on institutional patterns. Reversal prediction, regime detection, and an AI narrator that explains what the market is doing — and why.",
    features: ["ML Reversal Prediction", "Market Regime Detection", "AI Market Narrator", "Composite Trade Score"],
  },
  {
    icon: Zap,
    title: "Real-Time Order Flow",
    desc: "1,000-level deep order book. Liquidation heatmaps. TP/SL cluster analysis. See exactly where the liquidity sits before price gets there.",
    features: ["Deep Order Book (1K levels)", "Liquidation Heatmaps", "TP/SL Cluster Maps", "Volume Profile Analysis"],
  },
];

const ALL_FEATURES = [
  { icon: Sparkles, name: "AI Market Narrator", desc: "Natural language market briefing updated in real time" },
  { icon: Gauge, name: "Composite Trade Score", desc: "Single score combining technical, macro, and institutional signals" },
  { icon: Layers, name: "Supply & Demand Zones", desc: "Auto-detected institutional accumulation and distribution zones" },
  { icon: Target, name: "Zone Retest Probability", desc: "ML-scored probability of zone retest, bounce, or break" },
  { icon: BarChart3, name: "Volume Profile", desc: "VAH, VAL, and POC mapped to price action" },
  { icon: GitBranch, name: "Divergence Analysis", desc: "Institutional vs retail divergence detection" },
  { icon: Waves, name: "Liquidity Forecast", desc: "Predictive heatmap of future liquidity pools" },
  { icon: Calendar, name: "Economic Calendar", desc: "High-impact events with expected volatility" },
  { icon: Newspaper, name: "News Sentiment", desc: "Real-time sentiment scoring from financial news" },
  { icon: Activity, name: "Volatility Forecast", desc: "Forward-looking volatility estimation per asset" },
  { icon: Globe, name: "Currency Heatmap", desc: "Cross-pair strength and weakness at a glance" },
  { icon: Brain, name: "ML Reversal Prediction", desc: "Neural network reversal detection with confidence scores" },
  { icon: ScanLine, name: "Order Flow Analysis", desc: "Real-time bid/ask imbalance and aggression" },
  { icon: Crosshair, name: "TP/SL Heatmap", desc: "Where traders are placing stops and targets" },
  { icon: LineChart, name: "Deep Order Book", desc: "1,000-level depth visualization with wall detection" },
  { icon: Flame, name: "Liquidation Map", desc: "Leveraged position liquidation clusters" },
  { icon: Layers, name: "Multi-Timeframe Confluence", desc: "Signal alignment across 1m to 1W timeframes" },
  { icon: Eye, name: "Smart Money Concepts", desc: "Order blocks, FVG, BOS/CHoCH structure mapping" },
  { icon: Radio, name: "Whale Tracker", desc: "Large wallet movements and accumulation patterns" },
  { icon: AreaChart, name: "Asset Correlations", desc: "Inter-market correlation matrix with divergence alerts" },
  { icon: TrendingUp, name: "Gold Macro Analysis", desc: "DXY, yields, and macro regime impact on gold" },
  { icon: BookOpen, name: "COT Reports", desc: "Commercial vs speculative positioning from CFTC data" },
];

const MARKETS = [
  { label: "Forex", count: "28", suffix: "+ Pairs", examples: "EUR/USD, GBP/USD, USD/JPY, AUD/USD..." },
  { label: "Gold & Silver", count: "", suffix: "XAU/USD, XAG/USD", examples: "Dedicated macro analysis & correlation tools" },
  { label: "Crypto", count: "40", suffix: "+ Tokens", examples: "BTC, ETH, SOL, XRP, DOGE, PEPE, SUI..." },
  { label: "Indices", count: "", suffix: "NAS100, SPX500", examples: "US equity index CFDs with full indicator suite" },
];

const PRICING_FEATURES = [
  "All 22+ analytical widgets",
  "AI Market Narrator",
  "ML reversal prediction",
  "Deep order book (1,000 levels)",
  "Whale & institutional tracking",
  "COT report analysis",
  "Liquidation heatmaps",
  "Real-time order flow",
  "40+ crypto, 28+ forex pairs",
  "Multi-timeframe confluence",
  "Zone retest probability",
  "Unlimited access to all markets",
];

const TICKER_DATA = [
  { s: "XAU/USD", p: "2,847.30", c: "+0.42%", up: true },
  { s: "EUR/USD", p: "1.0834", c: "-0.15%", up: false },
  { s: "BTC/USD", p: "97,241", c: "+2.18%", up: true },
  { s: "GBP/USD", p: "1.2671", c: "+0.08%", up: true },
  { s: "ETH/USD", p: "3,412", c: "+1.54%", up: true },
  { s: "USD/JPY", p: "149.82", c: "-0.31%", up: false },
  { s: "SOL/USD", p: "187.40", c: "+3.27%", up: true },
  { s: "NAS100", p: "21,487", c: "+0.65%", up: true },
];

const HERO_LINE1 = ["Institutional-Grade"];
const HERO_LINE2 = ["Trading", "Intelligence"];

/* ═══════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [navSolid, setNavSolid] = useState(false);
  const count22 = useCountUp(22);
  const count28 = useCountUp(28);
  const count40 = useCountUp(40);
  const count99 = useCountUp(99);

  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing-root relative min-h-screen overflow-x-hidden">
      {/* ── Global animation styles ────────────────────────────── */}
      <style jsx global>{`
        /* ── Lock landing page to purple/night theme regardless of user theme ── */
        .landing-root {
          --color-bg-primary: #060010;
          --color-bg-secondary: #0a0014;
          --color-bg-card: #060010;
          --color-bg-elevated: #0e0820;
          --color-bg-hover: #1c1530;
          --color-border-primary: #1c1530;
          --color-border-accent: rgba(139, 92, 246, 0.2);
          --color-border-glow: rgba(139, 92, 246, 0.5);
          --color-text-primary: #e2e8f0;
          --color-text-secondary: #94a3b8;
          --color-text-muted: #64748b;
          --color-neon-blue: #a78bfa;
          --color-neon-cyan: #c4b5fd;
          --color-neon-green: #10b981;
          --color-neon-red: #8b5cf6;
          --color-neon-amber: #f59e0b;
          --color-neon-purple: #8b5cf6;
          --color-bull: #10b981;
          --color-bear: #8b5cf6;
          --color-neutral: #a78bfa;
          --color-glass-from: rgba(6, 0, 16, 0.95);
          --color-glass-to: rgba(10, 0, 20, 0.95);
          --color-grid-line: rgba(139, 92, 246, 0.03);
          background-color: #060010;
          color: #e2e8f0;
        }
        /* ── Noise overlay ─────────────────────────────────── */
        .noise-overlay {
          position: fixed; inset: 0; pointer-events: none; z-index: 100;
          opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 256px 256px;
        }

        /* ── Hero mesh ─────────────────────────────────────── */
        .hero-mesh {
          position: absolute; inset: 0; overflow: hidden; z-index: 0;
        }
        .hero-mesh::before {
          content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
          background:
            radial-gradient(ellipse 700px 700px at 25% 25%, rgba(139,92,246,0.14), transparent),
            radial-gradient(ellipse 500px 500px at 75% 20%, rgba(167,139,250,0.09), transparent),
            radial-gradient(ellipse 600px 400px at 50% 75%, rgba(99,102,241,0.07), transparent),
            radial-gradient(ellipse 350px 350px at 80% 55%, rgba(139,92,246,0.11), transparent);
          animation: mesh-drift 28s ease-in-out infinite;
          will-change: transform;
        }
        @keyframes mesh-drift {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          25% { transform: translate(3%, -2%) rotate(0.5deg) scale(1.02); }
          50% { transform: translate(-2%, 3%) rotate(-0.3deg) scale(0.98); }
          75% { transform: translate(2%, 1%) rotate(0.3deg) scale(1.01); }
        }

        /* ── Dot grid ──────────────────────────────────────── */
        .dot-grid {
          position: absolute; inset: 0;
          background-image: radial-gradient(circle 1px, rgba(139,92,246,0.18) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(ellipse 60% 50% at 50% 35%, black 15%, transparent 65%);
          -webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 35%, black 15%, transparent 65%);
          opacity: 0.6;
        }

        /* ── Reveal system ─────────────────────────────────── */
        .reveal {
          opacity: 0;
          transition:
            opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1) var(--reveal-delay, 0ms),
            transform 0.9s cubic-bezier(0.16, 1, 0.3, 1) var(--reveal-delay, 0ms),
            filter 0.9s cubic-bezier(0.16, 1, 0.3, 1) var(--reveal-delay, 0ms);
          will-change: transform, opacity;
        }
        .reveal-fade-up { transform: translateY(48px); }
        .reveal-fade-down { transform: translateY(-48px); }
        .reveal-fade-left { transform: translateX(-60px); }
        .reveal-fade-right { transform: translateX(60px); }
        .reveal-scale-up { transform: scale(0.88); }
        .reveal-blur-in { transform: translateY(24px); filter: blur(10px); }
        .reveal.revealed {
          opacity: 1;
          transform: translate(0, 0) scale(1) rotate(0);
          filter: blur(0);
        }

        /* ── Stagger children ──────────────────────────────── */
        .stagger-children > * {
          opacity: 0; transform: translateY(28px);
          transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1);
        }
        .stagger-children.revealed > * { opacity: 1; transform: translateY(0); }
        .stagger-children.revealed > *:nth-child(1) { transition-delay: 0ms; }
        .stagger-children.revealed > *:nth-child(2) { transition-delay: 80ms; }
        .stagger-children.revealed > *:nth-child(3) { transition-delay: 160ms; }
        .stagger-children.revealed > *:nth-child(4) { transition-delay: 240ms; }
        .stagger-children.revealed > *:nth-child(5) { transition-delay: 320ms; }
        .stagger-children.revealed > *:nth-child(6) { transition-delay: 400ms; }
        .stagger-children.revealed > *:nth-child(7) { transition-delay: 460ms; }
        .stagger-children.revealed > *:nth-child(8) { transition-delay: 520ms; }
        .stagger-children.revealed > *:nth-child(9) { transition-delay: 580ms; }
        .stagger-children.revealed > *:nth-child(10) { transition-delay: 640ms; }
        .stagger-children.revealed > *:nth-child(11) { transition-delay: 700ms; }
        .stagger-children.revealed > *:nth-child(12) { transition-delay: 760ms; }

        /* ── Hero word reveal ──────────────────────────────── */
        @keyframes word-reveal {
          0% { opacity: 0; transform: translateY(24px) rotateX(50deg); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0) rotateX(0deg); filter: blur(0); }
        }
        .hero-word {
          display: inline-block; opacity: 0;
          animation: word-reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards;
          transform-origin: bottom center;
        }

        /* ── Fade blur in ──────────────────────────────────── */
        @keyframes fadeBlurIn {
          0% { opacity: 0; filter: blur(8px); transform: translateY(16px); }
          100% { opacity: 1; filter: blur(0); transform: translateY(0); }
        }

        /* ── Gradient text ─────────────────────────────────── */
        .gradient-text {
          background: linear-gradient(135deg, #c4b5fd 0%, #a78bfa 40%, #8b5cf6 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .gradient-text-hero {
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 30%, #c4b5fd 70%, #a78bfa 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }

        /* ── Ticker ────────────────────────────────────────── */
        .ticker-scroll { animation: ticker-slide 45s linear infinite; }
        @keyframes ticker-slide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        /* ── Glow border (rotating conic gradient) ─────────── */
        @property --border-angle {
          syntax: '<angle>'; initial-value: 0deg; inherits: false;
        }
        @keyframes border-rotate { 0% { --border-angle: 0deg; } 100% { --border-angle: 360deg; } }
        .glow-border {
          position: relative; isolation: isolate; border-radius: 12px;
        }
        .glow-border::before {
          content: ''; position: absolute; inset: -1.5px; border-radius: inherit;
          background: conic-gradient(from var(--border-angle), transparent 30%, rgba(139,92,246,0.7) 50%, transparent 70%);
          animation: border-rotate 4s linear infinite; z-index: -1;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude; -webkit-mask-composite: xor; padding: 1.5px;
        }

        /* ── Gradient divider ──────────────────────────────── */
        @keyframes divider-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .gradient-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(139,92,246,0) 10%, rgba(139,92,246,0.35) 50%, rgba(139,92,246,0) 90%, transparent 100%);
          background-size: 200% 100%;
          animation: divider-shimmer 6s ease-in-out infinite;
        }

        /* ── Feature card ──────────────────────────────────── */
        .feature-card {
          transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.15s ease-out;
          transform-style: preserve-3d;
        }
        .feature-card:hover {
          border-color: rgba(139,92,246,0.35);
          box-shadow: 0 20px 50px rgba(0,0,0,0.25), 0 0 60px rgba(139,92,246,0.06);
        }
        .feature-card:hover .icon-box {
          border-color: rgba(139,92,246,0.5);
          box-shadow: 0 0 24px rgba(139,92,246,0.18);
        }
        .feature-card:hover .icon-box svg {
          animation: icon-pulse 0.5s ease-out;
        }
        @keyframes icon-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.25); }
          100% { transform: scale(1); }
        }

        /* ── Pricing pulse glow ────────────────────────────── */
        .pricing-glow {
          position: absolute; width: 350px; height: 350px;
          background: radial-gradient(circle, rgba(139,92,246,0.14), transparent 70%);
          filter: blur(80px); top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          animation: pricing-pulse 5s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes pricing-pulse {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.85; transform: translate(-50%, -50%) scale(1.2); }
        }

        /* ── Ripple ────────────────────────────────────────── */
        .btn-ripple { position: relative; overflow: hidden; }
        .ripple-dot {
          position: absolute; border-radius: 50%;
          background: rgba(255,255,255,0.25);
          width: 44px; height: 44px; margin-top: -22px; margin-left: -22px;
          animation: ripple-expand 0.7s ease-out forwards; pointer-events: none;
        }
        @keyframes ripple-expand {
          0% { transform: scale(0); opacity: 0.5; }
          100% { transform: scale(4.5); opacity: 0; }
        }

        /* ── Magnetic button ───────────────────────────────── */
        .btn-magnetic { transition: transform 0.2s cubic-bezier(0.33,1,0.68,1); }

        /* ── Accent underline ──────────────────────────────── */
        .accent-underline { position: relative; display: inline-block; }
        .accent-underline::after {
          content: ''; position: absolute; bottom: -3px; left: 0; width: 100%; height: 2px;
          background: linear-gradient(90deg, #8b5cf6, #a78bfa, #8b5cf6); background-size: 200% 100%;
          transform: scaleX(0); transform-origin: left;
          transition: transform 0.8s cubic-bezier(0.16,1,0.3,1) 0.3s;
        }
        .reveal.revealed .accent-underline::after { transform: scaleX(1); }

        /* ── Source hover ──────────────────────────────────── */
        .source-name {
          transition: color 0.3s ease, transform 0.3s ease;
        }
        .source-name:hover {
          color: var(--color-neon-blue) !important;
          transform: scale(1.08);
        }

        /* ── Nav glass ─────────────────────────────────────── */
        .nav-solid {
          background: rgba(6,0,16,0.92) !important;
          border-bottom-color: rgba(139,92,246,0.12) !important;
        }

        /* ── Reduced motion ────────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .reveal { transition-duration: 0.01ms !important; }
          .hero-word { animation-duration: 0.01ms !important; }
          .hero-mesh::before, .glow-border::before, .pricing-glow { animation: none !important; }
          .noise-overlay, .dot-grid { display: none; }
          .ticker-scroll { animation: none; }
          .stagger-children > * { transition-duration: 0.01ms !important; }
        }
      `}</style>

      {/* ── Noise texture ──────────────────────────────────── */}
      <div className="noise-overlay" aria-hidden="true" />

      {/* ── Background mesh + dots ─────────────────────────── */}
      <div className="hero-mesh" aria-hidden="true">
        <div className="dot-grid" />
      </div>

      {/* ── Remotion: Hero particle grid ─────────────────────── */}
      <div className="absolute inset-0 z-[1] pointer-events-none opacity-60" aria-hidden="true">
        <Player
          component={HeroParticles}
          durationInFrames={300}
          fps={30}
          compositionWidth={1280}
          compositionHeight={720}
          autoPlay
          loop
          controls={false}
          style={{ width: "100%", height: "100%" }}
          acknowledgeRemotionLicense
          renderLoading={() => null}
        />
      </div>

      {/* ════════════════════ NAV ════════════════════ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 border-b border-transparent backdrop-blur-xl transition-all duration-300 ${navSolid ? "nav-solid" : "bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Image src="/logo-vision.png" alt="VISION" width={130} height={22} priority />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/register"
              className="btn-magnetic btn-ripple px-4 py-1.5 text-[11px] font-semibold rounded-md bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/85 transition-all"
              onMouseMove={handleMagnet}
              onMouseLeave={resetMagnet}
              onClick={createRipple}
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ════════════════════ HERO ════════════════════ */}
      <section className="relative z-10 pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--color-border-accent)] bg-[var(--color-bg-elevated)]/60 mb-10"
            style={{ opacity: 0, animation: "fadeBlurIn 0.6s 0.15s forwards" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-neon-green)] animate-pulse" />
            <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">
              Live on Ethereum, Polygon & Solana
            </span>
          </div>

          {/* Headline — word by word */}
          <h1
            className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-7"
            style={{ perspective: "600px" }}
          >
            {HERO_LINE1.map((w, i) => (
              <span key={w} className="hero-word gradient-text-hero" style={{ animationDelay: `${350 + i * 100}ms` }}>
                {w}&nbsp;
              </span>
            ))}
            <br />
            {HERO_LINE2.map((w, i) => (
              <span key={w} className="hero-word gradient-text" style={{ animationDelay: `${650 + i * 100}ms` }}>
                {w}&nbsp;
              </span>
            ))}
          </h1>

          {/* Subtitle */}
          <p
            className="text-base sm:text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-12 leading-relaxed font-light"
            style={{ fontFamily: "Inter, sans-serif", opacity: 0, animation: "fadeBlurIn 0.9s 1s forwards" }}
          >
            See what smart money sees. AI-powered analysis, on-chain whale tracking,
            deep order flow, and institutional positioning — unified in a single platform
            built for traders who refuse to trade blind.
          </p>

          {/* CTA buttons */}
          <div
            className="flex items-center justify-center gap-4 mb-16"
            style={{ opacity: 0, animation: "fadeBlurIn 0.8s 1.2s forwards" }}
          >
            <Link
              href="/register"
              className="btn-magnetic btn-ripple glow-border group flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-bold bg-[var(--color-neon-blue)] text-white transition-all shadow-lg shadow-[var(--color-neon-blue)]/25"
              onMouseMove={handleMagnet}
              onMouseLeave={resetMagnet}
              onClick={createRipple}
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
            </Link>
            <a
              href="#features"
              className="btn-magnetic flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-accent)] hover:text-[var(--color-text-primary)] transition-all"
              onMouseMove={handleMagnet}
              onMouseLeave={resetMagnet}
            >
              Explore Features
            </a>
          </div>

          {/* Ticker strip */}
          <div
            className="relative overflow-hidden max-w-3xl mx-auto rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/50 backdrop-blur-sm"
            style={{ opacity: 0, animation: "fadeBlurIn 0.7s 1.5s forwards" }}
          >
            <div className="flex ticker-scroll whitespace-nowrap py-2.5">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center gap-6 px-3">
                  {TICKER_DATA.map((t, j) => (
                    <span key={`${i}-${j}`} className="inline-flex items-center gap-2 text-[10px]">
                      <span className="font-semibold text-[var(--color-text-secondary)]">{t.s}</span>
                      <span className="font-mono text-[var(--color-text-primary)]">{t.p}</span>
                      <span className={`font-mono font-semibold ${t.up ? "text-[var(--color-bull)]" : "text-[var(--color-neon-red)]"}`}>
                        {t.c}
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ DATA SOURCES ════════════════════ */}
      <RevealSection type="blur-in">
        <section className="relative z-10 py-14 bg-[var(--color-bg-secondary)]/30">
          <div className="gradient-divider mb-14" />
          <div className="max-w-5xl mx-auto px-6">
            <p className="text-center text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-7">
              Aggregating data from institutional-grade sources
            </p>
            <RevealSection type="fade-up" stagger className="flex items-center justify-center flex-wrap gap-x-10 gap-y-4">
              {["OANDA", "Binance", "CryptoCompare", "CFTC", "Glassnode", "Etherscan", "MyFxBook"].map((src) => (
                <span key={src} className="source-name text-[11px] font-semibold text-[var(--color-text-muted)]/60 tracking-wider uppercase cursor-default">
                  {src}
                </span>
              ))}
            </RevealSection>
          </div>
          <div className="gradient-divider mt-14" />
        </section>
      </RevealSection>

      {/* ── Remotion: Data Flow Animation ────────────────────── */}
      <RevealSection type="scale-up">
        <section className="relative z-10 py-16 px-6">
          <div className="max-w-4xl mx-auto" style={{ aspectRatio: "16/9" }}>
            <Player
              component={DataFlowAnimation}
              durationInFrames={300}
              fps={30}
              compositionWidth={960}
              compositionHeight={540}
              autoPlay
              loop
              controls={false}
              style={{ width: "100%", height: "100%" }}
              renderLoading={() => null}
            />
          </div>
        </section>
      </RevealSection>

      {/* ════════════════════ PROBLEM → SOLUTION ════════════════════ */}
      <section className="relative z-10 py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <RevealSection type="blur-in" className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Most traders are flying blind.<br />
              <span className="gradient-text accent-underline">You don&apos;t have to.</span>
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] max-w-xl mx-auto" style={{ fontFamily: "Inter, sans-serif" }}>
              Retail platforms give you lagging indicators and delayed data.
              VISION gives you the same intelligence that institutions use to move markets.
            </p>
          </RevealSection>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Retail */}
            <RevealSection type="fade-left">
              <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/40 p-7 relative overflow-hidden h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.03] to-transparent" />
                <div className="relative">
                  <span className="inline-block text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] mb-5 px-2.5 py-1 rounded border border-[var(--color-border-primary)]">
                    Retail Platforms
                  </span>
                  <ul className="space-y-3.5">
                    {[
                      "Basic RSI, MACD, and moving averages",
                      "Delayed or end-of-day data feeds",
                      "No institutional flow visibility",
                      "No on-chain or whale tracking",
                      "Manual chart analysis only",
                      "Guessing where liquidity sits",
                    ].map((item, i) => (
                      <li key={item} className="flex items-start gap-2.5 text-[11px] text-[var(--color-text-muted)]" style={{ fontFamily: "Inter, sans-serif" }}>
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--color-text-muted)]/40 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </RevealSection>

            {/* VISION */}
            <RevealSection type="fade-right" delay={150}>
              <div className="rounded-xl border border-[var(--color-border-accent)] bg-[var(--color-bg-secondary)]/40 p-7 relative overflow-hidden shadow-lg shadow-purple-500/[0.04] h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.04] to-transparent" />
                <div className="relative">
                  <span className="inline-block text-[9px] font-bold uppercase tracking-widest text-[var(--color-neon-blue)] mb-5 px-2.5 py-1 rounded border border-[var(--color-border-accent)]">
                    VISION Platform
                  </span>
                  <ul className="space-y-3.5">
                    {[
                      "Smart money concepts: order blocks, FVG, BOS/CHoCH",
                      "Real-time data from 7+ institutional sources",
                      "COT reports + institutional heat scoring",
                      "Whale wallet tracking with on-chain analysis",
                      "AI narrator + ML reversal prediction",
                      "1,000-level deep order book + liquidation maps",
                    ].map((item, i) => (
                      <li key={item} className="flex items-start gap-2.5 text-[11px] text-[var(--color-text-primary)]" style={{ fontFamily: "Inter, sans-serif" }}>
                        <Check className="mt-0.5 w-3.5 h-3.5 text-[var(--color-neon-green)] shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ════════════════════ CORE PILLARS ════════════════════ */}
      <div className="gradient-divider" />
      <section id="features" className="relative z-10 py-28 px-6 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <RevealSection type="scale-up" className="text-center mb-16">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
              Core Intelligence
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Four pillars of<br /><span className="gradient-text accent-underline">market edge</span>
            </h2>
          </RevealSection>

          <div className="grid sm:grid-cols-2 gap-5">
            {PILLARS.map((p, idx) => (
              <RevealSection key={p.title} type={idx % 2 === 0 ? "fade-left" : "fade-right"} delay={idx * 120}>
                <div
                  className="feature-card card-glass rounded-xl p-7 h-full cursor-default"
                  onMouseMove={handleTilt}
                  onMouseLeave={resetTilt}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="icon-box w-10 h-10 rounded-lg bg-[var(--color-neon-blue)]/10 border border-[var(--color-border-accent)] flex items-center justify-center transition-all duration-300">
                      <p.icon className="w-4.5 h-4.5 text-[var(--color-neon-blue)]" />
                    </div>
                    <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                      {p.title}
                    </h3>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mb-5" style={{ fontFamily: "Inter, sans-serif" }}>
                    {p.desc}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {p.features.map((f) => (
                      <span
                        key={f}
                        className="text-[9px] font-semibold px-2.5 py-1 rounded-md border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)]/60"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── Remotion: Dashboard Mockup Animation ──────────────── */}
      <div className="gradient-divider" />
      <RevealSection type="scale-up">
        <section className="relative z-10 py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-4">
              See It In Action
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-10">
              Your dashboard, <span className="gradient-text accent-underline">alive.</span>
            </h2>
            <div className="rounded-xl border border-[var(--color-border-accent)] overflow-hidden shadow-2xl shadow-purple-500/[0.06]" style={{ aspectRatio: "16/9" }}>
              <Player
                component={DashboardMockup}
                durationInFrames={240}
                fps={30}
                compositionWidth={1280}
                compositionHeight={720}
                autoPlay
                loop
                controls={false}
                style={{ width: "100%", height: "100%" }}
                renderLoading={() => null}
              />
            </div>
          </div>
        </section>
      </RevealSection>

      {/* ════════════════════ ALL FEATURES ════════════════════ */}
      <div className="gradient-divider" />
      <section className="relative z-10 py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <RevealSection type="blur-in" className="text-center mb-16">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
              Full Arsenal
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              <span ref={count22} className="gradient-text">0</span>
              <span className="gradient-text">+ analytical widgets.</span>
              <br /><span className="gradient-text accent-underline">One unified platform.</span>
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted)] max-w-lg mx-auto" style={{ fontFamily: "Inter, sans-serif" }}>
              Every tool you need to decode institutional activity, predict reversals,
              and find high-probability entries — without switching between platforms.
            </p>
          </RevealSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_FEATURES.map((f, i) => {
              const dir = i % 3 === 0 ? "fade-left" : i % 3 === 1 ? "fade-up" : "fade-right";
              return (
                <RevealSection key={f.name} type={dir as RevealType} delay={i * 50}>
                  <div
                    className="feature-card flex items-start gap-3.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/30 p-4 h-full"
                  >
                    <div className="icon-box w-8 h-8 rounded-md bg-[var(--color-neon-blue)]/8 border border-[var(--color-border-primary)] flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300">
                      <f.icon className="w-3.5 h-3.5 text-[var(--color-neon-blue)]" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-bold text-[var(--color-text-primary)] mb-0.5">{f.name}</h4>
                      <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
                        {f.desc}
                      </p>
                    </div>
                  </div>
                </RevealSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════ MARKETS ════════════════════ */}
      <div className="gradient-divider" />
      <section className="relative z-10 py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <RevealSection type="scale-up" className="text-center mb-16">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
              Market Coverage
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Every market.<br /><span className="gradient-text accent-underline">One dashboard.</span>
            </h2>
          </RevealSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MARKETS.map((m, idx) => (
              <RevealSection key={m.label} type="scale-up" delay={idx * 100}>
                <div
                  className="feature-card card-glass rounded-xl p-6 text-center h-full cursor-default"
                  onMouseMove={handleTilt}
                  onMouseLeave={resetTilt}
                >
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">{m.label}</h3>
                  <p className="text-[12px] font-semibold text-[var(--color-neon-blue)] mb-2">
                    {m.count ? (
                      <>
                        <span ref={m.label === "Forex" ? count28 : m.label === "Crypto" ? count40 : undefined}>
                          {m.count}
                        </span>
                        {m.suffix}
                      </>
                    ) : (
                      m.suffix
                    )}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: "Inter, sans-serif" }}>
                    {m.examples}
                  </p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ WHY DIFFERENT ════════════════════ */}
      <div className="gradient-divider" />
      <section className="relative z-10 py-28 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <RevealSection type="blur-in" className="mb-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
              Why VISION
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              No other platform does<br /><span className="gradient-text accent-underline">all of this.</span>
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
              Trading platforms either give you basic charting, or charge thousands for a single data feed.
              VISION is the first platform to combine smart money analysis, institutional positioning,
              AI intelligence, deep order flow, and on-chain data — in one place, at one price.
            </p>
          </RevealSection>

          <div className="grid sm:grid-cols-3 gap-5 text-left">
            {[
              {
                title: "Not a charting tool",
                desc: "We don't just draw lines. We decode institutional behavior using the same data sources hedge funds pay six figures to access.",
                dir: "fade-left" as RevealType,
              },
              {
                title: "Real-time, not delayed",
                desc: "7+ data adapters feeding live prices, order flow, whale movements, and news sentiment. No 15-minute delays. No stale data.",
                dir: "scale-up" as RevealType,
              },
              {
                title: "Built for edge, not education",
                desc: "This isn't a course platform with basic indicators. Every widget exists to give you a measurable trading advantage.",
                dir: "fade-right" as RevealType,
              },
            ].map((item, idx) => (
              <RevealSection key={item.title} type={item.dir} delay={idx * 120}>
                <div
                  className="feature-card card-glass rounded-xl p-6 h-full cursor-default"
                  onMouseMove={handleTilt}
                  onMouseLeave={resetTilt}
                >
                  <h3 className="text-[12px] font-bold text-[var(--color-text-primary)] mb-2">{item.title}</h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
                    {item.desc}
                  </p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ PRICING ════════════════════ */}
      <div className="gradient-divider" />
      <section className="relative z-10 py-28 px-6">
        <div className="max-w-lg mx-auto">
          <RevealSection type="scale-up" className="text-center mb-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
              Simple Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              One plan. <span className="gradient-text accent-underline">Full access.</span>
            </h2>
          </RevealSection>

          <RevealSection type="scale-up" delay={150}>
            <div className="relative">
              <div className="pricing-glow" aria-hidden="true" />
              <div
                className="glow-border card-glass rounded-2xl p-9 relative overflow-hidden"
                onMouseMove={handleTilt}
                onMouseLeave={resetTilt}
              >
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-purple-500/[0.05] to-transparent rounded-bl-full" />
                <div className="relative">
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-5xl font-bold gradient-text">$<span ref={count99}>0</span></span>
                    <span className="text-sm text-[var(--color-text-muted)]">/month</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] mb-7" style={{ fontFamily: "Inter, sans-serif" }}>
                    Paid in USDT or USDC on Ethereum, Polygon, or Solana.
                  </p>

                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--color-neon-green)]/10 border border-[var(--color-neon-green)]/20 mb-7">
                    <Sparkles className="w-3 h-3 text-[var(--color-neon-green)]" />
                    <span className="text-[10px] font-bold text-[var(--color-neon-green)]">3-day free trial included</span>
                  </div>

                  <RevealSection type="fade-up" stagger className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-9">
                    {PRICING_FEATURES.map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <Check className="w-3 h-3 text-[var(--color-neon-green)] shrink-0 mt-0.5" />
                        <span className="text-[10px] text-[var(--color-text-secondary)]" style={{ fontFamily: "Inter, sans-serif" }}>
                          {f}
                        </span>
                      </div>
                    ))}
                  </RevealSection>

                  <Link
                    href="/register"
                    className="btn-magnetic btn-ripple group flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl text-sm font-bold bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/85 transition-all shadow-lg shadow-[var(--color-neon-blue)]/25"
                    onMouseMove={handleMagnet}
                    onMouseLeave={resetMagnet}
                    onClick={createRipple}
                  >
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                  </Link>
                </div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ════════════════════ FINAL CTA ════════════════════ */}
      <div className="gradient-divider" />
      <section className="relative z-10 py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <RevealSection type="blur-in">
            <h2 className="text-4xl sm:text-5xl font-bold mb-5 leading-tight">
              <span className="gradient-text-hero">Stop trading blind.</span>
            </h2>
            <p className="text-base text-[var(--color-text-muted)] mb-12 max-w-lg mx-auto leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
              Join the traders who see the market the way institutions do.
              Start your free trial today — no credit card required. Pay in crypto when you&apos;re ready.
            </p>
          </RevealSection>

          <RevealSection type="scale-up" delay={200}>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/register"
                className="btn-magnetic btn-ripple glow-border group flex items-center gap-2.5 px-9 py-4 rounded-xl text-sm font-bold bg-[var(--color-neon-blue)] text-white transition-all shadow-lg shadow-[var(--color-neon-blue)]/25"
                onMouseMove={handleMagnet}
                onMouseLeave={resetMagnet}
                onClick={createRipple}
              >
                Create Free Account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
              </Link>
            </div>
          </RevealSection>

          {/* Social links */}
          <div className="flex items-center justify-center gap-6 mt-12">
            <a href="#" className="text-[var(--color-text-muted)] hover:text-[var(--color-neon-blue)] transition-colors duration-300">
              <Image src="/discord.svg" alt="Discord" width={20} height={20} />
            </a>
            <a href="#" className="text-[var(--color-text-muted)] hover:text-[var(--color-neon-blue)] transition-colors duration-300">
              <Image src="/telegram.svg" alt="Telegram" width={20} height={20} />
            </a>
          </div>
        </div>
      </section>

      {/* ════════════════════ FOOTER ════════════════════ */}
      <div className="gradient-divider" />
      <footer className="relative z-10 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Image src="/logo-vision.png" alt="VISION" width={90} height={15} />
          <p className="text-[9px] text-[var(--color-text-muted)]" style={{ fontFamily: "Inter, sans-serif" }}>
            &copy; {new Date().getFullYear()} VISION. Institutional-grade trading intelligence.
          </p>
          <div className="flex items-center gap-5">
            <Link href="/login" className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
              Log In
            </Link>
            <Link href="/register" className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
