// src/lib/validate.ts — skema validasi bersama (Zod).
//
// Ditaruh terpisah dari route supaya bisa diuji tanpa menjalankan server,
// dan supaya aturan yang sama dipakai form maupun API (SPEC.md §9 poin 5).

import { z } from "zod";

/**
 * Kredensial portal Monev. Berbeda dari akun aplikasi ini, password Monev
 * TIDAK di-hash — harus bisa dipakai ulang untuk login ke portal itu, jadi
 * disimpan terenkripsi dua arah (AES-256-GCM), bukan satu arah.
 *
 * Batas panjang: cukup longgar untuk password nyata, cukup ketat untuk
 * mencegah data sampah.
 */
export const credentialsSchema = z.object({
  emailMonev: z
    .string()
    .trim()
    .toLowerCase()
    .email("Email Monev tidak valid")
    .max(200, "Email terlalu panjang"),
  passwordMonev: z
    .string()
    .min(1, "Password Monev wajib diisi")
    .max(200, "Password terlalu panjang"),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
