// src/lib/holidays-repo.ts: akses DB untuk daftar libur yang dikelola admin.
//
// Ini SATU-SATUNYA jalur runtime yang membaca tabel `holidays`. Karena modul
// ini menyentuh Prisma, ia SERVER-ONLY: JANGAN impor dari komponen klien
// (DatePicker dkk menerima daftar libur sebagai prop dari server).
//
// Kenapa dipisah dari `holidays.ts`: file itu murni & ikut ke bundle klien;
// menempelkan Prisma di sana akan menarik seluruh klien + koneksi DB ke bundle
// peramban. Pemisahan ini bukan gaya, melainkan syarat build.
//
// `loadHolidaySet()` dipakai jalur kirim (`decide()`), `loadHolidayRows()` untuk
// tampilan (kalender, tabel admin). Keduanya membaca tabel yang sama.

import { prisma } from "@/lib/prisma";
import { toPlainDate } from "@/lib/submit-service";
import { LIBUR_NASIONAL } from "@/lib/holidays";
import {
  SEED_ID_PREFIX,
  sortHolidays,
  type HolidayRow,
} from "@/lib/holiday-admin";

/**
 * Himpunan tanggal libur (`YYYY-MM-DD`) dari DB, siap dipakai `decide()` /
 * `isHoliday` / `holidayKindOf`.
 *
 * AUTO-SEED (penting): bila tabel KOSONG, kembalikan `undefined` — bukan
 * himpunan kosong. `undefined` membuat `isHoliday` jatuh ke daftar statis
 * `LIBUR_NASIONAL` (libur nasional yang dulu di-hardcode, mis. 25 Des 2026).
 * Tanpa ini, go-live dengan tabel kosong akan MENGHILANGKAN libur nasional
 * yang sudah dikenal dan cron bisa mengirim laporan pada hari Natal.
 *
 * Begitu admin menambah baris PERTAMA, DB menjadi sumber kebenaran penuh —
 * termasuk bila admin lalu menghapus semua baris (himpunan kosong dikembalikan
 * apa adanya, artinya "nol libur custom", bukan balik lagi ke statis). Jadi
 * fallback statis hanya berlaku selama tabel benar-benar belum pernah diisi.
 */
export async function loadHolidaySet(): Promise<ReadonlySet<string> | undefined> {
  const rows = await prisma.holiday.findMany({ select: { date: true } });
  if (rows.length === 0) return undefined; // tabel kosong → pakai LIBUR_NASIONAL
  return new Set(rows.map((r) => toPlainDate(r.date)));
}

/**
 * Semua baris libur (id, tanggal, nama, jenis), terurut tanggal menaik.
 *
 * AUTO-SEED (sama seperti `loadHolidaySet`): bila tabel KOSONG, kembalikan
 * baris SEED dari `LIBUR_NASIONAL` (id berawalan `seed:`) supaya halaman yang
 * menampilkan libur (kalender, template, admin) SEIRAMA dengan kebijakan yang
 * benar-benar dijalankan. Baris seed bukan baris DB — UI menonaktifkan
 * ubah/hapus untuknya. Begitu ada baris DB pertama, seed tak dipakai lagi.
 */
export async function loadHolidayRows(): Promise<HolidayRow[]> {
  const rows = await prisma.holiday.findMany({
    select: { id: true, date: true, name: true, kind: true },
  });
  if (rows.length === 0) {
    return seedHolidayRows();
  }
  return sortHolidays(
    rows.map((r) => ({
      id: r.id,
      date: toPlainDate(r.date),
      name: r.name,
      kind: r.kind,
    })),
  );
}

/** Baris seed dari daftar statis (id sintetis `seed:<tanggal>`). MURNI secara I/O. */
function seedHolidayRows(): HolidayRow[] {
  return sortHolidays(
    [...LIBUR_NASIONAL].map((date) => ({
      id: `${SEED_ID_PREFIX}${date}`,
      date,
      name: "Libur Nasional (bawaan)",
      kind: "Nasional",
    })),
  );
}
