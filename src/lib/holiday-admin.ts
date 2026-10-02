// src/lib/holiday-admin.ts: logika MURNI pengelolaan libur admin (tanpa I/O).
//
// Halaman `/admin/holidays` dan endpoint `/api/admin/holidays` sama-sama
// memakai aturan di sini, supaya validasi/normalisasi tidak diduplikasi dan
// bisa diuji tanpa database. Semua fungsi di sini bebas efek samping.
//
// Aturan yang ditegakkan di sini:
//   1. Tanggal harus `YYYY-MM-DD` yang benar-benar ada di kalender
//      (menolak `2026-02-30`) — memakai `isPlainDate` agar SATU sumber.
//   2. Akhir pekan (Sabtu/Minggu) TIDAK boleh didaftarkan: itu sudah otomatis
//      libur lewat `isHoliday`, menambah baris hanya membingungkan.
//   3. Tanggal harus berada dalam masa program (`<= LAST_ACTIVE_DATE`); setelah
//      program berakhir tak ada laporan yang dicek lagi, jadi barisnya sia-sia.

import { isPlainDate, isAfter, LAST_ACTIVE_DATE, type PlainDate } from "./report-policy";

/** Satu baris libur untuk ditampilkan/dikirim ke klien (tanggal = string polos). */
export interface HolidayRow {
  id: string;
  date: PlainDate;
  name: string;
  kind: string;
}

/** Panjang maksimum nama libur (samakan dengan skema validasi request). */
export const HOLIDAY_NAME_MAX = 80;

/** Jenis libur yang ditawarkan UI; bebas teks, ini hanya saran. */
export const HOLIDAY_KINDS = ["Nasional", "Cuti Bersama", "Libur Khusus"] as const;

/**
 * Awalan id untuk baris SEED (libur nasional bawaan dari `LIBUR_NASIONAL`),
 * dipakai saat tabel DB masih kosong. Baris seed BUKAN baris DB: tombol
 * ubah/hapus harus dinonaktifkan untuknya, sebab server tak punya record
 * dengan id ini. Begitu admin menambah baris pertama, seed hilang dan DB
 * menjadi sumber kebenaran penuh.
 */
export const SEED_ID_PREFIX = "seed:";

/** Apakah `id` menandai baris seed (bukan baris DB)? MURNI. */
export function isSeedHolidayId(id: string): boolean {
  return id.startsWith(SEED_ID_PREFIX);
}

/** Hari ke berapa (0=Minggu … 6=Sabtu) untuk tanggal polos. MURNI. */
export function weekdayOfPlainDate(date: PlainDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Apakah tanggal jatuh pada akhir pekan (Sabtu/Minggu)? MURNI. */
export function isWeekendPlainDate(date: PlainDate): boolean {
  const wd = weekdayOfPlainDate(date);
  return wd === 0 || wd === 6;
}

/** Hasil validasi input libur: normal atau pesan kesalahan + field penyebab. */
export type HolidayValidation =
  | { ok: true; date: PlainDate; name: string; kind: string }
  | { ok: false; error: string; field?: "date" | "name" | "kind" };

/**
 * Validasi & normalisasi input tambah/ubah libur. MURNI.
 *
 * `name` dipangkas; kosong ditolak. `kind` kosong → default "Nasional". Tanggal
 * weekend / di luar masa program ditolak dengan pesan yang menjelaskan ALASAN
 * (bukan sekadar "tidak valid"), supaya admin paham kenapa.
 */
export function validateHolidayInput(input: {
  date?: unknown;
  name?: unknown;
  kind?: unknown;
}): HolidayValidation {
  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!date) return { ok: false, error: "Tanggal wajib diisi.", field: "date" };
  if (!isPlainDate(date)) {
    return {
      ok: false,
      error: "Tanggal tidak sah. Gunakan format YYYY-MM-DD.",
      field: "date",
    };
  }
  if (isWeekendPlainDate(date)) {
    return {
      ok: false,
      error: "Tanggal ini akhir pekan (Sabtu/Minggu), sudah otomatis libur.",
      field: "date",
    };
  }
  if (isAfter(date, LAST_ACTIVE_DATE)) {
    return {
      ok: false,
      error: `Tanggal melewati akhir masa program (${LAST_ACTIVE_DATE}).`,
      field: "date",
    };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { ok: false, error: "Nama libur wajib diisi.", field: "name" };
  }
  if (name.length > HOLIDAY_NAME_MAX) {
    return {
      ok: false,
      error: `Nama libur maksimal ${HOLIDAY_NAME_MAX} karakter.`,
      field: "name",
    };
  }

  const rawKind = typeof input.kind === "string" ? input.kind.trim() : "";
  const kind = rawKind || "Nasional";
  if (kind.length > HOLIDAY_NAME_MAX) {
    return {
      ok: false,
      error: `Jenis libur maksimal ${HOLIDAY_NAME_MAX} karakter.`,
      field: "kind",
    };
  }

  return { ok: true, date, name, kind };
}

/**
 * Urutkan daftar libur menaik berdasarkan tanggal. MURNI. Tidak mengubah input.
 * Format `YYYY-MM-DD` membuat perbandingan string sama dengan kronologis.
 */
export function sortHolidays<T extends { date: PlainDate }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Pisahkan libur yang akan datang dari yang sudah lewat, relatif `today`.
 * MURNI. Dipakai halaman admin untuk menandai baris yang sudah tak berpengaruh.
 */
export function partitionHolidays<T extends { date: PlainDate }>(
  rows: readonly T[],
  today: PlainDate,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const row of rows) {
    if (isAfter(today, row.date)) past.push(row);
    else upcoming.push(row);
  }
  return { upcoming, past };
}
