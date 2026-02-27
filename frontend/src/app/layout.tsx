import type { Metadata } from "next";
import { Toaster } from "sonner";
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
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
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
