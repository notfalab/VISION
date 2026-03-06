"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
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
  ChevronRight,
  Check,
  Sparkles,
  Waves,
  Crosshair,
  ScanLine,
  Radio,
  GitBranch,
  AreaChart,
  CandlestickChart,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   VISION Landing Page
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Fade-in on scroll hook ──────────────────────────────────────────── */
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("landed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function FadeSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useFadeIn();
  return (
    <div ref={ref} className={`fade-section ${className}`}>
      {children}
    </div>
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
  { label: "Forex", count: "28+ Pairs", examples: "EUR/USD, GBP/USD, USD/JPY, AUD/USD..." },
  { label: "Gold & Silver", count: "XAU/USD, XAG/USD", examples: "Dedicated macro analysis & correlation tools" },
  { label: "Crypto", count: "40+ Tokens", examples: "BTC, ETH, SOL, XRP, DOGE, PEPE, SUI..." },
  { label: "Indices", count: "NAS100, SPX500", examples: "US equity index CFDs with full indicator suite" },
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

/* ═══════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] overflow-x-hidden">
      {/* Inline styles for landing-specific animations */}
      <style jsx global>{`
        .fade-section {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .fade-section.landed {
          opacity: 1;
          transform: translateY(0);
        }
        .gradient-text {
          background: linear-gradient(135deg, #c4b5fd 0%, #a78bfa 40%, #8b5cf6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .gradient-text-hero {
          background: linear-gradient(135deg, #e2e8f0 0%, #c4b5fd 50%, #a78bfa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          will-change: transform;
        }
        .orb-1 {
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%);
          top: -200px; left: -200px;
          animation: orb-float 20s ease-in-out infinite;
        }
        .orb-2 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(167, 139, 250, 0.08) 0%, transparent 70%);
          top: 400px; right: -250px;
          animation: orb-float 25s ease-in-out infinite reverse;
        }
        .orb-3 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%);
          bottom: -100px; left: 30%;
          animation: orb-float 18s ease-in-out infinite;
        }
        @keyframes orb-float {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(30px, -20px); }
          66% { transform: translate(-20px, 15px); }
        }
        .feature-card {
          transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
        }
        .feature-card:hover {
          border-color: rgba(139, 92, 246, 0.3);
          box-shadow: 0 0 40px rgba(139, 92, 246, 0.06);
          transform: translateY(-2px);
        }
        .ticker-scroll {
          animation: ticker-slide 40s linear infinite;
        }
        @keyframes ticker-slide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* Background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* ────────────────── NAV ────────────────── */}
      <nav className="relative z-20 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/80 backdrop-blur-xl">
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
              className="px-4 py-1.5 text-[11px] font-semibold rounded-md bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/85 transition-all"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ────────────────── HERO ────────────────── */}
      <section className="relative z-10 pt-24 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border-accent)] bg-[var(--color-bg-elevated)]/60 mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-neon-green)] animate-pulse" />
            <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">
              Live on Ethereum, Polygon & Solana
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
            <span className="gradient-text-hero">Institutional-Grade</span>
            <br />
            <span className="gradient-text">Trading Intelligence</span>
          </h1>

          <p className="text-base sm:text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed font-light" style={{ fontFamily: "Inter, sans-serif" }}>
            See what smart money sees. AI-powered analysis, on-chain whale tracking,
            deep order flow, and institutional positioning — unified in a single platform
            built for traders who refuse to trade blind.
          </p>

          <div className="flex items-center justify-center gap-4 mb-16">
            <Link
              href="/register"
              className="group flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/85 transition-all shadow-lg shadow-[var(--color-neon-blue)]/20"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-accent)] hover:text-[var(--color-text-primary)] transition-all"
            >
              Explore Features
            </a>
          </div>

          {/* Ticker strip */}
          <div className="relative overflow-hidden max-w-3xl mx-auto rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/60 backdrop-blur-sm">
            <div className="flex ticker-scroll whitespace-nowrap py-2.5">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center gap-6 px-3">
                  {[
                    { s: "XAU/USD", p: "2,847.30", c: "+0.42%", up: true },
                    { s: "EUR/USD", p: "1.0834", c: "-0.15%", up: false },
                    { s: "BTC/USD", p: "97,241", c: "+2.18%", up: true },
                    { s: "GBP/USD", p: "1.2671", c: "+0.08%", up: true },
                    { s: "ETH/USD", p: "3,412", c: "+1.54%", up: true },
                    { s: "USD/JPY", p: "149.82", c: "-0.31%", up: false },
                    { s: "SOL/USD", p: "187.40", c: "+3.27%", up: true },
                    { s: "NAS100", p: "21,487", c: "+0.65%", up: true },
                  ].map((t, j) => (
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

      {/* ────────────────── DATA SOURCES ────────────────── */}
      <FadeSection>
        <section className="relative z-10 py-12 border-y border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/30">
          <div className="max-w-5xl mx-auto px-6">
            <p className="text-center text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-6">
              Aggregating data from institutional-grade sources
            </p>
            <div className="flex items-center justify-center flex-wrap gap-x-10 gap-y-4">
              {["OANDA", "Binance", "CryptoCompare", "CFTC", "Glassnode", "Etherscan", "MyFxBook"].map((src) => (
                <span key={src} className="text-[11px] font-semibold text-[var(--color-text-muted)]/60 tracking-wider uppercase">
                  {src}
                </span>
              ))}
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ────────────────── PROBLEM → SOLUTION ────────────────── */}
      <FadeSection>
        <section className="relative z-10 py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Most traders are flying blind.<br />
                <span className="gradient-text">You don&apos;t have to.</span>
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] max-w-xl mx-auto" style={{ fontFamily: "Inter, sans-serif" }}>
                Retail platforms give you lagging indicators and delayed data.
                VISION gives you the same intelligence that institutions use to move markets.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Retail */}
              <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/40 p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.02] to-transparent" />
                <div className="relative">
                  <span className="inline-block text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] mb-4 px-2 py-1 rounded border border-[var(--color-border-primary)]">
                    Retail Platforms
                  </span>
                  <ul className="space-y-3">
                    {[
                      "Basic RSI, MACD, and moving averages",
                      "Delayed or end-of-day data feeds",
                      "No institutional flow visibility",
                      "No on-chain or whale tracking",
                      "Manual chart analysis only",
                      "Guessing where liquidity sits",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[11px] text-[var(--color-text-muted)]" style={{ fontFamily: "Inter, sans-serif" }}>
                        <span className="mt-1 w-1 h-1 rounded-full bg-[var(--color-text-muted)]/40 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* VISION */}
              <div className="rounded-lg border border-[var(--color-border-accent)] bg-[var(--color-bg-secondary)]/40 p-6 relative overflow-hidden shadow-lg shadow-purple-500/[0.03]">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.03] to-transparent" />
                <div className="relative">
                  <span className="inline-block text-[9px] font-bold uppercase tracking-widest text-[var(--color-neon-blue)] mb-4 px-2 py-1 rounded border border-[var(--color-border-accent)]">
                    VISION Platform
                  </span>
                  <ul className="space-y-3">
                    {[
                      "Smart money concepts: order blocks, FVG, BOS/CHoCH",
                      "Real-time data from 7+ institutional sources",
                      "COT reports + institutional heat scoring",
                      "Whale wallet tracking with on-chain analysis",
                      "AI narrator + ML reversal prediction",
                      "1,000-level deep order book + liquidation maps",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[11px] text-[var(--color-text-primary)]" style={{ fontFamily: "Inter, sans-serif" }}>
                        <Check className="mt-0.5 w-3 h-3 text-[var(--color-neon-green)] shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ────────────────── CORE PILLARS ────────────────── */}
      <FadeSection>
        <section id="features" className="relative z-10 py-24 px-6 scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
                Core Intelligence
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold">
                Four pillars of<br /><span className="gradient-text">market edge</span>
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              {PILLARS.map((p) => (
                <div
                  key={p.title}
                  className="feature-card card-glass rounded-xl p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-[var(--color-neon-blue)]/10 border border-[var(--color-border-accent)] flex items-center justify-center">
                      <p.icon className="w-4 h-4 text-[var(--color-neon-blue)]" />
                    </div>
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
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
                        className="text-[9px] font-semibold px-2 py-1 rounded-md border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)]/60"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ────────────────── ALL FEATURES ────────────────── */}
      <FadeSection>
        <section className="relative z-10 py-24 px-6 border-t border-[var(--color-border-primary)]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
                Full Arsenal
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">
                22+ analytical widgets.<br /><span className="gradient-text">One unified platform.</span>
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)] max-w-lg mx-auto" style={{ fontFamily: "Inter, sans-serif" }}>
                Every tool you need to decode institutional activity, predict reversals,
                and find high-probability entries — without switching between platforms.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ALL_FEATURES.map((f) => (
                <div
                  key={f.name}
                  className="feature-card flex items-start gap-3 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/30 p-4"
                >
                  <div className="w-7 h-7 rounded-md bg-[var(--color-neon-blue)]/8 border border-[var(--color-border-primary)] flex items-center justify-center shrink-0 mt-0.5">
                    <f.icon className="w-3.5 h-3.5 text-[var(--color-neon-blue)]" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-[var(--color-text-primary)] mb-0.5">{f.name}</h4>
                    <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ────────────────── MARKETS ────────────────── */}
      <FadeSection>
        <section className="relative z-10 py-24 px-6 border-t border-[var(--color-border-primary)]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
                Market Coverage
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold">
                Every market.<br /><span className="gradient-text">One dashboard.</span>
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {MARKETS.map((m) => (
                <div key={m.label} className="feature-card card-glass rounded-xl p-5 text-center">
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)] mb-1">{m.label}</h3>
                  <p className="text-[11px] font-semibold text-[var(--color-neon-blue)] mb-2">{m.count}</p>
                  <p className="text-[9px] text-[var(--color-text-muted)]" style={{ fontFamily: "Inter, sans-serif" }}>
                    {m.examples}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ────────────────── WHY DIFFERENT ────────────────── */}
      <FadeSection>
        <section className="relative z-10 py-24 px-6 border-t border-[var(--color-border-primary)]">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
              Why VISION
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-6">
              No other platform does<br /><span className="gradient-text">all of this.</span>
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] max-w-2xl mx-auto mb-12 leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
              Trading platforms either give you basic charting, or charge thousands for a single data feed.
              VISION is the first platform to combine smart money analysis, institutional positioning,
              AI intelligence, deep order flow, and on-chain data — in one place, at one price.
            </p>

            <div className="grid sm:grid-cols-3 gap-5 text-left">
              {[
                {
                  title: "Not a charting tool",
                  desc: "We don't just draw lines. We decode institutional behavior using the same data sources hedge funds pay six figures to access.",
                },
                {
                  title: "Real-time, not delayed",
                  desc: "7+ data adapters feeding live prices, order flow, whale movements, and news sentiment. No 15-minute delays. No stale data.",
                },
                {
                  title: "Built for edge, not education",
                  desc: "This isn't a course platform with basic indicators. Every widget exists to give you a measurable trading advantage.",
                },
              ].map((item) => (
                <div key={item.title} className="feature-card card-glass rounded-xl p-5">
                  <h3 className="text-[11px] font-bold text-[var(--color-text-primary)] mb-2">{item.title}</h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ────────────────── PRICING ────────────────── */}
      <FadeSection>
        <section className="relative z-10 py-24 px-6 border-t border-[var(--color-border-primary)]">
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-10">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon-blue)] mb-3">
                Simple Pricing
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold">
                One plan. <span className="gradient-text">Full access.</span>
              </h2>
            </div>

            <div className="card-glass rounded-2xl p-8 border border-[var(--color-border-accent)] shadow-lg shadow-purple-500/[0.04] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-purple-500/[0.04] to-transparent rounded-bl-full" />
              <div className="relative">
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold gradient-text">$99</span>
                  <span className="text-sm text-[var(--color-text-muted)]">/month</span>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mb-6" style={{ fontFamily: "Inter, sans-serif" }}>
                  Paid in USDT or USDC on Ethereum, Polygon, or Solana.
                </p>

                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-neon-green)]/10 border border-[var(--color-neon-green)]/20 mb-6">
                  <Sparkles className="w-3 h-3 text-[var(--color-neon-green)]" />
                  <span className="text-[10px] font-bold text-[var(--color-neon-green)]">3-day free trial included</span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-8">
                  {PRICING_FEATURES.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <Check className="w-3 h-3 text-[var(--color-neon-green)] shrink-0 mt-0.5" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]" style={{ fontFamily: "Inter, sans-serif" }}>
                        {f}
                      </span>
                    </div>
                  ))}
                </div>

                <Link
                  href="/register"
                  className="group flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm font-bold bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/85 transition-all shadow-lg shadow-[var(--color-neon-blue)]/20"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ────────────────── FINAL CTA ────────────────── */}
      <FadeSection>
        <section className="relative z-10 py-28 px-6 border-t border-[var(--color-border-primary)]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Stop trading blind.
            </h2>
            <p className="text-base text-[var(--color-text-muted)] mb-10 max-w-lg mx-auto" style={{ fontFamily: "Inter, sans-serif" }}>
              Join the traders who see the market the way institutions do.
              Start your free trial today — no credit card required. Pay in crypto when you&apos;re ready.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/register"
                className="group flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-bold bg-[var(--color-neon-blue)] text-white hover:bg-[var(--color-neon-blue)]/85 transition-all shadow-lg shadow-[var(--color-neon-blue)]/20"
              >
                Create Free Account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Social links */}
            <div className="flex items-center justify-center gap-5 mt-10">
              <a href="#" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
                <Image src="/discord.svg" alt="Discord" width={18} height={18} />
              </a>
              <a href="#" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
                <Image src="/telegram.svg" alt="Telegram" width={18} height={18} />
              </a>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ────────────────── FOOTER ────────────────── */}
      <footer className="relative z-10 border-t border-[var(--color-border-primary)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Image src="/logo-vision.png" alt="VISION" width={90} height={15} />
          <p className="text-[9px] text-[var(--color-text-muted)]" style={{ fontFamily: "Inter, sans-serif" }}>
            &copy; {new Date().getFullYear()} VISION. Institutional-grade trading intelligence.
          </p>
          <div className="flex items-center gap-4">
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
