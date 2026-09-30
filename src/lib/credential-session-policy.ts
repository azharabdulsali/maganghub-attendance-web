// src/lib/credential-session-policy.ts: konstanta MURNI sesi login Monev.
//
// Dipisah dari `credential-session.ts` (yang menyentuh Prisma) supaya bisa
// diuji tanpa env/DB, mengikuti pola report-policy vs report yang sudah ada.
// Tidak ada impor Prisma/env di sini.

/**
 * Umur access token menurut dokumentasi (§4.0): 6 jam.
 *
 * Dipakai untuk menghitung `accessExpiresAt` saat menyimpan sesi. Jangan
 * menebak umur dari cookie, portal tidak menjanjikan bentuknya.
 */
export const ACCESS_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * True bila access token tersimpan masih layak dipakai untuk submit.
 *
 * Memberi margin 1 menit: token yang tinggal < 1 menit dianggap TIDAK segar,
 * supaya kita tidak memulai pengiriman dengan token yang bisa kedaluwarsa di
 * tengah jalan (submit = beberapa panggilan jaringan).
 *
 * Ini murni (tanpa I/O), jadi bisa diuji tanpa DB, lihat file .test di sebelah.
 */
export function isAccessTokenFresh(
  expiresAt: Date | null | undefined,
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() > 60_000;
}
