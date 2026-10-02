// src/lib/token-input.ts: bersihkan & periksa tempelan token Monev (MURNI).
//
// Kenapa ada file ini: satu-satunya kesalahan yang paling sering dilakukan
// pengguna saat menempel `monev_refresh_token` adalah ikut menyalin bagian
// yang BUKAN nilainya. DevTools punya tombol "salin" di baris cookie, dan
// menyalin baris itu menghasilkan teks seperti:
//
//     monev_refresh_token=eyJhbGciOi....
//
// atau seluruh header:
//
//     Cookie: monev_refresh_token=eyJhbGciOi....
//
// Kalau teks mentah itu dikirim apa adanya, portal menolaknya → pengguna
// melihat "token tidak valid" dan menyangka tokennya salah, padahal hanya
// kelebihan awalan. Fungsi di sini memperbaiki itu secara otomatis dan
// memberi tahu BENTUK yang benar sebelum memanggil server (hemat rate limit
// dan memberi umpan balik instan).
//
// Prinsip yang sama seperti `refresh-token-age.ts`: **jangan menebak**. Kami
// hanya memangkas awalan yang dikenali dengan pasti; selain itu teks
// dikembalikan apa adanya (hanya di-trim) supaya tidak ada nilai yang rusak.

/** Hasil pembersihan tempelan: nilai token + apakah ada yang diubah. */
export type TokenCleanup = {
  /** Nilai yang sudah dipangkas dari awalan/nama cookie. */
  value: string;
  /** True bila input asli berbeda dari hasil (ada yang dibersihkan). */
  cleaned: boolean;
};

/**
 * Buang awalan yang sering ikut tersalin dari DevTools, tanpa menyentuh nilai
 * token itu sendiri:
 *
 * - `Cookie: ` / `Set-Cookie: ` (header) — case-insensitive.
 * - `monev_refresh_token=` (nama= nilai).
 * - `monev_refresh_token: ` (bentuk tabel). Hanya dipisah `:` bila TIDAK ada
 *   `=` di depannya, supaya nama cookie yang memang memuat `=` tetap utuh.
 * - spasi & baris baru di ujung (`.trim()`).
 *
 * Bila setelah pembersihan nilai kosong, `value` akan kosong dan pemanggil
 * memperlakukannya sebagai "belum diisi".
 */
export function cleanPastedToken(raw: string): TokenCleanup {
  const asli = raw.trim();
  let value = asli;

  // Buang awalan header cookie, mis. "Cookie: monev_refresh_token=...".
  value = value.replace(/^set-cookie:\s*/i, "");
  value = value.replace(/^cookie:\s*/i, "");
  value = value.trim();

  // Buang nama cookie bila diikuti pemisah `=` atau `:`.
  value = value.replace(/^monev_refresh_token\s*[:=]\s*/i, "");
  value = value.trim();

  // Buang tanda kutip pembungkus yang mungkin ikut tersalin.
  value = value.replace(/^"([^"]*)"$/, "$1").trim();

  return { value, cleaned: value !== asli };
}

/** Bentuk token Monev: JWT tiga bagian yang dipisah titik. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** True bila teks (setelah dibersihkan) berbentuk JWT tiga bagian. */
export function looksLikeRefreshToken(value: string): boolean {
  return JWT_SHAPE.test(value.trim());
}

/** True bila teks masih memuat sisa URL-encoding (mis. `%2E`) di nilai token. */
export function looksUrlEncoded(value: string): boolean {
  // Cari pola persen-hex. JWT base64url normal tidak memuat `%`.
  return /%[0-9A-Fa-f]{2}/.test(value);
}

/**
 * Periksa nilai token yang SUDAH dibersihkan dan kembalikan pesan bantuan
 * untuk pengguna, atau `null` bila bentuknya wajar (serahkan ke server).
 *
 * Dipakai untuk memberi umpan balik instan di klien sebelum `POST
 * /api/credentials/verify`. Pesannya sengaja mendorong satu tindakan konkret
 * (bukan "token tidak valid" yang buntu).
 */
export function describeTokenShapeProblem(value: string): string | null {
  const token = value.trim();
  if (token.length === 0) {
    return "Token belum diisi. Tempel nilai monev_refresh_token di kolom ini.";
  }
  if (looksUrlEncoded(token)) {
    return "Token masih dalam bentuk URL-encoded (ada tanda seperti %2E). " +
      "Centang Show URL-decoded di DevTools, lalu salin ulang nilainya.";
  }
  const parts = token.split(".");
  if (parts.length === 1) {
    return "Teks ini hanya satu bagian. Token Monev terdiri dari tiga bagian " +
      "dipisah titik — salin hanya nilai di kolom Value, bukan nama barisnya.";
  }
  if (parts.length !== 3) {
    return `Token ini terbagi menjadi ${parts.length} bagian, seharusnya 3 ` +
      "(dipisah titik). Periksa apakah salinan terpotong atau kelebihan.";
  }
  // Tiga bagian, tetapi ada karakter di luar base64url (mis. spasi di tengah).
  if (!looksLikeRefreshToken(token)) {
    return "Token memuat karakter yang tak diharapkan. Salin ulang hanya " +
      "nilai di kolom Value tanpa spasi atau tanda baca tambahan.";
  }
  return null;
}
