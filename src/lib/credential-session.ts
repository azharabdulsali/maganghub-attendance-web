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
import { encrypt, decrypt } from "./crypto";
import { ACCESS_TTL_MS } from "./credential-session-policy";
import {
  daysUntilRefreshExpiry,
  isRefreshTokenNearingExpiry,
  refreshTokenExpiresAt,
} from "./refresh-token-age";

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

/** Status umur refresh token, aman ditampilkan (tanpa token mentah). */
export type RefreshTokenHealth = {
  /** True bila baris kredensial punya refresh token tersimpan. */
  hasRefreshToken: boolean;
  /**
   * Kapan refresh token kedaluwarsa, bila dapat dibaca dari klaim JWT `exp`.
   * `null` = tidak dapat dipastikan (jangan menebak).
   */
  expiresAt: Date | null;
  /** True bila akan kedaluwarsa dalam <= 7 hari (dan belum lewat). */
  nearingExpiry: boolean;
  /** Sisa hari (dibulatkan ke atas), atau `null` bila tidak diketahui. */
  daysLeft: number | null;
};

/**
 * Baca umur refresh token milik `userId` DARI ISI JWT-nya (klaim `exp`).
 *
 * Kenapa di sini, bukan di kolom DB: lihat catatan di `refresh-token-age.ts`.
 * Refresh token didekripsi sesaat, dibaca `exp`-nya, lalu dilepas — nilai
 * token TIDAK pernah kembali ke pemanggil. Kegagalan apa pun (tidak ada token,
 * kunci berubah, bukan JWT) menghasilkan `expiresAt: null` = "tidak diketahui",
 * bukan lempar, supaya dashboard tetap bisa dirender.
 */
export async function refreshTokenHealth(
  userId: string,
): Promise<RefreshTokenHealth> {
  const row = await prisma.maganghubCredential.findUnique({
    where: { userId },
    select: {
      tokenCiphertext: true,
      tokenIv: true,
      tokenAuthTag: true,
    },
  });

  const hasRefreshToken = Boolean(
    row?.tokenCiphertext && row.tokenIv && row.tokenAuthTag,
  );
  if (!hasRefreshToken) {
    return {
      hasRefreshToken: false,
      expiresAt: null,
      nearingExpiry: false,
      daysLeft: null,
    };
  }

  let expiresAt: Date | null = null;
  try {
    // Dekripsi hanya untuk membaca klaim; token mentah tidak keluar dari sini.
    const token = decrypt({
      ciphertext: row!.tokenCiphertext!,
      iv: row!.tokenIv!,
      authTag: row!.tokenAuthTag!,
    });
    expiresAt = refreshTokenExpiresAt(token);
  } catch {
    // Kunci berubah / data rusak → jangan tebak, anggap tak diketahui.
    expiresAt = null;
  }

  return {
    hasRefreshToken: true,
    expiresAt,
    nearingExpiry: isRefreshTokenNearingExpiry(expiresAt),
    daysLeft: daysUntilRefreshExpiry(expiresAt),
  };
}
