import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Batasi root Turbopack ke folder proyek ini. Tanpa ini, Next.js memindai
  // ke atas dan menemukan package-lock.json nyasar di C:\Users\HP, lalu
  // memperingatkannya di setiap start.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
