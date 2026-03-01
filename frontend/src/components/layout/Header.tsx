"use client";

import { useEffect, useState, useRef } from "react";
import { Send, MessageCircle, ChevronDown, LogOut, User, Palette } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMarketStore } from "@/stores/market";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { binanceWS, isBinanceSymbol } from "@/lib/binance-ws";
import { formatPrice, formatChange, priceColor } from "@/lib/format";

const ASSET_OPTIONS = [
  { symbol: "XAUUSD", label: "XAU/USD", color: "var(--color-neon-amber, #F59E0B)" },
  { symbol: "BTCUSD", label: "BTC/USD", color: "var(--color-neon-orange, #F97316)" },
  { symbol: "EURUSD", label: "EUR/USD", color: "#3B82F6" },
  { symbol: "GBPUSD", label: "GBP/USD", color: "#EC4899" },
  { symbol: "USDJPY", label: "USD/JPY", color: "#EF4444" },
  { symbol: "AUDUSD", label: "AUD/USD", color: "#10B981" },
  { symbol: "USDCAD", label: "USD/CAD", color: "#8B5CF6" },
  { symbol: "NZDUSD", label: "NZD/USD", color: "#06B6D4" },
  { symbol: "USDCHF", label: "USD/CHF", color: "#F43F5E" },
];

const SIGNAL_CHANNELS = [
  { label: "VISION GOLD", href: "https://t.me/+_pMYNBlFj0I0YzMx", color: "#F59E0B", gradient: "linear-gradient(to right, #F59E0B, #000)" },
  { label: "VISION BITCOIN", href: "https://t.me/+9qAF1vBDdTkwYWVh", color: "#F97316", gradient: "linear-gradient(to right, #F97316, #000)" },
  { label: "VISION FOREX", href: "https://t.me/+rV8dmhYnX804ZjY5", color: "#3B82F6", gradient: "linear-gradient(to right, #60A5FA, #000)" },
];

export default function Header() {
  const { activeSymbol, setActiveSymbol, watchlist, livePrices, updateLivePrice } =
    useMarketStore();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const router = useRouter();
  const [clock, setClock] = useState<Date | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const selectorMobileRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const signalsMobileRef = useRef<HTMLDivElement>(null);
  const signalsDesktopRef = useRef<HTMLDivElement>(null);
  const wsConnected = useRef(false);

  // Connect Binance WebSocket for real-time prices (gold, crypto)
  useEffect(() => {
    if (wsConnected.current) return;
    wsConnected.current = true;

    const wsSymbols = watchlist.filter(isBinanceSymbol);
    binanceWS.connect(wsSymbols, (symbol, data) => {
      updateLivePrice(symbol, data);
    });

    return () => {
      binanceWS.disconnect();
      wsConnected.current = false;
    };
  }, [watchlist, updateLivePrice]);

  // REST polling for forex pairs (not available on Binance WS)
  useEffect(() => {
    const forexSymbols = ASSET_OPTIONS
      .map((a) => a.symbol)
      .filter((s) => !isBinanceSymbol(s));
    if (forexSymbols.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      for (const symbol of forexSymbols) {
        if (cancelled) break;
        try {
          const res = await fetch(`/api/v1/prices/${symbol}/latest`);
          if (res.ok) {
            const data = await res.json();
            if (data.price) {
              updateLivePrice(symbol, {
                price: data.price,
                change: data.open ? ((data.price - data.open) / data.open) * 100 : 0,
                high24h: data.high || 0,
                low24h: data.low || 0,
                volume: data.volume || 0,
              });
            }
          }
        } catch {
          // Silently ignore — price will show "—"
        }
      }
    };

    poll();
    const interval = setInterval(poll, 15000); // Every 15s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [updateLivePrice]);

  // Clock
  useEffect(() => {
    setClock(new Date());
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    if (!selectorOpen && !userMenuOpen && !signalsOpen) return;
    const handler = (e: MouseEvent) => {
      if (selectorOpen) {
        const inDesktop = selectorRef.current?.contains(e.target as Node);
        const inMobile = selectorMobileRef.current?.contains(e.target as Node);
        if (!inDesktop && !inMobile) setSelectorOpen(false);
      }
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (signalsOpen) {
        const inMobile = signalsMobileRef.current?.contains(e.target as Node);
        const inDesktop = signalsDesktopRef.current?.contains(e.target as Node);
        if (!inMobile && !inDesktop) setSignalsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectorOpen, userMenuOpen, signalsOpen]);

  const activeOption = ASSET_OPTIONS.find((a) => a.symbol === activeSymbol) ?? ASSET_OPTIONS[0];
  const live = livePrices[activeSymbol];

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <header className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      {/* ===== Mobile: Two-row layout (< md) ===== */}
      <div className="md:hidden">
        {/* Row 1: Logo + Community + Theme + User */}
        <div className="flex items-center h-14 px-3">
          <div className="flex items-center shrink-0">
            <Image src="/logo-vision.png" alt="VISION" width={110} height={18} priority />
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <div className="relative" ref={signalsMobileRef}>
              <button
                onClick={() => setSignalsOpen(!signalsOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[var(--color-bg-hover)] text-[#29B6F6]"
                title="Telegram Signals"
              >
                <Send className="w-[18px] h-[18px]" />
              </button>
              {signalsOpen && (
                <div className="absolute top-full right-0 mt-1 z-50 min-w-[200px] rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-[var(--color-border-primary)]">
                    <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Telegram Channels</p>
                  </div>
                  {SIGNAL_CHANNELS.map((ch) => (
                    <a
                      key={ch.label}
                      href={ch.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setSignalsOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-mono transition-colors hover:brightness-110"
                      style={{ background: ch.gradient }}
                    >
                      <span className="font-semibold text-white">{ch.label}</span>
                      <Send className="w-3.5 h-3.5 text-white/70 ml-auto" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <a
              href="https://discord.gg/YOUR_INVITE_CODE"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[var(--color-bg-hover)] text-[#7289DA]"
              title="Discord Community"
            >
              <MessageCircle className="w-[18px] h-[18px]" />
            </a>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)]"
              title={`Theme: ${theme}`}
            >
              <Palette className="w-[18px] h-[18px] text-[var(--color-neon-purple)]" />
            </button>
            {user && (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-xs font-mono transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)]"
                >
                  <User className="w-[18px] h-[18px] text-[var(--color-neon-cyan)]" />
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                </button>

                {userMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--color-border-primary)]">
                      <p className="text-sm font-mono font-semibold text-[var(--color-text-primary)]">{user.username}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{user.email}</p>
                      <span className="inline-block mt-1.5 text-[10px] uppercase px-1.5 py-0.5 rounded bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)] font-semibold">
                        {user.role}
                      </span>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-mono text-[var(--color-bear)] transition-colors hover:bg-[var(--color-bg-hover)]"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Asset Selector + Price + LIVE */}
        <div className="flex items-center h-12 px-3 border-t border-[var(--color-border-primary)]/50 bg-[var(--color-bg-primary)]/30">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Selector button */}
            <div className="relative" ref={selectorMobileRef}>
              <button
                onClick={() => setSelectorOpen(!selectorOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-mono font-bold transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)] min-h-[36px]"
                style={{ color: activeOption.color }}
              >
                {activeOption.label}
                <ChevronDown className="w-4 h-4 opacity-60" />
              </button>

              {selectorOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden">
                  {ASSET_OPTIONS.map((opt) => (
                    <button
                      key={opt.symbol}
                      onClick={() => {
                        setActiveSymbol(opt.symbol);
                        setSelectorOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-mono transition-colors hover:bg-[var(--color-bg-hover)] ${
                        opt.symbol === activeSymbol ? "bg-[var(--color-bg-hover)]" : ""
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                      <span className="font-bold" style={{ color: opt.color }}>{opt.label}</span>
                      {livePrices[opt.symbol] && (
                        <span className="text-[var(--color-text-secondary)] tabular-nums ml-auto text-xs">
                          {formatPrice(livePrices[opt.symbol].price, opt.symbol)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active price */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-mono bg-[var(--color-bg-hover)]/50 min-h-[36px]">
              <span className="text-[var(--color-text-primary)] tabular-nums font-semibold">
                {live ? formatPrice(live.price, activeSymbol) : "—"}
              </span>
              <span className={`text-xs tabular-nums font-medium ${priceColor(live?.change ?? 0)}`}>
                {live ? formatChange(live.change) : ""}
              </span>
              {live && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-neon-green)] animate-pulse" />
              )}
            </div>
          </div>

          {/* LIVE badge */}
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <div className="w-2 h-2 rounded-full bg-[var(--color-neon-green)] pulse-live" />
            <span className="text-xs font-bold text-[var(--color-text-muted)]">LIVE</span>
          </div>
        </div>
      </div>

      {/* ===== Desktop: Single-row layout (md+) ===== */}
      <div className="hidden md:flex items-center h-14 px-4">
        {/* Logo */}
        <div className="flex items-center shrink-0">
          <Image src="/logo-vision.png" alt="VISION" width={130} height={22} priority />
        </div>

        <div className="h-5 w-px bg-[var(--color-border-primary)] mx-4 shrink-0" />

        {/* Asset Selector + Live Price */}
        <div className="flex items-center gap-1.5">
          <div className="relative" ref={selectorRef}>
            <button
              onClick={() => setSelectorOpen(!selectorOpen)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-mono font-semibold transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)]"
              style={{ color: activeOption.color }}
            >
              {activeOption.label}
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>

            {selectorOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden">
                {ASSET_OPTIONS.map((opt) => (
                  <button
                    key={opt.symbol}
                    onClick={() => {
                      setActiveSymbol(opt.symbol);
                      setSelectorOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] font-mono transition-colors hover:bg-[var(--color-bg-hover)] ${
                      opt.symbol === activeSymbol ? "bg-[var(--color-bg-hover)]" : ""
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                    <span className="font-semibold" style={{ color: opt.color }}>{opt.label}</span>
                    {livePrices[opt.symbol] && (
                      <span className="text-[var(--color-text-secondary)] tabular-nums ml-auto">
                        {formatPrice(livePrices[opt.symbol].price, opt.symbol)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-mono bg-[var(--color-bg-hover)]/50">
            <span className="text-[var(--color-text-secondary)] tabular-nums">
              {live ? formatPrice(live.price, activeSymbol) : "—"}
            </span>
            <span className={`text-[11px] tabular-nums ${priceColor(live?.change ?? 0)}`}>
              {live ? formatChange(live.change) : ""}
            </span>
            {live && (
              <span className="w-1 h-1 rounded-full bg-[var(--color-neon-green)] animate-pulse" />
            )}
          </div>
        </div>

        {/* Right — community + status + user */}
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <div className="relative" ref={signalsDesktopRef}>
            <button
              onClick={() => setSignalsOpen(!signalsOpen)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-[var(--color-bg-hover)] text-[#29B6F6] border border-transparent hover:border-[var(--color-border-primary)]"
              title="Telegram Signal Channels"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Signals</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {signalsOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 min-w-[200px] rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[var(--color-border-primary)]">
                  <p className="text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Telegram Channels</p>
                </div>
                {SIGNAL_CHANNELS.map((ch) => (
                  <a
                    key={ch.label}
                    href={ch.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSignalsOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono transition-colors hover:brightness-110"
                    style={{ background: ch.gradient }}
                  >
                    <span className="font-semibold text-white">{ch.label}</span>
                    <Send className="w-3 h-3 text-white/70 ml-auto" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <a
            href="https://discord.gg/YOUR_INVITE_CODE"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-[var(--color-bg-hover)] text-[#7289DA]"
            title="Join Discord community"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Discord</span>
          </a>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-neon-green)] pulse-live" />
            <span className="text-[11px] text-[var(--color-text-muted)]">LIVE</span>
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)] font-mono tabular-nums">
            {clock ? clock.toLocaleTimeString("en-US", { hour12: false }) : "--:--:--"}
          </span>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)]"
            title={`Theme: ${theme}`}
          >
            <Palette className="w-3.5 h-3.5 text-[var(--color-neon-purple)]" />
            <span className="text-[var(--color-text-muted)] uppercase">{theme}</span>
          </button>

          {/* User menu */}
          {user && (
            <>
              <div className="h-4 w-px bg-[var(--color-border-primary)] shrink-0" />
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)]"
                >
                  <User className="w-3.5 h-3.5 text-[var(--color-neon-cyan)]" />
                  <span className="text-[var(--color-text-secondary)]">{user.username}</span>
                  <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]">
                    {user.role}
                  </span>
                  <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]" />
                </button>

                {userMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 z-50 min-w-[160px] rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-[var(--color-border-primary)]">
                      <p className="text-[11px] font-mono text-[var(--color-text-primary)]">{user.username}</p>
                      <p className="text-[9px] text-[var(--color-text-muted)]">{user.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-[var(--color-bear)] transition-colors hover:bg-[var(--color-bg-hover)]"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
