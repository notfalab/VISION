import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // output: "standalone" is only needed for Docker; Vercel handles its own build
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  async rewrites() {
    if (!isProd) {
      // Dev: proxy to local backend
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

    // Vercel production: proxy API calls to Railway backend
    const rawBackendUrl = process.env.API_BACKEND_URL;
    if (rawBackendUrl) {
      // Ensure URL has protocol (fixes "destination does not start with https://" error)
      const backendUrl = rawBackendUrl.startsWith("http")
        ? rawBackendUrl
        : `https://${rawBackendUrl}`;
      return [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
        {
          source: "/health",
          destination: `${backendUrl}/health`,
        },
      ];
    }

    // Docker production: nginx handles the proxying
    return [];
  },
};

export default nextConfig;
