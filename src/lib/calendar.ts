// src/lib/calendar.ts: perhitungan kalender kehadiran & laporan (MURNI).
//
// Halaman /calendar menyerahkan parameter bulan (dari URL) dan daftar log/report
// mentah ke fungsi-fungsi di sini. Sama seperti modul murni lain (audit-log,
// report-policy): keputusan tampilan + batas tanggal diuji tanpa DB, tanpa
// bergantung jam perangkat pengguna.
//
// Zona waktu: seluruh hari dihitung di Asia/Jakarta (WIB, UTC+7), konsisten
// dengan stats-query.ts. Jangan pakai zona server, server bisa UTC.

import type { SubmitStatus } from "@/generated/prisma/enums";
import { isNationalHoliday } from "./holidays";

/** Offset WIB tetap (UTC+7), Indonesia tidak memakai DST. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Nama bulan dalam bahasa Indonesia, indeks 1–12. */
export const MONTH_LABELS = [
  "",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/** Label kolom hari, indeks 0 = Minggu (sesuai `Date.getUTCDay` setelah geser WIB). */
export const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;

export type YearMonth = { year: number; month: number };

/**
 * Bulan "hari ini" di zona Asia/Jakarta. Dipakai sebagai default bila URL
 * tidak menyebut bulan/tahun.
 */
export function currentJakartaMonth(now: Date = new Date()): YearMonth {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  return { year: wib.getUTCFullYear(), month: wib.getUTCMonth() + 1 };
}

/**
 * Ubah `?month=YYYY-MM` menjadi YearMonth yang sah. Nilai tak dikenal / bulan
 * di luar 1–12 / tahun mustahil jatuh ke bulan berjalan, jadi URL salah ketik
 * tidak pernah membuat halaman error, hanya menampilkan bulan ini.
 */
export function parseMonth(raw: string | undefined, now: Date = new Date()): YearMonth {
  if (!raw) return currentJakartaMonth(now);
  const match = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!match) return currentJakartaMonth(now);
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (!Number.isFinite(year) || year < 1970 || year > 9999) {
    return currentJakartaMonth(now);
  }
  if (month < 1 || month > 12) return currentJakartaMonth(now);
  return { year, month };
}

/** Rombak YearMonth jadi `YYYY-MM` untuk dipakai di URL. */
export function monthToParam({ year, month }: YearMonth): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** Bulan sebelumnya. Januari → Desember tahun lalu. */
export function prevMonth({ year, month }: YearMonth): YearMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Bulan berikutnya. Desember → Januari tahun depan. */
export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Jumlah hari dalam sebuah bulan (1–12). */

/** Satu sel kalender: `null` = sel kosong (padding sebelum/sesudah hari). */
export type CalendarCell = {
  day: number;
  /** Tanggal sebagai `YYYY-MM-DD` (untuk dicocokkan dengan data). */
  iso: string;
} | null;

/**
 * Susun kisi bulan: baris demi baris, tiap baris 7 sel, diawali padding kosong
 * sebanyak hari-dalam-minggu tanggal 1. Panjangnya selalu kelipatan 7 (≥ 35).
 */
export function buildMonthGrid({ year, month }: YearMonth): CalendarCell[][] {
  const total = daysInMonth({ year, month });
  const lead = weekdayIndex(year, month, 1);
  const prefix = monthToParam({ year, month });

  const cells: CalendarCell[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) {
    cells.push({
      day,
      iso: `${prefix}-${String(day).padStart(2, "0")}`,
    });
  }
  // Padding ekor supaya baris terakhir genap 7 kolom.
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** Satu sel kisi yang ikut menampilkan hari dari bulan sebelah. */
export type AdjacentCell = {
  day: number;
  iso: string;
  /** `true` bila tanggal ini milik bulan lain (ditampilkan redup). */
  outside: boolean;
};

/** Geser YearMonth sejumlah bulan (boleh negatif), tanpa zona waktu. */
function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/**
 * Susun kisi bulan seperti `buildMonthGrid`, TETAPI sel padding tidak lagi
 * kosong — diisi tanggal nyata dari bulan sebelum/sesudahnya (`outside: true`).
 *
 * Kenapa dibuat: pemilih tanggal pada /report-templates menampilkan kisi yang
 * utuh (tanpa sel kosong) supaya hari di bulan sebelah tetap terlihat dan layout
 * tidak berlubang. Catatan: meski selnya berisi tanggal nyata, komponen
 * pemilih yang menentukan tanggal mana yang BOLEH dipilih — saat ini hanya hari
 * ini dan tanggal mendatang (`date-picker.tsx`). Jadi tanggal lampau tetap
 * tampil redup di sini, tetapi tidak bisa diklik. Halaman /calendar tetap
 * memakai `buildMonthGrid` yang kosong, perilakunya tidak berubah.
 *
 * Selalu kelipatan 7 kolom; tiap sel berisi tanggal nyata (tidak ada `null`).
 */
export function buildMonthGridWithAdjacent({ year, month }: YearMonth): AdjacentCell[][] {
  const total = daysInMonth({ year, month });
  const lead = weekdayIndex(year, month, 1);

  const prev = shiftMonth({ year, month }, -1);
  const next = shiftMonth({ year, month }, 1);
  const prevTotal = daysInMonth(prev);
  const nextTotal = daysInMonth(next);
  const prevPrefix = monthToParam(prev);
  const prefix = monthToParam({ year, month });
  const nextPrefix = monthToParam(next);

  const cells: AdjacentCell[] = [];
  // Ekor bulan sebelumnya, mis. 27–30 September di baris pertama Oktober.
  for (let i = lead; i > 0; i -= 1) {
    const day = prevTotal - i + 1;
    cells.push({ day, iso: `${prevPrefix}-${String(day).padStart(2, "0")}`, outside: true });
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push({ day, iso: `${prefix}-${String(day).padStart(2, "0")}`, outside: false });
  }
  // Kepala bulan berikutnya supaya baris terakhir genap 7 kolom.
  for (let day = 1; cells.length % 7 !== 0; day += 1) {
    cells.push({ day, iso: `${nextPrefix}-${String(day).padStart(2, "0")}`, outside: true });
    if (day > nextTotal) break; // jaring pengaman, tidak seharusnya tercapai
  }

  const weeks: AdjacentCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** Status ringkas satu tanggal. Prioritas: TERKIRIM > GAGAL > DRAFT > KOSONG. */
export type DayStatus = "SUBMITTED" | "FAILED" | "DRAFT" | "NONE";

/**
 * Jenis hari libur untuk penanda di sel kalender:
 *   - `NATIONAL` = libur nasional/cuti bersama (daftar holidays.ts)
 *   - `WEEKEND`  = Sabtu/Minggu
 *   - `null`     = hari kerja biasa
 *
 * Dipisah dari `DayStatus` supaya penanda libur TIDAK mengubah statistik
 * (terkirim/draft/gagal), kalender tetap menghitung status submit apa adanya.
 */
export type HolidayKind = "NATIONAL" | "WEEKEND" | null;
/** Baris minimal SubmitLog yang dibutuhkan kalender. */
export interface CalendarLogRow {
  status: SubmitStatus;
  createdAt: Date;
}

/** Baris minimal Report yang dibutuhkan kalender. */
export interface CalendarReportRow {
  /** Kolom `date` bertipe `@db.Date`; dibandingkan lewat `YYYY-MM-DD`. */
  date: Date;
}

/** Kunci `YYYY-MM-DD` dari sebuah timestamp, digeser ke WIB. */
export function jakartaISODate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Awal hari (tengah malam WIB) untuk instant `now`, dikembalikan sebagai UTC
 * Date. MURNI, `now` bisa disuntik di tes, tidak membaca jam perangkat.
 *
 * Inilah satu-satunya sumber batas hari WIB: dashboard & kalender memakainya
 * agar keduanya tidak pernah berbeda rumus (dulu keduanya pernah beda dan
 * membuat hari "hilang" dari grafik 30 hari).
 */
export function startOfJakartaDay(now: Date = new Date()): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  wib.setUTCHours(0, 0, 0, 0);
  return new Date(wib.getTime() - WIB_OFFSET_MS);
}

/**
 * Rentetan `n` tanggal (YYYY-MM-DD, tertua → terbaru) yang berakhir pada HARI
 * INI di zona WIB. MURNI.
 *
 * PENTING: tanggal dihitung dengan `jakartaISODate` (geser ke WIB lalu baca
 * tanggal), BUKAN `toISOString()` langsung. Untuk tengah malam WIB
 * (`2026-09-28T17:00:00Z`), `toISOString()` memberi `2026-09-28` dan membuat
 * hari ini selalu absen dari daftar, bug yang pernah membuat grafik 30 hari
 * kehilangan batang "hari ini".
 */
export function lastJakartaDays(n: number, now: Date = new Date()): string[] {
  const days: string[] = [];
  const today = startOfJakartaDay(now);
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let i = n - 1; i >= 0; i -= 1) {
    const iso = jakartaISODate(new Date(today.getTime() - i * DAY_MS));
    if (iso) days.push(iso);
  }
  return days;
}

/** Kunci `YYYY-MM-DD` dari kolom Report.date (@db.Date, sudah tanpa jam). */
export function reportISODate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Kelompokkan log per tanggal (WIB) dengan status paling penting menang:
 * SUCCESS > FAILED > DUPLICATE. MURNI.
 */
export function groupLogsByDate(
  logs: readonly CalendarLogRow[],
): Map<string, "SUCCESS" | "FAILED" | "DUPLICATE"> {
  const rank: Record<"SUCCESS" | "FAILED" | "DUPLICATE", number> = {
    SUCCESS: 3,
    FAILED: 2,
    DUPLICATE: 1,
  };
  const out = new Map<string, "SUCCESS" | "FAILED" | "DUPLICATE">();

  for (const log of logs) {
    const key = jakartaISODate(log.createdAt);
    if (!key) continue;
    const current = out.get(key);
    if (!current || rank[log.status] > rank[current]) {
      out.set(key, log.status);
    }
  }
  return out;
}

/** Kumpulkan tanggal (YYYY-MM-DD) yang punya Report/draft. MURNI. */
export function collectReportDates(
  reports: readonly CalendarReportRow[],
): Set<string> {
  const out = new Set<string>();
  for (const report of reports) {
    const key = reportISODate(report.date);
    if (key) out.add(key);
  }
  return out;
}

/**
 * Tentukan status satu tanggal dari data log + laporan. MURNI.
 *
 * Prioritas:
 *   1. Ada kiriman sukses  → SUBMITTED
 *   2. Ada percobaan gagal  → FAILED
 *   3. Ada draft tersimpan  → DRAFT
 *   4. Tidak ada apa-apa    → NONE
 *
 * Catatan jujur: kiriman DUPLICATE saja (tanpa SUCCESS) TIDAK dinaikkan ke
 * SUBMITTED, laporan hari itu belum pasti terkirim dari akun ini. Ia hanya
 * dianggap DRAFT bila ada isinya, atau NONE bila tidak.
 */
export function classifyDay(
  iso: string,
  logsByDate: ReadonlyMap<string, "SUCCESS" | "FAILED" | "DUPLICATE">,
  reportDates: ReadonlySet<string>,
): DayStatus {
  const log = logsByDate.get(iso);
  if (log === "SUCCESS") return "SUBMITTED";
  if (log === "FAILED") return "FAILED";
  if (reportDates.has(iso)) return "DRAFT";
  return "NONE";
}

export function daysInMonth({ year, month }: YearMonth): number {
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini. UTC agar bebas zona.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Indeks hari-dalam-minggu (0=Minggu … 6=Sabtu) untuk tanggal tertentu,
 * dihitung sebagai kalender murni (bukan bergantung zona server).
 */
export function weekdayIndex(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Tentukan jenis libur untuk `iso` (YYYY-MM-DD). MURNI.
 *
 * Urutan penting: libur nasional diperiksa LEBIH DULU daripada akhir pekan.
 * Jadi Sabtu/Minggu yang kebetulan juga libur nasional dilaporkan sebagai
 * `NATIONAL`, penanda yang lebih informatif. Tanggal tak sah → `null`.
 */
export function holidayKindOf(iso: string): HolidayKind {
  if (isNationalHoliday(iso)) return "NATIONAL";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const wd = weekdayIndex(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  );
  return wd === 0 || wd === 6 ? "WEEKEND" : null;
}
