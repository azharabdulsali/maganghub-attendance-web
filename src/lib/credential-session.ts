// src/lib/credential-session.ts: simpan sesi Monev hasil login otomatis.
//
// Dipakai oleh POST /api/credentials/login setelah runLoginFlow berhasil.
// Dipisah dari route supaya bisa diuji tanpa menjalankan server.
//
// Dua jenis token disimpan, keduanya terenkripsi AES-256-GCM dan di KOLOM
// TERPISAH (jangan campur dengan password):
//   - refresh token (`tokenCiphertext`), sesi 30 hari, cookie monev_refresh_token.
//     Hanya ada bila portal mengirimkannya saat callback.
//   - access token (`accessCiphertext`), Bearer 6 jam, dipakai untuk submit.
//     Umur disimpan di `accessExpiresAt` supaya bisa tahu kapan kedaluwarsa.
//
// ATURAN: fungsi di sini hanya mengembalikan status ringkas (ada/tidak),
// TIDAK pernah token mentah.

import { prisma } from "./prisma";
import { encrypt } from "./crypto";
import { ACCESS_TTL_MS } from "./credential-session-policy";

/** Ringkasan yang aman dikembalikan ke klien (tanpa token apa pun). */
export type SaveLoginResult = {
  /** True bila refresh token (30 hari) juga tersimpan. */
  hasRefreshToken: boolean;
  /** Selalu true bila fungsi ini sukses, access token pasti tersimpan. */
  hasAccessToken: boolean;
  /** Kapan access token diperkirakan kedaluwarsa. */
  accessExpiresAt: Date;
};

/**
 * Simpan hasil login otomatis ke kredensial milik `userId`.
 *
 * Wajib sudah ada baris kredensial (dibuat oleh PUT /api/credentials).
 * Bila belum ada, ini kesalahan program, lempar, jangan diam-diam membuat.
 */
export async function saveLoginSession(
  userId: string,
  tokens: { accessToken: string; refreshToken?: string },
): Promise<SaveLoginResult> {
  const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const access = encrypt(tokens.accessToken);

  // Refresh token bersifat opsional: kalau tidak ada, kolom token lama
  // DIBIARKAN apa adanya (jangan dihapus), mungkin masih valid 30 hari.
  const refresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

  const saved = await prisma.maganghubCredential.update({
    where: { userId },
    data: {
      accessCiphertext: access.ciphertext,
      accessIv: access.iv,
      accessAuthTag: access.authTag,
      accessExpiresAt,
      // Status naik ke ACTIVE: login otomatis berhasil = sesi terbukti hidup.
      status: "ACTIVE",
      ...(refresh
        ? {
            tokenCiphertext: refresh.ciphertext,
            tokenIv: refresh.iv,
            tokenAuthTag: refresh.authTag,
          }
        : {}),
    },
    // Baca ulang kolom token dalam satu operasi: nilai akhirnya mencerminkan
    // token baru (bila ada) ATAU token lama yang sengaja dibiarkan.
    select: { tokenCiphertext: true },
  });

  return {
    hasRefreshToken: Boolean(saved.tokenCiphertext),
    hasAccessToken: true,
    accessExpiresAt,
  };
}
