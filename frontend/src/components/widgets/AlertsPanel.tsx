"use client";

import { memo, useEffect, useState, useCallback } from "react";
import { Bell, Plus, Trash2, X } from "lucide-react";
import { useMarketStore } from "@/stores/market";

interface Alert {
  id: number;
  symbol: string;
  condition: string;
  price: number;
  triggered: boolean;
  created_at: string;
}

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("vision_token") : null;
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function AlertsPanel() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const livePrices = useMarketStore((s) => s.livePrices);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [newCondition, setNewCondition] = useState<"above" | "below">("above");

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/alerts/", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : data.alerts || []);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAlerts();
    // Request notification permission
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [fetchAlerts]);

  // Check alerts against live price
  useEffect(() => {
    const lp = livePrices[activeSymbol];
    if (!lp) return;
    for (const alert of alerts) {
      if (alert.triggered || alert.symbol !== activeSymbol) continue;
      const triggered =
        (alert.condition === "above" && lp.price >= alert.price) ||
        (alert.condition === "below" && lp.price <= alert.price);
      if (triggered) {
        // Fire browser notification
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("VISION Alert", {
            body: `${alert.symbol} ${alert.condition === "above" ? "above" : "below"} ${alert.price.toFixed(2)}`,
            icon: "/icon.svg",
          });
        }
        // Mark as triggered locally
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, triggered: true } : a));
      }
    }
  }, [livePrices, activeSymbol, alerts]);

  const handleCreate = async () => {
    const price = parseFloat(newPrice);
    if (!price || price <= 0) return;
    try {
      const res = await fetch("/api/v1/alerts/", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ symbol: activeSymbol, condition: newCondition, price, alert_type: "price" }),
      });
      if (res.ok) {
        setNewPrice(""); setShowCreate(false);
        fetchAlerts();
      }
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/v1/alerts/${id}`, { method: "DELETE", headers: authHeaders() });
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch {}
  };

  const currentPrice = livePrices[activeSymbol]?.price;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-[var(--color-neon-amber)]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
            Price Alerts
          </span>
          {alerts.filter(a => !a.triggered).length > 0 && (
            <span className="px-1.5 py-0.5 text-[8px] font-bold rounded-full bg-[var(--color-neon-amber)]/15 text-[var(--color-neon-amber)]">
              {alerts.filter(a => !a.triggered).length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="p-1 rounded hover:bg-white/5 text-[var(--color-neon-blue)]"
        >
          {showCreate ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="flex items-center gap-1.5 p-2 rounded bg-[var(--color-bg-primary)]/50 border border-[var(--color-border-primary)]">
          <select
            value={newCondition}
            onChange={e => setNewCondition(e.target.value as "above" | "below")}
            className="px-1.5 py-1 text-[9px] font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] outline-none"
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
          <input
            type="number"
            value={newPrice}
            onChange={e => setNewPrice(e.target.value)}
            placeholder={currentPrice?.toFixed(2) || "Price"}
            className="flex-1 px-1.5 py-1 text-[9px] font-mono bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] outline-none"
            step={0.01}
          />
          <button
            onClick={handleCreate}
            className="px-2 py-1 text-[8px] font-bold rounded bg-[var(--color-neon-blue)] text-white"
          >
            Set
          </button>
        </div>
      )}

      {/* Alerts list */}
      {loading ? (
        <div className="h-12 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-[var(--color-neon-amber)]/30 border-t-[var(--color-neon-amber)] rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-[9px] text-[var(--color-text-muted)] text-center py-4">
          No alerts set. Click + to add one.
        </p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
          {alerts.map(a => (
            <div
              key={a.id}
              className={`flex items-center justify-between px-2 py-1.5 rounded text-[9px] font-mono ${
                a.triggered
                  ? "bg-[var(--color-neon-green)]/5 border border-[var(--color-neon-green)]/20"
                  : "bg-[var(--color-bg-primary)]/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${a.triggered ? "bg-[var(--color-neon-green)]" : "bg-[var(--color-neon-amber)] animate-pulse"}`} />
                <span className="text-[var(--color-text-secondary)]">{a.symbol}</span>
                <span className={a.condition === "above" ? "text-[var(--color-bull)]" : "text-[var(--color-bear)]"}>
                  {a.condition === "above" ? "≥" : "≤"} {a.price.toFixed(2)}
                </span>
              </div>
              <button onClick={() => handleDelete(a.id)} className="p-0.5 rounded hover:bg-white/5 text-[var(--color-text-muted)]">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(AlertsPanel);
