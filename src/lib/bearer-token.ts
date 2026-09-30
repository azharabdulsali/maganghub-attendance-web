// src/lib/bearer-token.ts: pembaca rahasia dari header Authorization (murni).
//
// Kenapa ada: beberapa endpoint dijaga oleh rahasia bearer (`/api/cron/run-all`
// memakai `CRON_SECRET`, `/api/cron/submit` menerima `webhookKey`). Mengirim
// rahasia lewat header `Authorization: Bearer <token>` lebih baik daripada lewat
// query string, karena query string gampang tersimpan di log akses proxy/edge
// dan bocor lewat `Referer`.
//
// Fungsi di sini MURNI (hanya membaca string) sehingga bisa diuji tanpa server.

/**
 * Ambil token dari header `Authorization: Bearer <token>`.
 *
 * Mengembalikan `null` bila header tidak ada, bukan skema Bearer, atau tokennya
 * kosong. Perbandingan skema tidak peka huruf besar/kecil (RFC 7235).
 *
 * @param authorization nilai mentah header authorization (atau null).
 */
export function bearerTokenFrom(authorization: string | null): string | null {
  if (!authorization) return null;

  const prefix = "bearer ";
  if (!authorization.toLowerCase().startsWith(prefix)) return null;

  const token = authorization.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Ambil rahasia webhook cron dari sebuah permintaan.
 *
 * Prioritas (best practice + kompatibilitas mundur):
 *   1. `Authorization: Bearer <key>`, cara yang dianjurkan.
 *   2. `?key=<key>` di query string, cara lama, DIPERTAHANKAN agar cron yang
 *      sudah dipasang pengguna tetap jalan (deprecation bertahap, bukan
 *      pemutusan mendadak).
 *
 * Mengembalikan string kosong bila tidak ada di keduanya.
 *
 * @param authorization nilai header authorization (atau null).
 * @param url           URL permintaan penuh (untuk membaca `?key=`).
 */
export function cronKeyFromRequest(
  authorization: string | null,
  url: string,
): string {
  const fromHeader = bearerTokenFrom(authorization);
  if (fromHeader) return fromHeader;

  try {
    return new URL(url).searchParams.get("key")?.trim() ?? "";
  } catch {
    return "";
  }
}
