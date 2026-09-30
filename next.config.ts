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

  // Pengalihan rute lama → baru. Sejak perombakan struktur, halaman yang dulu
  // ada di bawah /dashboard/* dipindah ke rute root (/credentials, /history,
  // …). Daftar ini menjaga tautan/bookmark lama tetap hidup alih-alih 404.
  //
  // Catatan: /dashboard SENDIRI tetap ada (beranda setelah login), JANGAN
  // tambahkan pengalihan untuk "/dashboard" telanjang di sini.
  async redirects() {
    const moved: { from: string; to: string }[] = [
      { from: "/dashboard/credentials", to: "/credentials" },
      { from: "/dashboard/report-templates", to: "/report-templates" },
      { from: "/dashboard/history", to: "/history" },
      { from: "/dashboard/automation", to: "/automation" },
      { from: "/dashboard/profile", to: "/profile" },
      { from: "/dashboard/admin", to: "/admin" },
      { from: "/dashboard/dev-tools", to: "/dev-tools" },
    ];

    // `permanent: false` (307) sengaja dipilih: aplikasi belum publik, jadi
    // pengalihan sementara lebih aman: browser tidak meng-cache-nya keras
    // bila nanti rute ini diubah lagi. Kedua bentuk (dengan/tanpa sub-path)
    // dicakup lewat `:path*`.
    //
    // TODO(T-6, saat situs benar-benar publik): ubah ke `permanent: true` (308)
    // SETELAH struktur rute dianggap final. Redirect permanen di-cache keras
    // oleh browser dan mesin pencari, jadi salah flip saat rute masih bisa
    // berubah akan sulit ditarik kembali (pengguna bisa terjebak ke URL lama
    // berbulan-bulan). Jangan diubah hanya karena "kelihatannya sudah siap".
    return moved.flatMap(({ from, to }) => [
      { source: from, destination: to, permanent: false },
      { source: `${from}/:path*`, destination: `${to}/:path*`, permanent: false },
    ]);
  },
};

export default nextConfig;

