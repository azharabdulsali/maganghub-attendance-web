// src/lib/validate.ts: skema validasi bersama (Zod).
//
// Ditaruh terpisah dari route supaya bisa diuji tanpa menjalankan server,
// dan supaya aturan yang sama dipakai form maupun API (SPEC.md §9 poin 5).

import { z } from "zod";
import { checkReportField } from "./report-rules";
import { isPlainDate } from "./report-policy";

/**
 * Kredensial portal Monev. Berbeda dari akun aplikasi ini, password Monev
 * TIDAK di-hash, harus bisa dipakai ulang untuk login ke portal itu, jadi
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
 * tanda tangan di sini (hanya server Monev yang bisa), sekadar memastikan
 * bentuknya masuk akal supaya salah tempel ketahuan lebih awal.
 */
export const monevTokenSchema = z
  .string()
  .trim()
  .min(20, "Token terlalu pendek, sepertinya bukan token yang benar")
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
 * Template laporan untuk SATU tanggal tertentu (penimpa template harian).
 *
 * Tiga kolomnya memakai aturan yang SAMA PERSIS dengan template harian
 * (`reportTemplatesSchema`), portal tidak membedakan asal template, jadi
 * syarat 100–5000 karakter juga sama. Yang ditambah hanya `date`.
 *
 * Tanggal divalidasi dua lapis:
 *   - bentuk `YYYY-MM-DD` lewat regex, lalu
 *   - keberadaan tanggalnya lewat `isPlainDate` (menolak 2026-02-30 dan
 *     2026-13-01 yang lolos regex tapi bukan tanggal nyata).
 *
 * Sengaja TIDAK menolak tanggal yang jatuh pada hari libur: menyimpan template
 * untuk Sabtu itu sah dan berguna (mis. agenda khusus), hanya saja otomasi
 * tidak akan mengirim di hari itu. Aturan libur tetap di report-policy.ts.
 */
export const datedReportTemplateSchema = reportTemplatesSchema.extend({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD.")
    .refine(isPlainDate, "Tanggal itu tidak ada di kalender."),
});

export type DatedReportTemplateInput = z.infer<typeof datedReportTemplateSchema>;

/**
 * Input untuk menyusun DRAF laporan (tombol "Susun dengan Bantuan").
 *
 * Berbeda dari `reportTemplatesSchema` yang memvalidasi teks jadi: di sini yang
 * masuk adalah BAHAN (kata kunci & konteks), bukan laporan final. Karena itu
 * batas 100 karakter TIDAK berlaku di sini, kalau berlaku, pengguna tidak akan
 * pernah bisa memakai kata kunci pendek seperti "rapat mingguan".
 *
 * Panjang dibatasi supaya kata kunci tidak dipakai sebagai jalur menyuntik teks
 * panjang; hitungan draf final tetap diverifikasi ulang di `report-draft.ts`.
 */
export const reportDraftSchema = z.object({
  keywords: z
    .string()
    .trim()
    .max(300, "Kata kunci terlalu panjang (maksimal 300 karakter)."),
  unit: z
    .string()
    .trim()
    .max(120, "Nama unit terlalu panjang (maksimal 120 karakter).")
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD.")
    .optional(),
});

export type ReportDraftInput = z.infer<typeof reportDraftSchema>;

/**
 * Pengaturan otomasi (AutomationConfig, SPEC.md §7). Zona waktu TIDAK
 * diserahkan ke klien, selalu "Asia/Jakarta" (server yang mengisi) supaya
 * jadwal tidak bisa disalah-set ke zona lain tanpa sengaja.
 *
 * `action` opsional menentukan niat:
 *   - tidak ada / "save"   → simpan biasa; `webhookKey` lama DIPERTAHANKAN.
 *   - "rotate-key"         → terbitkan `webhookKey` BARU dengan sengaja.
 *
 * Rotasi dibuat eksplisit (bukan otomatis) karena mengganti kunci akan
 * mematikan cron yang sudah dipasang pengguna secara diam-diam. Hanya tindakan
 * sadar pengguna yang boleh melakukannya.
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
  action: z.enum(["save", "rotate-key"]).optional(),
});

export type AutomationInput = z.infer<typeof automationSchema>;

/**
 * Profil akun aplikasi ini (bukan akun Monev). Saat ini hanya `name` yang boleh
 * diubah pengguna; email adalah identitas login dan peran ditentukan server,
 * jadi keduanya TIDAK diterima dari klien di sini.
 *
 * `name` boleh dikosongkan (kirim string kosong) untuk menghapus nama, UI akan
 * menampilkan "Pengguna" sebagai gantinya. Batas 80 karakter sudah lebih dari
 * cukup untuk nama orang dan mencegah data sampah.
 */
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .max(80, "Nama maksimal 80 karakter"),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * Ubah kata sandi akun aplikasi ini, dilakukan **dalam sesi** (pengguna sudah
 * login), tanpa email/token reset (C-13). Karena tidak ada verifikasi email,
 * keamanannya bersandar pada: (a) sesi yang sah, dan (b) pembuktian kata sandi
 * lama. Ketiganya divalidasi di server sebelum menyentuh DB.
 *
 * Aturan:
 *   - `newPassword` minimal 8 karakter, sama seperti pendaftaran & login.
 *   - `confirmPassword` harus sama dengan `newPassword`, mencegah salah ketik
 *     yang akan mengunci pengguna dari akunnya sendiri (tidak ada email untuk
 *     memulihkan).
 *   - Kata sandi baru TIDAK boleh sama dengan yang lama (tidak ada gunanya
 *     "mengganti" ke nilai yang sama).
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Kata sandi saat ini wajib diisi")
      .max(200, "Kata sandi terlalu panjang"),
    newPassword: z
      .string()
      .min(8, "Kata sandi baru minimal 8 karakter")
      .max(200, "Kata sandi terlalu panjang"),
    confirmPassword: z.string().min(1, "Konfirmasi kata sandi wajib diisi"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Konfirmasi kata sandi tidak cocok",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "Kata sandi baru harus berbeda dari yang lama",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Ubah email akun aplikasi ini, perubahan **paling sensitif** di aplikasi ini,
 * karena email adalah (a) identitas login DAN (b) penentu peran admin
 * (`isAdminEmail` di lib/env.ts). Karena tidak ada verifikasi email maupun
 * pemulihan akun, satu salah ketik bisa mengunci pengguna dari akunnya sendiri
 * secara permanen. Maka:
 *
 *   - `newEmail` wajib format email yang sah. Normalisasi (trim + lowercase)
 *     dilakukan di route sebelum dibandingkan/disimpan, konsisten dengan jalur
 *     login & pendaftaran agar satu email tidak bisa punya dua ejaan.
 *   - `currentPassword` wajib: membuktikan pemilik sesi memang tahu kata
 *     sandinya. Tanpa ini, siapa pun yang menemukan perangkat tak terkunci bisa
 *     menyerahkan akun dengan mengubah emailnya.
 *   - Peran admin TIDAK pernah diberikan lewat sini. Route menolak bila email
 *     baru sama dengan `ADMIN_EMAIL` dari pengguna non-admin (lihat route),
 *     sehingga jalur ini tidak bisa jadi eskalasi hak akses.
 */
export const changeEmailSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .min(1, "Email baru wajib diisi")
    .max(200, "Email terlalu panjang")
    .email("Email tidak valid"),
  currentPassword: z
    .string()
    .min(1, "Kata sandi saat ini wajib diisi")
    .max(200, "Kata sandi terlalu panjang"),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

