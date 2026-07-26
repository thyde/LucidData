import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    const headers = [
      {
        key: "X-DNS-Prefetch-Control",
        value: "on",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "origin-when-cross-origin",
      },
    ];

    // In development, allow cross-origin requests for local network access
    if (process.env.NODE_ENV === 'development') {
      headers.push({
        key: "Access-Control-Allow-Origin",
        value: "*",
      });
    } else {
      // Production: strict frame options
      headers.push({
        key: "X-Frame-Options",
        value: "SAMEORIGIN",
      });
    }

    return [
      {
        source: "/:path*",
        headers,
      },
    ];
  },
};

export default withSerwist(nextConfig);
