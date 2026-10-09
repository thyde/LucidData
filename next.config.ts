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
  // LD-609: shared code lives in packages/core and ships as TypeScript source.
  transpilePackages: ["@luciddata/core"],
  experimental: {
    serverActions: {
      // A password change re-wraps every entry's data key in one request, about
      // 300 bytes an entry. The default 1 MB stops near 3,400 entries; 4 MB,
      // under Vercel's 4.5 MB request limit, reaches about 13,900.
      bodySizeLimit: "4mb",
    },
  },
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
      {
        // LD-305: a shared health summary. Its key is in the fragment, which
        // never leaves the browser; these keep the page itself out of caches,
        // search results, and other sites' logs.
        source: "/share/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
