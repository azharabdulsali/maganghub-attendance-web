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
 * `undefined` (parameter tak diberikan) berarti "pakai daftar statis" — itu
 * jalur kompatibilitas mundur supaya seluruh pemanggil lama tetap benar.
 */
export type HolidaySet = ReadonlySet<string>;

/** Hasil keputusan policy, satu kata, dipakai konsisten di audit log §5.7. */
export type PolicyDecision =
  | "ALLOW" // boleh submit
  | "SKIPPED" // libur / akhir pekan → dilewati (bukan error)
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

/** Hari ke berapa (0=Minggu … 6=Sabtu) untuk tanggal polos, tanpa zona waktu. */
function weekdayOf(date: PlainDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Bandingkan dua tanggal polos secara leksikografis (= kronologis utk format ini). */
export function isAfter(a: PlainDate, b: PlainDate): boolean {
  return a > b;
}

/**
 * Apakah tanggal ini libur (akhir pekan ATAU libur nasional)?
 * Akhir pekan: Sabtu/Minggu (selalu, tak butuh data). Libur nasional: dari
 * `holidays` bila diberikan, kalau tidak dari daftar statis `LIBUR_NASIONAL`.
 *
 * `holidays` datang dari tabel `holidays` (dikelola admin). Bila ia kosong
 * (`new Set()`), akhir pekan tetap libur — mengosongkan tabel tidak pernah
 * membuat Sabtu/Minggu jadi hari kerja.
 */
export function isHoliday(date: PlainDate, holidays?: HolidaySet): boolean {
  const wd = weekdayOf(date);
  if (wd === 0 || wd === 6) return true;
  return isNationalHoliday(date, holidays);
}

/** Apakah tanggal ini hari kerja (Senin–Jumat, bukan libur nasional)? */
export function isWorkingDay(date: PlainDate, holidays?: HolidaySet): boolean {
  return !isHoliday(date, holidays);
}

/**
 * Keputusan utama: boleh submit untuk `date`?
 *
 * Urutan pemeriksaan sengaja: **PROGRAM_ENDED diperiksa lebih dulu**, supaya
 * setelah 2027-02-09 tidak ada alasan lain yang bisa membuka jalan kembali.
 *
 * `holidays` diteruskan ke `isHoliday` (libur nasional dari tabel admin).
 */
export function decide(date: PlainDate, holidays?: HolidaySet): PolicyDecision {
  if (!isPlainDate(date)) {
    throw new Error(`Tanggal tidak sah: ${date} (harus YYYY-MM-DD).`);
  }
  if (isAfter(date, LAST_ACTIVE_DATE)) return "PROGRAM_ENDED";
  if (isHoliday(date, holidays)) return "SKIPPED";
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
