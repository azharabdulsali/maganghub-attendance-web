// src/lib/holidays.ts: NILAI AWAL daftar libur nasional Indonesia (data murni).
//
// Konteks penting: entri di sini HANYA perlu mencakup tanggal yang MASIH BISA
// terjadi. Tanggal yang sudah lewat tak akan pernah dicek lagi (mis. Jan–Agu
// 2026 dihapus karena hari ini sudah 30 Sep 2026). Yang menentukan perilaku
// hanyalah tanggal >= sekarang.
//
// SEJAK FITUR ADMIN: daftar ini TIDAK LAGI menjadi sumber kebenaran saat
// berjalan (runtime). Admin menambah/mengubah/menghapus libur lewat halaman
// `/admin/holidays`, dan data itu tersimpan di tabel `holidays` (lihat
// `prisma/schema.prisma`). Himpunan di bawah ini berperan sebagai:
//   1. NILAI AWAL (seed) saat tabel masih kosong / untuk migrasi awal, dan
//   2. fallback MURNI untuk pemanggil yang tidak menyentuh DB (mis. unit test,
//      atau komponen yang sengaja memakai data statis).
// Jalur kebenaran runtime ada di `holidays-repo.ts` (server) → `decide()`.
//
// Batas relevansi: program berhenti 2027-02-09 (lihat LAST_ACTIVE_DATE di
// report-policy.ts), jadi setelah itu tak ada tanggal yang perlu didaftarkan.
//
// Modul ini SENGAJA murni: hanya data, tanpa I/O, tanpa jam, tanpa Prisma.
// Dengan begitu `report-policy.ts` tetap bisa diuji luring dan tidak menarik
// `fs`/Prisma ke bundle mana pun (termasuk bundle KLIEN yang memuat DatePicker).

/** Libur nasional + cuti bersama yang MASIH relevan (>= 30 Sep 2026). */
const LIBUR_RELEVAN: readonly string[] = [
  "2026-12-24", // Cuti Bersama Natal (terkonfirmasi: web absensi)
  "2026-12-25", // Hari Raya Natal (terkonfirmasi: web absensi)
  "2027-01-01", // Tahun Baru Masehi (perkiraan)
];

/** Semua tanggal libur nasional yang dikenal (nilai awal/seed). */
export const LIBUR_NASIONAL: ReadonlySet<string> = new Set<string>([
  ...LIBUR_RELEVAN,
]);

/**
 * Apakah tanggal (format `YYYY-MM-DD`) termasuk libur nasional?
 *
 * Bila `holidays` diberikan, itulah yang dipakai (data dari tabel admin);
 * kalau tidak, jatuh ke daftar statis `LIBUR_NASIONAL` supaya pemanggil murni
 * tetap bekerja tanpa DB.
 */
export function isNationalHoliday(
  date: string,
  holidays?: ReadonlySet<string>,
): boolean {
  return (holidays ?? LIBUR_NASIONAL).has(date);
}

