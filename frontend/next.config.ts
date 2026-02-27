import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // output: "standalone" is only needed for Docker; Vercel handles its own build
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  async rewrites() {
    // In development, proxy API calls to the backend
    // In production, nginx handles the proxying
    if (!isProd) {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:8000/api/:path*",
        },
        {
          source: "/ws/:path*",
          destination: "http://localhost:8000/ws/:path*",
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
