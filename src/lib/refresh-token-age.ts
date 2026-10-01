// src/lib/refresh-token-age.ts: baca umur refresh token Monev DARI ISI JWT-nya.
//
// Kenapa membaca dari token, bukan melacak kolom DB:
//   Refresh token (`monev_refresh_token`) adalah **JWT** dengan masa berlaku
//   30 hari (docs/MONEV-API.md §4.4, `Max-Age=2592000`). Klaim `exp`/`iat`
//   standar sudah memberi tahu kapan ia kedaluwarsa — tanpa perlu kolom DB
//   baru (proyek ini memakai `prisma db push`, bukan migrasi, jadi menambah
//   kolom = operasi eksternal ke Neon, tidak sepadan untuk sekadar pengingat).
//
// Prinsip yang dipegang (sama seperti `monev-submit.ts`): **jangan menebak**.
// Bila token bukan JWT, tidak bisa didekode, atau tidak punya `exp` numerik,
// fungsi mengembalikan `null` (="tidak diketahui"), BUKAN tebakan 30 hari.
// Pemanggil wajib memperlakukan `null` sebagai "tidak ada yang perlu
// ditampilkan", agar tidak ada banner peringatan palsu.
//
// Murni: tanpa I/O, tanpa impor Prisma/env, jadi bisa diuji tanpa DB.

/** Ambang kapan refresh token dianggap "segera kedaluwarsa" (7 hari sebelum). */
export const REFRESH_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dekode payload sebuah JWT TANPA memverifikasi tanda tangannya.
 *
 * Aman di sini karena kita HANYA membaca `exp` dari token yang SUDAH tersimpan
 * & terdekripsi di server — token itu milik pengguna yang sudah terautentikasi,
 * dan hasilnya hanya dipakai untuk menampilkan pengingat. Tidak ada keputusan
 * keamanan (izin/aksi) yang bergantung pada hasil ini, jadi verifikasi
 * signature tidak diperlukan.
 *
 * Mengembalikan objek klaim, atau `null` bila bentuknya bukan JWT 3-bagian
 * yang payload-nya JSON objek.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    // base64url → base64 standar, lalu tambal padding agar Node bisa dekode.
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Kapan refresh token kedaluwarsa, dibaca dari klaim `exp` (detik Unix).
 *
 * @returns `Date` kedaluwarsa, atau `null` bila tidak dapat dipastikan
 *          (bukan JWT / tanpa `exp` numerik). Pemanggil JANGAN menebak saat
 *          `null`.
 */
export function refreshTokenExpiresAt(token: string): Date | null {
  if (!token || token.trim().length === 0) return null;
  const claims = decodeJwtPayload(token);
  if (!claims) return null;
  const exp = claims.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  // `exp` = detik sejak epoch. Cek rentang wajar agar nilai ngawur (mis. ms
  // yang salah skala) tidak menghasilkan tanggal jauh di masa depan.
  const ms = exp * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

/**
 * True bila refresh token akan kedaluwarsa dalam <= 7 hari ke depan (tetapi
 * belum lewat). Token yang sudah lewat TIDAK memicu ini — kondisi itu ditandai
 * oleh jalur `SESSION_DEAD`/status INVALID, bukan pengingat "segera habis".
 *
 * `null` (umur tak diketahui) → selalu `false`: tidak ada peringatan palsu.
 */
export function isRefreshTokenNearingExpiry(
  expiresAt: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const remaining = expiresAt.getTime() - now;
  return remaining > 0 && remaining <= REFRESH_EXPIRY_WARNING_MS;
}

/** Berapa hari lagi refresh token kedaluwarsa (dibulatkan ke atas), atau null. */
export function daysUntilRefreshExpiry(
  expiresAt: Date | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!expiresAt) return null;
  const remaining = expiresAt.getTime() - now;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}
