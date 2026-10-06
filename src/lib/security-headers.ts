// src/lib/security-headers.ts: header keamanan HTTP (SPEC.md §9 poin 4).
//
// Dipisah dari `next.config.ts` supaya bisa diuji tanpa membangun Next, dan
// supaya ada SATU sumber kebenaran untuk daftar header. `next.config.ts`
// mengimpornya untuk `headers()`.
//
// Catatan kejujuran: header ini mitigasi berlapis, bukan pengganti sanitasi
// input (sudah ada Zod) atau enkripsi kredensial (sudah ada AES-GCM).

/** Header statis yang sama untuk semua respons. */
export const SECURITY_HEADERS: Record<string, string> = {
  // Jangan biarkan browser menebak tipe konten, mencegah serangan MIME sniff.
  "X-Content-Type-Options": "nosniff",

  // Larang situs ini dibingkai (anti-clickjacking). SPEC §9 poin 4.
  "X-Frame-Options": "DENY",

  // Kirim origin saja saat menyeberang; jangan bocorkan path/query ke situs luar.
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Batasi API browser yang tak dipakai aplikasi ini.
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",

  // Batasi kemampuan warisan (Flash/PDF lama).
  "X-Permitted-Cross-Domain-Policies": "none",
};

/**
 * HSTS hanya dikirim di produksi. Mengirimnya saat dev (http://localhost) bisa
 * membuat browser "mengingat" https untuk localhost dan menyulitkan pengembangan.
 */
export const HSTS_HEADER_VALUE =
  "max-age=63072000; includeSubDomains; preload";

/**
 * Domain intake Vercel Web Analytics (`<Analytics />`).
 *
 * Kenapa ada: saat di-deploy ke Vercel, skrip `/_vercel/insights/script.js`
 * (same-origin, jadi sudah tercakup `'self'`) MENGIRIM data ke endpoint
 * `vitals.vercel-insights.com`. Tanpa menambahkannya ke `connect-src`, browser
 * memblokir pengiriman dan dasbor Analytics tetap kosong meski skrip terpasang.
 *
 * Kalau nanti beralih ke Vercel Speed Insights, domain tambahannya
 * `vitals.vercel-insights.com` (sama) — cukup pakai konstanta ini.
 *
 * Catatan privasi: ini satu-satunya koneksi keluar yang kita izinkan, dan itu
 * keputusan sadar (lihat README → "Analytics").
 */
export const VERCEL_ANALYTICS_CONNECT_SRC = "https://vitals.vercel-insights.com";

/**
 * Content-Security-Policy.
 *
 * Ini CSP yang "ketat tapi masih bisa jalan" untuk Next.js:
 *   - `default-src 'self'`        → hanya sumber sendiri, kecuali dikecualikan.
 *   - `script-src`               → 'unsafe-inline' DIPERLUKAN Next untuk
 *                                  bootstrap; tanpa itu app tidak render.
 *                                  'unsafe-eval' hanya di dev (react-refresh).
 *   - `style-src 'unsafe-inline'` → Tailwind/style dinamis Next.
 *   - `connect-src`              → 'self' + endpoint Vercel Analytics
 *                                  (`VERCEL_ANALYTICS_CONNECT_SRC`). Satu-satunya
 *                                  koneksi keluar yang diizinkan aplikasi.
 *   - `frame-ancestors 'none'`   → pengganti modern X-Frame-Options.
 *   - `object-src 'none'`        → larang plugin.
 *   - `base-uri 'self'`          → cegah pembajakan <base>.
 *   - `form-action 'self'`       → form hanya boleh kirim ke diri sendiri.
 *
 * Sengaja TIDAK memakai `upgrade-insecure-requests` di dev agar localhost http
 * tetap bisa diuji.
 */
export function buildContentSecurityPolicy(isDev: boolean): string {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${VERCEL_ANALYTICS_CONNECT_SRC}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Susun daftar header lengkap untuk satu respons.
 *
 * @param isDev  true saat `NODE_ENV !== "production"`.
 */
export function securityHeaders(isDev: boolean): { key: string; value: string }[] {
  const headers = Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
    key,
    value,
  }));

  headers.push({
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy(isDev),
  });

  if (!isDev) {
    headers.push({ key: "Strict-Transport-Security", value: HSTS_HEADER_VALUE });
  }

  return headers;
}
