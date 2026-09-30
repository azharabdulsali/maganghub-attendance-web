// src/lib/crypto.ts: enkripsi kredensial Monev dengan AES-256-GCM.
//
// Kenapa GCM (bukan CBC)? GCM memberi *authenticated encryption*: kalau data
// diubah orang lain, dekripsi GAGAL, bukan menghasilkan teks sampah. Untuk
// kredensial orang lain, "gagal keras" jauh lebih aman daripada "diam-diam
// salah" (SPEC.md §5.1).
//
// Format: IV 12 byte acak + auth tag 16 byte, ciphertext disimpan terpisah
// di kolom-kolom tabel maganghub_credentials.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bit, panjang IV yang disarankan untuk GCM
const AUTH_TAG_BYTES = 16;

/** Kunci 32 byte dari ENCRYPTION_KEY (hex 64 karakter). */
function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Enkripsi teks biasa (mis. password Monev).
 * IV selalu baru setiap panggilan, ini wajib untuk GCM: memakai ulang IV
 * dengan kunci sama akan menghancurkan keamanannya.
 */
export function encrypt(plaintext: string): EncryptedPayload {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Dekripsi. Melempar error bila data/authTag diubah, jangan pernah
 * menelan error ini dan mengembalikan teks kosong, karena itu menyamarkan
 * kerusakan data sebagai "kredensial kosong".
 */
export function decrypt(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(), // melempar error kalau auth tag tidak cocok
  ]);

  return plaintext.toString("utf8");
}

/** Perbandingan aman terhadap timing attack (untuk verifikasi rahasia). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const CRYPTO_CONSTANTS = {
  ALGORITHM,
  IV_BYTES,
  AUTH_TAG_BYTES,
} as const;
