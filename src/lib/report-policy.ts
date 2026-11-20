// src/lib/report-policy.ts: aturan bisnis "boleh submit kapan" (SPEC.md §11B).
//
// Kenapa modul terpisah & murni: aturan ini menentukan KAPAN server boleh
// menyentuh portal Monev. Kalau salah, kita mengirim laporan di hari libur,
// atau (lebih buruk) terus berjalan setelah program berakhir. Karena itu ia
// dipisah dari I/O dan diuji tanpa jaringan maupun database.
//
// ANGGAPAN TANGGAL (penting, jangan diabaikan):
//   Semua fungsi di sini bekerja pada TANGGAL KALENDER polos (tahun, bulan,
//   tanggal) tanpa jam. Zona waktu adalah tanggung jawab pemanggil: ubah waktu
//   "sekarang" ke zona Asia/Jakarta LEBIH DULU, baru panggil fungsi ini.
//   Kalau tidak, batas 2027-02-10 bisa meleset satu hari di server UTC.

import { isWorkDayOf, isoWeekdayOfDate, type WorkDays } from "./work-schedule";
import { isNationalHoliday } from "./holidays";
import { MIN_REPORT_LENGTH } from "./report-rules";

/**
 * Batas akhir program. Mulai 2027-02-10 (dalam zona Jakarta) seluruh otomasi
 * WAJIB berhenti sendiri, tanpa submit, tanpa membuka apa pun (SPEC.md §11B).
 * Nilai ini disalin apa adanya dari bot Python (`policy.py:11`), bukan tebakan.
 */
export const LAST_ACTIVE_DATE = "2027-02-09";

/** Jam local (Asia/Jakarta) dua slot terjadwal; slot kedua = cadangan (§11B). */
export const JADWAL_CADANGAN = ["16:30", "20:00"] as const;

// Libur nasional kini berasal dari `holidays.ts` (data murni terpisah) supaya
// daftar tanggal mudah diaudit & diganti tiap tahun tanpa menyentuh logika.
// Lihat peringatan verifikasi SKB di file itu.

/** Tanggal polos dalam bentuk `YYYY-MM-DD`. */
export type PlainDate = string;

/**
 * Kumpulan libur nasional TAMBAHAN yang dikelola admin (dari tabel `holidays`).
 *
 * Modul ini tetap MURNI: ia tidak menyentuh DB, melainkan menerima himpunan
 * tanggal sebagai argumen. Pemanggil server (route/aksi) mengisinya lewat
 * `holidays-repo.ts`; pemanggil murni (test, komponen klien) boleh memakai
 * `LIBUR_NASIONAL` statis sebagai kemiripan.
 *
 * `undefined` (parameter tak diberikan) berarti "pakai daftar statis", itu
 * jalur kompatibilitas mundur supaya seluruh pemanggil lama tetap benar.
 */
export type HolidaySet = ReadonlySet<string>;

/** Hasil keputusan policy, satu kata, dipakai konsisten di audit log §5.7. */
export type PolicyDecision =
  | "ALLOW" // boleh submit
  | "SKIPPED" // libur / di luar jadwal kerja → dilewati (bukan error)
  | "PROGRAM_ENDED"; // lewat LAST_ACTIVE_DATE → hentikan otomasi

/** Apakah string berbentuk `YYYY-MM-DD` yang sah (bukan cuma cocok pola)? */
export function isPlainDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Bandingkan dua tanggal polos secara leksikografis (= kronologis utk format ini). */
export function isAfter(a: PlainDate, b: PlainDate): boolean {
  return a > b;
}

/**
 * Apakah tanggal ini "libur" bagi pengguna — yaitu TIDAK boleh kirim?
 *
 * Tiga lapis (urutan penting):
 *   1. Di luar jadwal kerja pengguna (`workDays`). Bila tidak diberikan,
 *      jatuh ke default Senin–Jumat, sehingga pemanggil lama berperilaku
 *      persis seperti sebelum fitur jadwal kerja ada. Pengguna yang SENGAJA
 *      mencentang Sabtu di /work-schedule membuat Sabtu jadi hari kerja
 *      baginya — itu pilihan eksplisit, bukan celah.
 *   2. Libur nasional dari `holidays` (tabel admin); tanpa argumen itu,
 *      jatuh ke daftar statis `LIBUR_NASIONAL`.
 *
 * Tanggal tak sah dianggap libur (aman: lebih baik menolak daripada mengirim
 * untuk tanggal yang tidak bisa dipastikan).
 */
export function isHoliday(
  date: PlainDate,
  holidays?: HolidaySet,
  workDays?: WorkDays,
): boolean {
  const isoDay = isoWeekdayOfDate(date);
  if (isoDay === null) return true;
  if (!isWorkDayOf(isoDay, workDays)) return true;
  return isNationalHoliday(date, holidays);
}

/**
 * Apakah tanggal ini hari kerja (hari kerja pengguna DAN bukan libur
 * nasional)? Dipakai pengingat, dashboard, date picker, dan landing.
 */
export function isWorkingDay(
  date: PlainDate,
  holidays?: HolidaySet,
  workDays?: WorkDays,
): boolean {
  return !isHoliday(date, holidays, workDays);
}

/**
 * Keputusan utama: boleh submit untuk `date`?
 *
 * Urutan pemeriksaan sengaja: **PROGRAM_ENDED diperiksa lebih dulu**, supaya
 * setelah 2027-02-09 tidak ada alasan lain yang bisa membuka jalan kembali.
 *
 * `holidays` diteruskan ke `isHoliday` (libur nasional dari tabel admin) dan
 * `workDays` menentukan hari kerja milik pengguna sendiri (default
 * Senin–Jumat bila tidak diberikan).
 */
export function decide(
  date: PlainDate,
  holidays?: HolidaySet,
  workDays?: WorkDays,
): PolicyDecision {
  if (!isPlainDate(date)) {
    throw new Error(`Tanggal tidak sah: ${date} (harus YYYY-MM-DD).`);
  }
  if (isAfter(date, LAST_ACTIVE_DATE)) return "PROGRAM_ENDED";
  if (isHoliday(date, holidays, workDays)) return "SKIPPED";
  return "ALLOW";
}

/**
 * Validasi isi laporan sebelum dikirim. Mengembalikan `null` bila OK, atau
 * pesan kesalahan. Syarat minimal 100 karakter berasal dari portal (§11B),
 * dipakai lewat `report-rules.ts` supaya hanya ada satu sumber kebenaran.
 */
export function checkReportContent(input: {
  activity: string;
  learning: string;
  obstacles: string;
}): string | null {
  const kolom: [string, string][] = [
    ["Uraian Aktivitas", input.activity],
    ["Pembelajaran", input.learning],
    ["Kendala", input.obstacles],
  ];
  for (const [nama, teks] of kolom) {
    const len = teks.trim().length;
    if (len < MIN_REPORT_LENGTH) {
      return `${nama} kurang dari ${MIN_REPORT_LENGTH} karakter.`;
    }
  }
  return null;
}
