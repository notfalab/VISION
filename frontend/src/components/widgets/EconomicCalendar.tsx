"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Calendar, Clock, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { useMarketStore } from "@/stores/market";
import { api } from "@/lib/api";
import RefreshIndicator from "@/components/RefreshIndicator";

interface CalendarEvent {
  id: string;
  title: string;
  country: string;
  datetime: string;
  impact: "high" | "medium" | "low";
  forecast: string | null;
  previous: string | null;
  affects: string[];
  countdown_seconds: number;
  is_past: boolean;
}

/** Country flag emoji from currency code */
function currencyFlag(code: string): string {
  const flags: Record<string, string> = {
    USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
    AUD: "🇦🇺", CAD: "🇨🇦", NZD: "🇳🇿", CHF: "🇨🇭",
    CNY: "🇨🇳",
  };
  return flags[code] || "🌐";
}

/** Format countdown to human-readable */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "LIVE";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Impact dot component */
function ImpactDot({ impact }: { impact: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-500 shadow-red-500/50",
    medium: "bg-amber-500 shadow-amber-500/50",
    low: "bg-emerald-500 shadow-emerald-500/50",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shadow-sm ${colors[impact] || colors.low}`}
    />
  );
}

/** Group events by day label */
function groupByDay(events: CalendarEvent[]): { label: string; date: string; events: CalendarEvent[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const groups: Map<string, CalendarEvent[]> = new Map();

  for (const event of events) {
    const eventDate = new Date(event.datetime);
    const dateKey = eventDate.toISOString().slice(0, 10);
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(event);
  }

  return Array.from(groups.entries()).map(([dateKey, events]) => {
    const d = new Date(dateKey + "T00:00:00Z");
    const isToday = dateKey === today.toISOString().slice(0, 10);
    const isTomorrow = dateKey === tomorrow.toISOString().slice(0, 10);

    let label: string;
    if (isToday) label = "TODAY";
    else if (isTomorrow) label = "TOMORROW";
    else label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    return { label, date: dateKey, events };
  });
}

export default function EconomicCalendar() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set(["TODAY", "TOMORROW"]));
  const [tick, setTick] = useState(0);

  // Fetch events
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await api.calendarEvents(7);
      setEvents(data.events || []);
      setLoading(false);
    };
    load();
    // Refresh every 5 min
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Tick countdowns every 30s
  useEffect(() => {
    const t = setInterval(() => setTick((p) => p + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const toggleDay = useCallback((label: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Next high-impact event for header badge
  const nextHighImpact = useMemo(() => {
    return events.find((e) => e.impact === "high" && !e.is_past);
  }, [events, tick]);

  const dayGroups = useMemo(() => groupByDay(events), [events]);

  if (loading && events.length === 0) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-40 mb-2" />
        <div className="space-y-2">
          <div className="h-6 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-6 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-6 bg-[var(--color-bg-hover)] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass rounded-lg overflow-hidden relative">
      {loading && events.length > 0 && <RefreshIndicator />}
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <Calendar className="w-4 h-4 text-[var(--color-neon-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Economic Calendar
        </h3>

        {/* Next high-impact countdown */}
        {nextHighImpact && (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-mono text-[var(--color-text-muted)]">
            <Zap className="w-3 h-3 text-red-400" />
            <span className="text-red-400">
              {nextHighImpact.title.length > 12
                ? nextHighImpact.title.slice(0, 12) + "…"
                : nextHighImpact.title}
            </span>
            {" "}
            <span className="text-[var(--color-text-secondary)]">
              {formatCountdown(nextHighImpact.countdown_seconds)}
            </span>
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto scrollbar-hide">
        {events.length === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)] text-center py-4">
            No events this week
          </div>
        ) : (
          dayGroups.map((group) => {
            const isExpanded = expandedDays.has(group.label);
            const highCount = group.events.filter((e) => e.impact === "high").length;
            const affectsActive = group.events.some((e) =>
              e.affects.includes(activeSymbol)
            );

            return (
              <div key={group.date}>
                {/* Day header */}
                <button
                  onClick={() => toggleDay(group.label)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]" />
                  )}
                  <span
                    className={`text-[12px] font-bold uppercase tracking-wider ${
                      group.label === "TODAY"
                        ? "text-[var(--color-neon-blue)]"
                        : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    {group.label}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                    {group.events.length} events
                  </span>
                  {highCount > 0 && (
                    <span className="text-[10px] px-1 rounded bg-red-500/15 text-red-400 font-mono">
                      {highCount} high
                    </span>
                  )}
                  {affectsActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-neon-blue)] ml-auto" />
                  )}
                </button>

                {/* Events */}
                {isExpanded && (
                  <div className="ml-2 space-y-0.5">
                    {group.events.map((event) => {
                      const affectsSymbol = event.affects.includes(activeSymbol);
                      const eventTime = new Date(event.datetime);

                      return (
                        <div
                          key={event.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded text-[12px] transition-colors ${
                            affectsSymbol
                              ? "bg-[var(--color-bg-secondary)]"
                              : "hover:bg-[var(--color-bg-hover)]"
                          } ${event.is_past ? "opacity-50" : ""}`}
                        >
                          {/* Time */}
                          <span className="text-[var(--color-text-muted)] font-mono w-[42px] shrink-0">
                            {eventTime.toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </span>

                          {/* Impact */}
                          <ImpactDot impact={event.impact} />

                          {/* Country flag + code */}
                          <span className="shrink-0 text-[11px]">
                            {currencyFlag(event.country)}
                          </span>

                          {/* Title */}
                          <span
                            className={`flex-1 truncate ${
                              event.impact === "high"
                                ? "text-[var(--color-text-primary)] font-semibold"
                                : "text-[var(--color-text-secondary)]"
                            }`}
                          >
                            {event.title}
                          </span>

                          {/* Forecast / Previous */}
                          {(event.forecast || event.previous) && (
                            <span className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] font-mono shrink-0">
                              {event.forecast && (
                                <span>F: {event.forecast}</span>
                              )}
                              {event.previous && (
                                <span>P: {event.previous}</span>
                              )}
                            </span>
                          )}

                          {/* Countdown for upcoming events */}
                          {!event.is_past && event.countdown_seconds < 7200 && (
                            <span className="text-[10px] font-mono text-[var(--color-neon-amber)] shrink-0 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {formatCountdown(event.countdown_seconds)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[var(--color-border-primary)]">
        <span className="text-[10px] text-[var(--color-text-muted)]">
          Data: Forex Factory · Updated every 5 min
        </span>
      </div>
    </div>
  );
}
