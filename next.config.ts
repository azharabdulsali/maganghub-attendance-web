import type { NextConfig } from "next";
import path from "node:path";

import { securityHeaders } from "./src/lib/security-headers";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Batasi root Turbopack ke folder proyek ini. Tanpa ini, Next.js memindai
  // ke atas dan menemukan package-lock.json nyasar di C:\Users\HP, lalu
  // memperingatkannya di setiap start.
  turbopack: {
    root: path.join(__dirname),
  },

  // Header keamanan (SPEC.md §9 poin 4). Daftar header ada di
  // src/lib/security-headers.ts supaya bisa diuji terpisah.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(isDev),
      },
    ];
  },
};

export default nextConfig;

