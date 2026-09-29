// src/lib/automation.ts — aturan jadwal otomasi (murni, tanpa DB/jaringan).
//
// Otomasi dipicu oleh layanan cron eksternal (mis. cron-job.org) yang menembak
// endpoint webhook kita dengan `?key=<webhookKey>`. Modul ini mengurus:
//   - bentuk respons API (aman, tanpa pernah mengirim kredensial);
//   - validasi jam/menit + zona waktu;
//   - penghitungan "kapan jadwal berikutnya" di Asia/Jakarta;
//   - pembuatan webhookKey acak yang cukup kuat (dipakai di route, bukan di sini).
//
// Rujukan: SPEC.md §7 (AutomationConfig), §9 poin 7 (satu kunci per pengguna).

import { randomBytes } from "node:crypto";

/** Zona waktu tunggal demi kesederhanaan — bot Python juga memakai WIB. */
export const AUTOMATION_TIMEZONE = "Asia/Jakarta";

/**
 * Buat `webhookKey` baru: 32 byte acak → hex 64 karakter.
 *
 * Sengaja panjang & acak penuh supaya tidak bisa ditebak lewat percobaan
 * berulang (endpoint cron hanya dijaga kunci ini). Satu kunci per pengguna.
 */
export function generateWebhookKey(): string {
  return randomBytes(32).toString("hex");
}

/** True bila jam/menit berada di rentang yang sah. */
export function isValidSchedule(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

/** Jam:menit berformat dua digit, mis. "07:30". */
export function formatSchedule(hour: number, minute: number): string {
  const h = String(hour).padStart(2, "0");
  const m = String(minute).padStart(2, "0");
  return `${h}:${m}`;
}

/** Deskripsi manusia untuk status otomasi. */
export function describeAutomation(isEnabled: boolean): string {
  return isEnabled ? "Aktif" : "Nonaktif";
}

// ---------------------------------------------------------------------------
// Perhitungan jadwal (murni, memakai Intl Asia/Jakarta)
// ---------------------------------------------------------------------------

/** Ambil komponen waktu di Asia/Jakarta sebagai angka. */
function jakartaParts(at: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AUTOMATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/**
 * Jarak (menit) dari `now` ke jadwal harian `hour:minute` WIB berikutnya.
 * Selalu > 0; bila jadwal hari ini sudah lewat, dihitung untuk besok.
 *
 * MURNI terhadap `now` (bisa diuji dengan tanggal tetap).
 */
export function minutesUntilNext(
  now: Date,
  hour: number,
  minute: number,
): number {
  const p = jakartaParts(now);
  const nowMinutes = p.hour * 60 + p.minute;
  const targetMinutes = hour * 60 + minute;
  const diff = targetMinutes - nowMinutes;
  return diff > 0 ? diff : diff + 24 * 60;
}

/**
 * Label "jadwal berikutnya" untuk UI: "hari ini" / "besok" + jam:menit WIB, atau
 * `null` bila jadwal tidak sah. Tidak pernah melempar.
 *
 * "hari ini" hanya bila jadwal belum lewat pada hari WIB yang sama — bukan
 * sekadar "kurang dari 24 jam" (jam yang sudah lewat pagi ini bisa tertutupi).
 */
export function describeNextRun(
  now: Date,
  hour: number,
  minute: number,
): string | null {
  if (!isValidSchedule(hour, minute)) return null;
  const p = jakartaParts(now);
  const nowMinutes = p.hour * 60 + p.minute;
  const targetMinutes = hour * 60 + minute;
  const hari = targetMinutes > nowMinutes ? "hari ini" : "besok";
  return `${formatSchedule(hour, minute)} WIB ${hari}`;
}
