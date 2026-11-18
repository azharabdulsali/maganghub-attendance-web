// src/lib/landing-sheet-dates.ts: tanggal untuk contoh lembar di hero landing.
//
// Kenapa modul terpisah & MURNI: perhitungan tanggal adalah tempat bug zona
// waktu paling sering bersembunyi (lihat catatan "ANGGAPAN TANGGAL" di
// report-policy.ts). Fungsi di sini tidak menyentuh DB, jaringan, maupun jam
// sistem — "hari ini" selalu datang sebagai argumen, jadi bisa diuji dengan
// tanggal tetap dan hasilnya tidak berubah tergantung kapan tes dijalankan.
//
// Dipakai HANYA oleh hero landing (`src/app/page.tsx`). Jangan pakai untuk
// jalur kirim: di sana tanggal ditentukan `decide()` di report-policy.ts.

import { isPlainDate, isWorkingDay, type HolidaySet, type PlainDate } from "./report-policy";

/**
 * Geser tanggal polos sebanyak `delta` hari (boleh negatif), MURNI.
 *
 * Dihitung lewat `Date.UTC` supaya tidak tersentuh zona waktu server. Memakai
 * `new Date(y, m, d)` setempat akan meleset sehari di server yang memakai DST.
 */
export function shiftPlainDate(date: PlainDate, delta: number): PlainDate {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  const bulan = String(t.getUTCMonth() + 1).padStart(2, "0");
  const hari = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${bulan}-${hari}`;
}

/**
 * `count` hari kerja terakhir, **terbaru dulu**.
 *
 * Dipakai contoh lembar di hero: tiga lembar = tiga hari kerja terakhir, supaya
 * tanggalnya masuk akal. Satu hari tidak mungkin punya tiga laporan berbeda,
 * jadi kalau tanggalnya dibiarkan sama, contohnya justru membingungkan.
 *
 * Bila `today` sendiri bukan hari kerja (Sabtu/Minggu/libur nasional), hitungan
 * dimulai dari hari kerja terakhir SEBELUM itu. Tanpa aturan ini, contoh lembar
 * bisa menampilkan tanggal Sabtu — padahal otomasi tidak pernah mengirim di
 * hari itu, jadi contohnya berbohong tentang perilaku aplikasi.
 *
 * `holidays` mengikuti aturan yang sama dengan jalur kirim: `undefined` berarti
 * pakai daftar statis `LIBUR_NASIONAL`, himpunan kosong berarti "tidak ada
 * libur tambahan" (akhir pekan tetap dilewati).
 */
export function recentWorkingDays(
  today: PlainDate,
  count: number,
  holidays?: HolidaySet,
): PlainDate[] {
  if (!isPlainDate(today)) {
    throw new Error(`Tanggal tidak sah: ${today} (harus YYYY-MM-DD).`);
  }
  if (count <= 0) return [];

  const hasil: PlainDate[] = [];
  let kursor = today;
  // Batas aman: 7 hari per hari kerja yang dicari, ditambah 7. Cukup untuk
  // melewati libur panjang (mis. Natal + cuti bersama), tetapi tetap menutup
  // kemungkinan perulangan tanpa akhir bila data libur keliru.
  let sisa = count * 7 + 7;

  while (hasil.length < count && sisa > 0) {
    if (isWorkingDay(kursor, holidays)) hasil.push(kursor);
    kursor = shiftPlainDate(kursor, -1);
    sisa -= 1;
  }

  return hasil;
}
