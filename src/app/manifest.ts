// src/app/manifest.ts: web app manifest (audit T-5).
//
// Efek praktisnya: saat pengguna "Tambahkan ke Layar Utama" di Android, situs
// muncul sebagai aplikasi dengan nama, ikon, dan warna tema yang benar — bukan
// pintasan generik berjudul URL. Di sisi SEO, manifest juga membantu Google
// menampilkan nama situs yang konsisten.
//
// Ikon sengaja memakai rute yang SUDAH ada (`/apple-icon`, rute ImageResponse
// 180x180) supaya tidak menambah aset biner baru. Kalau nanti ikon diperbarui,
// cukup ubah apple-icon.tsx dan manifest ikut berubah.

import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Otomatisasi Presensi & Laporan Magang`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#5294ff",
    lang: "id",
    icons: [
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
