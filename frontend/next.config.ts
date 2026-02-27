import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "standalone",
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
