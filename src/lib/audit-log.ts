// src/lib/audit-log.ts — penampil audit log submit (murni, tanpa DB/jaringan).
//
// Halaman riwayat (src/app/dashboard/history/page.tsx) menyerahkan baris
// SubmitLog mentah ke fungsi-fungsi di sini. Tujuannya sama seperti modul murni
// lain (submit-service, report-policy): keputusan tampilan diuji tanpa DB.
//
// Tidak ada rahasia di sini — audit log hanya memuat status, pesan, tanggal.

import type { SubmitStatus, TriggerType } from "@/generated/prisma/enums";

/** Warna badge per status. Dipetakan ke kelas Tailwind, bukan enum Prisma. */
export type BadgeVariant = "success" | "failure" | "warning";

/**
 * Deskripsi manusia untuk tiap `SubmitStatus`. Selalu ada nilai balik agar UI
 * tidak pernah menampilkan enum mentah ke pengguna.
 */
export function describeSubmitStatus(status: SubmitStatus): string {
  switch (status) {
    case "SUCCESS":
      return "Terkirim";
    case "DUPLICATE":
      return "Sudah ada";
    case "FAILED":
      return "Gagal";
    default:
      return "Tidak diketahui";
  }
}

/** Warna badge: hijau (sukses), kuning (duplikat/netral), merah (gagal). */
export function badgeVariant(status: SubmitStatus): BadgeVariant {
  switch (status) {
    case "SUCCESS":
      return "success";
    case "DUPLICATE":
      return "warning";
    case "FAILED":
      return "failure";
    default:
      return "warning";
  }
}

/** Label pemicu: "Manual" atau "Otomatis (cron)". */
export function describeTrigger(trigger: TriggerType): string {
  return trigger === "CRON" ? "Otomatis (cron)" : "Manual";
}

/**
 * Format waktu ke zona Asia/Jakarta secara eksplisit (bukan zona server).
 * Mengembalikan `null` bila `Date` tidak sah, supaya pemanggil memutuskan
 * fallback — bukan diam-diam mencetak "Invalid Date".
 */
export function formatJakartaTimestamp(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");

  return `${day} ${month} ${year}, ${hour}:${minute} WIB`;
}

// ---------------------------------------------------------------------------
// Ringkasan daftar (untuk kartu statistik di halaman)
// ---------------------------------------------------------------------------

/** Baris minimal yang dibutuhkan ringkasan — cukup subset kolom SubmitLog. */
export interface AuditRow {
  status: SubmitStatus;
  createdAt: Date;
}

export interface AuditSummary {
  total: number;
  success: number;
  duplicate: number;
  failed: number;
  /** Waktu (ms) log terbaru, atau `null` bila daftar kosong. */
  lastAt: Date | null;
}

/**
 * Hitung ringkasan dari daftar log. MURNI — tidak menyentuh DB. Daftar kosong
 * menghasilkan semua nol (bukan NaN), termasuk `lastAt: null`.
 */
export function summarizeLogs(rows: readonly AuditRow[]): AuditSummary {
  let success = 0;
  let duplicate = 0;
  let failed = 0;
  let lastAt: Date | null = null;

  for (const row of rows) {
    if (row.status === "SUCCESS") success += 1;
    else if (row.status === "DUPLICATE") duplicate += 1;
    else if (row.status === "FAILED") failed += 1;

    if (lastAt === null || row.createdAt.getTime() > lastAt.getTime()) {
      lastAt = row.createdAt;
    }
  }

  return { total: rows.length, success, duplicate, failed, lastAt };
}
