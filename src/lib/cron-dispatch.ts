// src/lib/cron-dispatch.ts: aturan pemilihan user untuk cron massal (MURNI).
//
// Latar: alih-alih tiap pengguna memasang cronnya sendiri di cron-job.org
// (rawan lupa & merepotkan), SATU pemicu admin (GitHub Actions) memanggil
// endpoint dispatcher sekali tiap jam. Endpoint itu lalu memilih "siapa yang
// jatuh tempo pada jam ini" dan menjalankan performSubmit untuk masing-masing.
//
// Modul ini SENGAJA murni (tanpa DB/jaringan/Date.now) supaya aturan seleksi
// dan pembagian gelombang bisa diuji tanpa efek samping. Route hanya menyuapkan
// data; keputusan ada di sini.

import { AUTOMATION_TIMEZONE } from "./automation";

/** Satu baris kandidat, hanya field yang dibutuhkan untuk memilih. */
export type DueCandidate = {
  userId: string;
  /** Jam jadwal pengguna (0–23) di Asia/Jakarta. */
  hour: number;
  /** Menit jadwal pengguna (0–59). */
  minute: number;
};

/** Hasil pembagian: gelombang yang diproses + sisanya untuk pemanggilan berikutnya. */
export type DispatchPlan = {
  /** Kandidat yang akan diproses SEKARANG (maksimal `batchSize`). */
  due: DueCandidate[];
  /** Kandidat yang sah untuk jam ini tetapi tertunda ke pemanggilan berikutnya. */
  deferred: DueCandidate[];
};

/**
 * Ambil jam (0–23) di Asia/Jakarta dari sebuah `Date`.
 *
 * MURNI terhadap argumennya, bisa diuji dengan tanggal tetap. Memakai `Intl`
 * (bukan offset tetap UTC+7) supaya benar bahkan bila aturan zona berubah.
 */
export function jakartaHour(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AUTOMATION_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  // `Intl` kadang mengembalikan "24" untuk tengah malam di sebagian ICU lama.
  return Number(hour) % 24;
}

/**
 * Apakah pengguna ini jatuh tempo pada `currentHour` (jam Jakarta)?
 *
 * Aturan: jadwal dianggap jatuh tempo bila `hour`-nya SAMA dengan jam sekarang.
 * Menit sengaja DIABAIKAN: cron berjalan sekali tiap jam, jadi menuntut menit
 * yang sama persis akan membuat jadwal (mis. 07:30) tak pernah tercapai. Ini
 * berarti pengguna bisa terkirim kapan saja dalam jam jadwalnya, cukup untuk
 * absensi harian dan jauh lebih andal daripada menuntut ketepatan menit.
 */
export function isDueNow(candidate: DueCandidate, currentHour: number): boolean {
  return candidate.hour === currentHour;
}

/**
 * Pilih gelombang pemrosesan: saring yang jatuh tempo pada jam ini, lalu batasi
 * jumlahnya agar satu pemanggilan fungsi tak melewati batas waktu platform.
 *
 * @param candidates  Semua user otomasi aktif (sudah disaring `isEnabled`).
 * @param currentHour Jam Asia/Jakarta sekarang (lihat `jakartaHour`).
 * @param batchSize   Batas maksimum per pemanggilan. Sisanya → `deferred`.
 */
export function planDispatch(
  candidates: DueCandidate[],
  currentHour: number,
  batchSize: number,
): DispatchPlan {
  const dueAll = candidates.filter((c) => isDueNow(c, currentHour));
  if (batchSize <= 0) {
    return { due: [], deferred: dueAll };
  }
  return {
    due: dueAll.slice(0, batchSize),
    deferred: dueAll.slice(batchSize),
  };
}
