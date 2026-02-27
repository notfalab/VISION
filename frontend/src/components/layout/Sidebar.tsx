"use client";

import {
  BarChart3,
  LineChart,
  Shield,
  Waves,
  Wallet,
  Settings,
  TrendingUp,
} from "lucide-react";

const NAV_ITEMS = [
  { icon: BarChart3, label: "Dashboard", id: "dashboard" },
  { icon: LineChart, label: "Charts", id: "charts" },
  { icon: TrendingUp, label: "Indicators", id: "indicators" },
  { icon: Waves, label: "Order Flow", id: "orderflow" },
  { icon: Wallet, label: "On-Chain", id: "onchain" },
  { icon: Shield, label: "Risk", id: "risk" },
];

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="w-14 flex flex-col items-center py-3 gap-1 border-r border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      {NAV_ITEMS.map(({ icon: Icon, label, id }) => {
        const isActive = activeView === id;
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            title={label}
            className={`
              w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200
              ${
                isActive
                  ? "bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)] glow-blue"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              }
            `}
          >
            <Icon className="w-5 h-5" />
          </button>
        );
      })}
      <div className="flex-1" />
      <button
        title="Settings"
        className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-all"
      >
        <Settings className="w-5 h-5" />
      </button>
    </aside>
  );
}
