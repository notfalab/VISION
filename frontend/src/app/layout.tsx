import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import ThemeApplier from "@/components/ThemeApplier";
import "./globals.css";

export const metadata: Metadata = {
  title: "VISION — Smart Money Analytics",
  description: "Institutional flow detection for forex, gold, and crypto",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Inline script to set theme before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("vision_theme");if(t==="night"){var d=document.documentElement;d.setAttribute("data-theme","night");var v={"--color-bg-primary":"#000000","--color-bg-secondary":"#050505","--color-bg-card":"#080808","--color-bg-elevated":"#0e0e0e","--color-bg-hover":"#151515","--color-border-primary":"#1a1a1a","--color-border-accent":"rgba(255,255,255,0.06)","--color-border-glow":"rgba(255,255,255,0.12)","--color-text-primary":"#d4d4d8","--color-text-secondary":"#7a7a82","--color-text-muted":"#505058","--color-neon-blue":"#3b82f6","--color-neon-cyan":"#22d3ee","--color-neon-red":"#ef4444","--color-neon-green":"#10b981","--color-neon-amber":"#f59e0b","--color-neon-purple":"#8b5cf6","--color-bull":"#10b981","--color-bear":"#ef4444","--color-neutral":"#6366f1","--color-glass-from":"rgba(0,0,0,0.97)","--color-glass-to":"rgba(5,5,5,0.97)","--color-grid-line":"rgba(255,255,255,0.015)"};for(var k in v)d.style.setProperty(k,v[k])}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeApplier />
        {children}
        <Analytics />
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "rgba(15, 15, 20, 0.95)",
              border: "1px solid rgba(100, 200, 255, 0.15)",
              color: "#e0e0e0",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
            },
          }}
          richColors
        />
      </body>
    </html>
  );
}
