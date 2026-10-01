// src/lib/submit-service.ts: orkestrasi kirim laporan (SPEC.md §10, §11B).
//
// Lapisan ini menyatukan tiga hal yang sebelumnya terpisah:
//   1. `decide()` (report-policy), boleh kirim hari ini?
//   2. `submitReport()` (monev-submit), kirim ke portal (menembak jaringan).
//   3. `SubmitLog`, catat tiap percobaan (tidak boleh ada submit tanpa log).
//
// Semua keputusan MURNI (boleh-kirim, bentuk payload, status log) dipisah ke
// fungsi kecil di bawah supaya bisa diuji tanpa jaringan/database. Yang
// menyentuh DB hanya `recordSubmitLog`, yang menyentuh portal hanya
// `submitReport` di monev-submit.

import { decide, type PolicyDecision, type PlainDate } from "./report-policy";
import type { ReportPayload } from "./monev-submit";

/**
 * Tanggal hari ini di zona Asia/Jakarta sebagai `YYYY-MM-DD`, MURNI.
 *
 * PENTING: jangan pakai `new Date().toISOString().slice(0,10)`. Itu memakai
 * UTC; di server UTC, jam 00:00–07:00 WIB masih tanggal kemarin → laporan
 * bisa tercatat di hari yang salah (report-policy.ts §"ANGGAPAN TANGGAL").
 * `Intl` dengan timeZone Jakarta menutup celah itu.
 */
export function todayInJakarta(now: Date = new Date()): PlainDate {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // en-CA → YYYY-MM-DD
}

/**
 * Ubah tanggal `YYYY-MM-DD` → `Date` pada tengah malam UTC, MURNI.
 *
 * Dipakai untuk kolom `Report.date` yang bertipe `@db.Date` (tanpa jam).
 * `new Date("2024-05-01")` di JS memang sudah diartikan sebagai 00:00 UTC, jadi
 * hasilnya sama di server zona mana pun, tidak seperti `new Date("2024-05-01
 * 00:00")` yang memakai zona setempat dan bisa bergeser sehari.
 *
 * Mengembalikan `null` untuk input yang tidak berbentuk `YYYY-MM-DD` (mis.
 * "2024-5-1" atau "besok") supaya pemanggil memutuskan fallback, bukan diam-
 * diam menyimpan tanggal rusak ke DB.
 */
export function plainDateToUtcDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Ubah `Date` (kolom `@db.Date`) → `YYYY-MM-DD`, MURNI. Kebalikan dari
 * `plainDateToUtcDate`, dan disengaja memakai `getUTC*`: kolom `@db.Date`
 * disimpan sebagai tengah malam UTC, jadi membaca komponen lokal akan
 * menggeser tanggalnya di server zona barat. Selalu UTC.
 */
export function toPlainDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Terjemahan keputusan policy → pesan Indonesia untuk UI. */
export function policyMessage(decision: PolicyDecision): string {
  switch (decision) {
    case "ALLOW":
      return "Hari kerja aktif, pengiriman diizinkan.";
    case "SKIPPED":
      return "Hari ini libur/akhir pekan, laporan dilewati (bukan error).";
    case "PROGRAM_ENDED":
      return "Program magang sudah berakhir, otomasi dihentikan.";
  }
}

/**
 * Peta `SubmitResult` (monev-submit) → nilai enum `SubmitStatus` (Prisma).
 * MURNI. ALREADY_SUBMITTED → DUPLICATE supaya audit log membedakan
 * "gagal mengirim" dari "sudah ada", keduanya bukan hal yang sama.
 */
export function submitStatusFor(
  result: { status: string },
): "SUCCESS" | "FAILED" | "DUPLICATE" {
  if (result.status === "SUCCESS") return "SUCCESS";
  if (result.status === "ALREADY_SUBMITTED") return "DUPLICATE";
  return "FAILED";
}

/**
 * Bentuk payload laporan dari template + tanggal target. MURNI.
 * Template sudah tervalidasi minimal 100 karakter saat disimpan, jadi di sini
 * tidak ada penilaian ulang, hanya perakitan.
 */
export function payloadFromTemplate(
  template: { activity: string; learning: string; obstacles: string },
  date: PlainDate,
): ReportPayload {
  return {
    activity: template.activity,
    learning: template.learning,
    obstacles: template.obstacles,
    date,
  };
}

/**
 * Keputusan lengkap sebelum menyentuh portal, MURNI.
 * Menggabungkan policy + kesiapan data (template & token) supaya route tidak
 * perlu menalar sendiri. `ready: false` → batal sebelum jaringan disentuh.
 */
export type SubmitReadiness =
  | { ready: true; date: PlainDate; decision: "ALLOW" }
  | { ready: false; reason: "POLICY_SKIPPED"; decision: "SKIPPED"; date: PlainDate }
  | {
      ready: false;
      reason: "PROGRAM_ENDED";
      decision: "PROGRAM_ENDED";
      date: PlainDate;
    }
  | { ready: false; reason: "NO_TEMPLATE"; date: PlainDate }
  | { ready: false; reason: "NO_TOKEN"; date: PlainDate };

export function assessReadiness(input: {
  date: PlainDate;
  hasTemplate: boolean;
  hasToken: boolean;
}): SubmitReadiness {
  const decision = decide(input.date);
  if (decision === "PROGRAM_ENDED") {
    return { ready: false, reason: "PROGRAM_ENDED", decision, date: input.date };
  }
  if (decision === "SKIPPED") {
    return { ready: false, reason: "POLICY_SKIPPED", decision, date: input.date };
  }
  if (!input.hasTemplate) {
    return { ready: false, reason: "NO_TEMPLATE", date: input.date };
  }
  if (!input.hasToken) {
    return { ready: false, reason: "NO_TOKEN", date: input.date };
  }
  return { ready: true, decision: "ALLOW", date: input.date };
}
