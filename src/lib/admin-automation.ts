// src/lib/admin-automation.ts: logika tampilan otomasi per-user di Panel Admin.
//
// Tujuan: Panel Admin menampilkan, untuk SETIAP pengguna, (a) jam:menit jadwal
// otomasi miliknya di WIB dan (b) apakah otomasi sudah berjalan HARI INI atau
// belum. Keputusan yang bisa diuji (bentuk label jadwal, batas hari WIB, dan
// penilaian "sudah jalan hari ini") dikumpulkan di sini supaya tidak perlu DB
// untuk mengujinya — pola sama seperti admin.ts & audit-log.ts.
//
// Modul ini SENGAJA murni (tanpa DB/jaringan/Date.now langsung): `now`
// disuntikkan sebagai argumen supaya pengujian memakai tanggal tetap.
//
// Tidak ada rahasia di sini: hanya jam/menit, waktu, dan status submit.

import { AUTOMATION_TIMEZONE, formatSchedule } from "./automation";
import type { SubmitStatus } from "@/generated/prisma/enums";

/**
 * Batas [start, end) sebuah hari di Asia/Jakarta, sebagai `Date` UTC.
 *
 * Kenapa perlu: "submit hari ini" tidak boleh dihitung dengan `toISOString`
 * (itu UTC; di server UTC, 00:00–07:00 WIB masih tanggal kemarin). Kita
 * menghitung offset zona Jakarta dari `now` itu sendiri via `Intl` lalu
 * membentuk rentang UTC yang tepat, MURNI terhadap argumennya.
 *
 * Mengembalikan `null` bila `now` tidak sah supaya pemanggil memutuskan
 * fallback, bukan diam-diam memakai rentang rusak.
 */
export function jakartaDayRange(now: Date): { start: Date; end: Date } | null {
  if (Number.isNaN(now.getTime())) return null;

  // Komponen tanggal di Jakarta (bisa beda hari dari UTC).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AUTOMATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const y = num("year");
  const mo = num("month");
  const d = num("day");
  const h = num("hour") % 24;
  const mi = num("minute");
  const s = num("second");

  // Tengah malam WIB hari itu = waktu Jakarta dikurangi jam:menit:detik lokal,
  // lalu dibalik ke UTC dengan mengurangkan offset zona Jakarta saat itu.
  //
  // Offset dihitung dari `now`: selisih antara "dinding jam Jakarta" dan
  // "dinding jam UTC" pada saat yang sama. Cara ini benar walau aturan zona
  // berubah (tidak mengasumsikan +07:00 tetap).
  const jakartaWallMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMs = jakartaWallMs - now.getTime(); // Jakarta − UTC, saat ini
  const midnightJakartaMs = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const startMs = midnightJakartaMs - offsetMs;
  const endMs = startMs + 24 * 60 * 60 * 1000;

  return { start: new Date(startMs), end: new Date(endMs) };
}

/** Label jadwal otomasi untuk tabel admin, mis. "07:30 WIB". */
export function scheduleLabel(hour: number, minute: number): string {
  return `${formatSchedule(hour, minute)} WIB`;
}

/** Status ringkas "sudah dijalankan hari ini" untuk satu pengguna. */
export type TodayRunStatus = "SELESAI" | "GAGAL" | "BELUM";

/** Satu baris log minimal untuk menilai status hari ini (subset SubmitLog). */
export interface TodayLogRow {
  status: SubmitStatus;
  createdAt: Date;
}

/** Hasil penilaian status hari ini: status + waktu percobaan terakhir. */
export interface TodayRunVerdict {
  status: TodayRunStatus;
  /** Waktu log terakhir hari ini (ms), atau null bila belum ada. */
  lastAt: Date | null;
}

/**
 * Nilai apakah otomasi sudah dijalankan HARI INI untuk seorang pengguna.
 *
 * Aturan (disepakati): "sudah dijalankan" = ada SubmitLog APA PUN hari ini
 * (SUCCESS/DUPLICATE/FAILED). Itu mencerminkan niat "cron mencoba jalan",
 * bukan hanya keberhasilan. Bila ada log, status terakhir yang menang:
 * GAGAL bila log TERAKHIR FAILED, selain itu SELESAI. `logs` diasumsikan
 * milik satu pengguna; MURNI terhadap `now`.
 */
export function assessTodayRun(
  logs: readonly TodayLogRow[],
  now: Date,
): TodayRunVerdict {
  const range = jakartaDayRange(now);
  if (!range || logs.length === 0) {
    return { status: "BELUM", lastAt: null };
  }

  let lastAt: Date | null = null;
  let lastStatus: SubmitStatus | null = null;
  for (const log of logs) {
    const t = log.createdAt;
    if (Number.isNaN(t.getTime())) continue;
    if (t.getTime() < range.start.getTime() || t.getTime() >= range.end.getTime()) {
      continue;
    }
    if (lastAt === null || t.getTime() > lastAt.getTime()) {
      lastAt = t;
      lastStatus = log.status;
    }
  }

  if (lastAt === null || lastStatus === null) {
    return { status: "BELUM", lastAt: null };
  }
  return { status: lastStatus === "FAILED" ? "GAGAL" : "SELESAI", lastAt };
}

/** Label manusia untuk status hari ini. */
export function describeTodayRun(status: TodayRunStatus): string {
  switch (status) {
    case "SELESAI":
      return "Sudah jalan";
    case "GAGAL":
      return "Gagal";
    default:
      return "Belum jalan";
  }
}
