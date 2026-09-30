// src/lib/holidays.ts — DAFTAR LIBUR NASIONAL Indonesia (data murni).
//
// Konteks penting: entri di sini HANYA perlu mencakup tanggal yang MASIH BISA
// terjadi. Tanggal yang sudah lewat tak akan pernah dicek lagi (mis. Jan–Agu
// 2026 dihapus karena hari ini sudah 30 Sep 2026). Yang menentukan perilaku
// hanyalah tanggal >= sekarang.
//
// Blok tersisa: 24–25 Des 2026 (terkonfirmasi dari web absensi Maganghub) dan
// 2027-01-01 (perkiraan; belum dicocokkan — verifikasi bila ragu).
//
// Batas relevansi: program berhenti 2027-02-09 (lihat LAST_ACTIVE_DATE di
// report-policy.ts), jadi setelah itu tak ada tanggal yang perlu didaftarkan.
//
// Modul ini SENGAJA murni: hanya data, tanpa I/O, tanpa jam, tanpa Prisma.
// Dengan begitu `report-policy.ts` tetap bisa diuji luring dan tidak menarik
// `fs` ke bundle mana pun.

/** Libur nasional + cuti bersama yang MASIH relevan (>= 30 Sep 2026). */
const LIBUR_RELEVAN: readonly string[] = [
  "2026-12-24", // Cuti Bersama Natal (terkonfirmasi: web absensi)
  "2026-12-25", // Hari Raya Natal (terkonfirmasi: web absensi)
  "2027-01-01", // Tahun Baru Masehi (perkiraan)
];

/** Semua tanggal libur nasional yang dikenal. */
export const LIBUR_NASIONAL: ReadonlySet<string> = new Set<string>([
  ...LIBUR_RELEVAN,
]);

/** Apakah tanggal (format `YYYY-MM-DD`) termasuk libur nasional? */
export function isNationalHoliday(date: string): boolean {
  return LIBUR_NASIONAL.has(date);
}

