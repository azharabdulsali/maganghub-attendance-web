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
 * Email kontak publik untuk halaman /privacy dan /terms.
 *
 * Diisi dengan alamat asli pengelola proyek. Halaman privasi & syarat WAJIB
 * mencantumkan cara menghubungi pengelola, jadi konstanta ini tidak boleh
 * dikosongkan saat situs dipublikasikan.
 * Sengaja satu konstanta: cukup ubah di sini, halaman otomatis ikut terbarui.
 */
export const CONTACT_EMAIL = "azharabdulsali@gmail.com";

/** True bila CONTACT_EMAIL masih placeholder (dipakai untuk menyembunyikan UI). */
export const CONTACT_EMAIL_IS_PLACEHOLDER = CONTACT_EMAIL.startsWith("[");

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

/**
 * FAQ publik (lihat audit C-1 & O-5).
 *
 * Satu sumber kebenaran untuk dua pemakaian sekaligus:
 *  1. section "Pertanyaan yang sering diajukan" di landing page (/#faq);
 *  2. JSON-LD FAQPage yang dirender dari data yang SAMA.
 *
 * Ini disengaja: pedoman Google untuk FAQPage mengharuskan setiap pasangan
 * tanya-jawab di schema benar-benar TERLIHAT di halaman. Dengan memakai satu
 * array, mustahil schema dan tampilan jadi tidak sinkron.
 *
 * Aturan penulisan jawaban (lihat ai-writing-detection.md): kalimat lugas,
 * tanpa basa-basi "Tentu saja!"/"Tentu, kami senang membantu", tanpa em dash
 * dekoratif, dan menyebut batasan secara jujur. Semua jawaban hanya mengulang
 * fakta yang sudah ada di aplikasi: AES-256-GCM, tiga template, aturan >100
 * karakter, mode manual atau cron, dan REST API. TIDAK menyebut fitur yang
 * tidak ada (mis. AI, integrasi GitHub).
 */
export const FAQ_ITEMS: readonly { q: string; a: string }[] = [
  {
    q: "Apakah MagangHub mengisi laporan magang saya secara otomatis?",
    a: "Ya, tapi isinya tetap dari Anda. Anda menyiapkan tiga kolom template " +
      "(Uraian Aktivitas, Pembelajaran, dan Kendala) sekali, lalu aplikasi " +
      "mengirimkannya ke portal Monev atas jadwal atau lewat satu klik. " +
      "MagangHub tidak menulis laporan menggantikan Anda.",
  },
  {
    q: "Apakah kredensial Monev saya aman?",
    a: "Email dan password Monev disimpan terenkripsi dengan AES-256-GCM. " +
      "Kredensial tidak pernah disimpan dalam bentuk teks biasa dan tidak " +
      "pernah ikut terkirim di log maupun respons API.",
  },
  {
    q: "Apakah saya perlu memasang ekstensi browser atau aplikasi tambahan?",
    a: "Tidak. Pengiriman berjalan lewat REST API di server, jadi tidak ada " +
      "ekstensi browser, bot desktop, atau server tambahan yang perlu dipasang " +
      "di komputer Anda.",
  },
  {
    q: "Bisakah laporan dikirim otomatis tanpa saya buka aplikasinya?",
    a: "Bisa. Setelah template disiapkan, Anda dapat menyalakan jadwal otomatis " +
      "lewat cron sehingga laporan terkirim tiap sore, atau mengirim manual " +
      "satu klik saat Anda siap. Jadwal bisa dimatikan kapan saja.",
  },
  {
    q: "Apakah ada batasan minimum panjang laporan?",
    a: "Ada. Portal Monev menolak laporan yang terlalu singkat, jadi setiap " +
      "kolom wajib lebih dari 100 karakter. Aturan ini divalidasi di kode " +
      "aplikasi, bukan hanya diperingatkan di tampilan.",
  },
  {
    q: "Apa yang terjadi kalau portal Monev Kemnaker berubah?",
    a: "Karena pengiriman bergantung pada portal Monev, perubahan pada portal " +
      "bisa membuat pengiriman gagal. Bila itu terjadi, Anda tetap bisa " +
      "menyalin isi template dan mengirimnya manual dari situs Monev.",
  },
];

