import type { Metadata } from "next";
import { Toaster } from "sonner";
import ThemeApplier from "@/components/ThemeApplier";
import "./globals.css";

export const metadata: Metadata = {
  title: "VISION — Smart Money Analytics",
  description: "Institutional flow detection for forex, gold, and crypto",
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
            __html: `(function(){try{var t=localStorage.getItem("vision_theme");if(t==="dark"){var d=document.documentElement;d.setAttribute("data-theme","dark");var v={"--color-bg-primary":"#060010","--color-bg-secondary":"#0a0014","--color-bg-card":"#060010","--color-bg-elevated":"#0e0820","--color-bg-hover":"#1c1530","--color-border-primary":"#1c1530","--color-border-accent":"rgba(139,92,246,0.2)","--color-border-glow":"rgba(139,92,246,0.5)","--color-neon-blue":"#a78bfa","--color-neon-cyan":"#c4b5fd","--color-neon-red":"#8b5cf6","--color-bull":"#10b981","--color-bear":"#8b5cf6","--color-neutral":"#a78bfa","--color-glass-from":"rgba(6,0,16,0.95)","--color-glass-to":"rgba(10,0,20,0.95)","--color-grid-line":"rgba(139,92,246,0.03)"};for(var k in v)d.style.setProperty(k,v[k])}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeApplier />
        {children}
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
