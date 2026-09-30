// src/lib/site.ts: konfigurasi SEO di satu tempat.
//
// Semua metadata (canonical, Open Graph, sitemap, robots) butuh URL absolut.
// Sumbernya SATU: NEXTAUTH_URL, yang sudah wajib diisi (lihat src/lib/env.ts).
// Sengaja TIDAK menambah env baru supaya tidak ada variabel yang bisa lupa
// diisi saat deploy; NEXTAUTH_URL selalu ada karena login membutuhkannya.
//
// Dipisah dari env.ts agar berkas ini bisa diimpor oleh sitemap.ts/robots.ts
// (yang dievaluasi saat build) tanpa memicu validasi env yang berat.

import { env } from "./env";

/** Nama merek yang dipakai konsisten di title, OG, dan schema (lihat audit C-3). */
export const SITE_NAME = "MagangHub";

/** Origin absolut tanpa garis miring di akhir, mis. "https://maganghub.vercel.app". */
export const SITE_URL = env.NEXTAUTH_URL.replace(/\/$/, "");

/** Judul default (50-60 karakter, kata kunci di depan). */
export const SITE_TITLE =
  "MagangHub Autoabsen — Otomatisasi Presensi & Laporan Magang";

/**
 * Deskripsi default (150-160 karakter). Mengandung kata kunci "magang
 * Kemnaker" dan ajakan bertindak, sesuai temuan audit O-2.
 */
export const SITE_DESCRIPTION =
  "Kirim absensi & laporan Monev MagangHub Kemnaker otomatis dari template " +
  "Anda. Tanpa browser, tanpa ketik ulang, kredensial terenkripsi AES-256.";

/** URL absolut dari sebuah path relatif ("/" → origin + "/"). */
export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
