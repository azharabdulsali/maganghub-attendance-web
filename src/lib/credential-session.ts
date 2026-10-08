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

/**
 * Simpan `monev_refresh_token` BARU hasil rotasi (mis. dari `POST /auth/refresh`
 * atau alur lain), menggantikan token lama.
 *
 * Kenapa perlu: portal mengganti nilai `monev_refresh_token` setiap kali refresh
 * sukses; token lama dicabut server. Kalau token baru tidak disimpan, refresh
 * berikutnya memakai token mati → `401` palsu lalu pengguna dipaksa login ulang.
 *
 * HANYA menyentuh kolom token refresh; status & access token TIDAK diubah
 * (token baru ini tidak membuktikan sesi ACTIVE — itu tugas pemanggil).
 * Mengembalikan `true` bila berhasil. Kegagalan DB ditelan (dilaporkan `false`),
 * bukan dilempar: kegagalan menyimpan rotasi tak boleh menggagalkan pengiriman
 * laporan yang mungkin sudah sukses.
 */
export async function persistRotatedRefreshToken(
  userId: string,
  refreshToken: string,
): Promise<boolean> {
  if (!refreshToken || refreshToken.trim().length === 0) return false;
  try {
    const enc = encrypt(refreshToken);
    await prisma.maganghubCredential.update({
      where: { userId },
      data: {
        tokenCiphertext: enc.ciphertext,
        tokenIv: enc.iv,
        tokenAuthTag: enc.authTag,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pilih refresh token mana yang WAJIB disimpan setelah sebuah uji/tukar sesi.
 *
 * Konteks (rotasi, docs/MONEV-API.md §4.1): `POST /auth/refresh` yang sukses
 * mengganti `monev_refresh_token` DAN mencabut yang lama. Saat pengguna menempel
 * token lalu kita mengujinya, `pastedToken` (tempelan) sudah MATI begitu portal
 * merotasi. Karena itu token hasil rotasi (`rotatedToken`) harus menang — tanpa
 * ini, kita menimpa token hidup dengan token mati (bug "rotasi terbalik").
 *
 * Murni & total: tidak menyentuh jaringan/DB, selalu mengembalikan string.
 */
export function pickRefreshTokenToPersist(
  rotatedToken: string | null | undefined,
  pastedToken: string,
): string {
  const rotated = rotatedToken?.trim();
  return rotated && rotated.length > 0 ? rotated : pastedToken;
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
