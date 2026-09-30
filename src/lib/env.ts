// src/lib/env.ts: validasi environment di satu tempat.
//
// Tujuan: kalau ada variabel yang lupa diisi, aplikasi GAGAL CEPAT dengan
// pesan jelas, bukan error aneh di tengah jalan (SPEC.md §9, §14 Tahap D).

import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL belum diisi"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL belum diisi"),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET harus minimal 32 karakter"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL harus berupa URL"),
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "ENCRYPTION_KEY harus 64 karakter hex (32 byte)",
    ),
  ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
  // Rahasia untuk dispatcher cron massal (GitHub Actions → /api/cron/run-all).
  // OPSIONAL: bila kosong, endpoint dispatcher menolak semua permintaan (503),
  // jadi aplikasi tetap jalan normal, hanya otomasi massal yang tak aktif.
  CRON_SECRET: z.string().min(16, "CRON_SECRET minimal 16 karakter").optional().or(z.literal("")),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Konfigurasi environment bermasalah:\n${detail}\n\nPeriksa .env.local Anda (lihat .env.example).`,
  );
}

export const env = parsed.data;

/** True bila email ini adalah admin pertama yang ditentukan pemilik. */
export function isAdminEmail(email: string): boolean {
  if (!env.ADMIN_EMAIL) return false;
  return email.trim().toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase();
}
