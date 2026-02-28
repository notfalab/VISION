"use client";

import { useEffect, useState, useRef } from "react";
import { Activity, Send, MessageCircle, ChevronDown, LogOut, User, Palette } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMarketStore } from "@/stores/market";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { binanceWS, isBinanceSymbol } from "@/lib/binance-ws";
import { formatPrice, formatChange, priceColor } from "@/lib/format";

const ASSET_OPTIONS = [
  { symbol: "XAUUSD", label: "XAU/USD", color: "var(--color-neon-amber, #F59E0B)" },
  { symbol: "BTCUSD", label: "BTC/USD", color: "var(--color-neon-orange, #F97316)" },
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
  const selectorRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const wsConnected = useRef(false);

  // Connect Binance WebSocket for real-time prices
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

  // Clock
  useEffect(() => {
    setClock(new Date());
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    if (!selectorOpen && !userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (selectorOpen && selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false);
      }
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectorOpen, userMenuOpen]);

  const activeOption = ASSET_OPTIONS.find((a) => a.symbol === activeSymbol) ?? ASSET_OPTIONS[0];
  const live = livePrices[activeSymbol];

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <header className="flex items-center h-11 px-3 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <Activity className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <span className="text-xs font-bold tracking-widest text-[var(--color-text-primary)]">
          VISION
        </span>
      </div>

      <div className="hidden md:block h-4 w-px bg-[var(--color-border-primary)] mx-3 shrink-0" />

      {/* Asset Selector + Live Price */}
      <div className="flex items-center gap-1.5" ref={selectorRef}>
        {/* Selector button */}
        <div className="relative">
          <button
            onClick={() => setSelectorOpen(!selectorOpen)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)]"
            style={{ color: activeOption.color }}
          >
            {activeOption.label}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {/* Dropdown */}
          {selectorOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden">
              {ASSET_OPTIONS.map((opt) => (
                <button
                  key={opt.symbol}
                  onClick={() => {
                    setActiveSymbol(opt.symbol);
                    setSelectorOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono transition-colors hover:bg-[var(--color-bg-hover)] ${
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

        {/* Active price ticker */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono bg-[var(--color-bg-hover)]/50">
          <span className="text-[var(--color-text-secondary)] tabular-nums">
            {live ? formatPrice(live.price, activeSymbol) : "—"}
          </span>
          <span className={`hidden sm:inline text-[10px] tabular-nums ${priceColor(live?.change ?? 0)}`}>
            {live ? formatChange(live.change) : ""}
          </span>
          {live && (
            <span className="w-1 h-1 rounded-full bg-[var(--color-neon-green)] animate-pulse" />
          )}
        </div>
      </div>

      {/* Right — community + status + user */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0 ml-auto">
        <a
          href="https://t.me/+adjj2WPdVZViNTQx"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider transition-colors hover:bg-[var(--color-bg-hover)] text-[#29B6F6]"
          title="Join Telegram for signals"
        >
          <Send className="w-3 h-3" />
          <span className="hidden sm:inline">Signals</span>
        </a>
        <a
          href="https://discord.gg/YOUR_INVITE_CODE"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider transition-colors hover:bg-[var(--color-bg-hover)] text-[#7289DA]"
          title="Join Discord community"
        >
          <MessageCircle className="w-3 h-3" />
          <span className="hidden sm:inline">Discord</span>
        </a>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-neon-green)] pulse-live" />
          <span className="text-[10px] text-[var(--color-text-muted)]">LIVE</span>
        </div>
        <span className="hidden md:inline text-[10px] text-[var(--color-text-muted)] font-mono tabular-nums">
          {clock ? clock.toLocaleTimeString("en-US", { hour12: false }) : "--:--:--"}
        </span>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)]"
          title={`Theme: ${theme}`}
        >
          <Palette className="w-3 h-3 text-[var(--color-neon-purple)]" />
          <span className="hidden sm:inline text-[var(--color-text-muted)] uppercase">{theme}</span>
        </button>

        {/* User menu */}
        {user && (
          <>
            <div className="h-4 w-px bg-[var(--color-border-primary)] shrink-0" />
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono transition-colors hover:bg-[var(--color-bg-hover)] border border-transparent hover:border-[var(--color-border-primary)]"
              >
                <User className="w-3 h-3 text-[var(--color-neon-cyan)]" />
                <span className="hidden sm:inline text-[var(--color-text-secondary)]">{user.username}</span>
                <span className="hidden md:inline text-[8px] uppercase px-1 py-0.5 rounded bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]">
                  {user.role}
                </span>
                <ChevronDown className="w-2.5 h-2.5 text-[var(--color-text-muted)]" />
              </button>

              {userMenuOpen && (
                <div className="absolute top-full right-0 mt-1 z-50 min-w-[150px] rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-[var(--color-border-primary)]">
                    <p className="text-[10px] font-mono text-[var(--color-text-primary)]">{user.username}</p>
                    <p className="text-[8px] text-[var(--color-text-muted)]">{user.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-mono text-[var(--color-bear)] transition-colors hover:bg-[var(--color-bg-hover)]"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
