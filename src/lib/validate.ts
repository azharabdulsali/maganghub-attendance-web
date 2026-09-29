// src/lib/validate.ts — skema validasi bersama (Zod).
//
// Ditaruh terpisah dari route supaya bisa diuji tanpa menjalankan server,
// dan supaya aturan yang sama dipakai form maupun API (SPEC.md §9 poin 5).

import { z } from "zod";
import { checkReportField } from "./report-rules";

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

/**
 * Token sesi Monev (`monev_refresh_token`) yang ditempel pengguna dari DevTools.
 * Berbentuk JWT: tiga segmen base64url dipisah titik. Kita TIDAK memverifikasi
 * tanda tangan di sini (hanya server Monev yang bisa) — sekadar memastikan
 * bentuknya masuk akal supaya salah tempel ketahuan lebih awal.
 */
export const monevTokenSchema = z
  .string()
  .trim()
  .min(20, "Token terlalu pendek — sepertinya bukan token yang benar")
  .max(4096, "Token terlalu panjang")
  .refine(
    (t) => t.split(".").length === 3 && t.split(".").every((p) => p.length > 0),
    "Token tidak berbentuk JWT (harus 3 bagian dipisah titik)",
  );

export type MonevTokenInput = z.infer<typeof monevTokenSchema>;

/**
 * Tiga template laporan harian. Portal Maganghub menuntut minimal 100 karakter
 * per field; angkanya diambil dari `report-rules.ts` supaya hanya ada satu
 * sumber kebenaran (bot Python memakai `len(value.strip()) < 100`).
 *
 * Ketiga field wajib: laporan dengan salah satu field kosong akan ditolak
 * portal, jadi lebih baik ditolak di sini dengan pesan yang jelas.
 */
export const reportTemplatesSchema = z.object({
  activity: z
    .string()
    .superRefine((teks, ctx) => {
      const pesan = checkReportField(teks);
      if (pesan) ctx.addIssue({ code: "custom", message: pesan });
    }),
  learning: z
    .string()
    .superRefine((teks, ctx) => {
      const pesan = checkReportField(teks);
      if (pesan) ctx.addIssue({ code: "custom", message: pesan });
    }),
  obstacles: z
    .string()
    .superRefine((teks, ctx) => {
      const pesan = checkReportField(teks);
      if (pesan) ctx.addIssue({ code: "custom", message: pesan });
    }),
});

export type ReportTemplatesInput = z.infer<typeof reportTemplatesSchema>;

/**
 * Pengaturan otomasi (AutomationConfig, SPEC.md §7). Zona waktu TIDAK
 * diserahkan ke klien — selalu "Asia/Jakarta" (server yang mengisi) supaya
 * jadwal tidak bisa disalah-set ke zona lain tanpa sengaja.
 */
export const automationSchema = z.object({
  isEnabled: z.boolean(),
  hour: z
    .number()
    .int("Jam harus bilangan bulat")
    .min(0, "Jam minimal 0")
    .max(23, "Jam maksimal 23"),
  minute: z
    .number()
    .int("Menit harus bilangan bulat")
    .min(0, "Menit minimal 0")
    .max(59, "Menit maksimal 59"),
});

export type AutomationInput = z.infer<typeof automationSchema>;
