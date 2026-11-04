// src/lib/cron-topup.ts: aturan pemilihan user untuk pemanggilan ULANG (MURNI).
//
// Latar (celah yang ditutup): `planDispatch` hanya memilih user yang JAM
// jadwalnya sama dengan jam sekarang. Bila seorang user tertunda pada jam
// jadwalnya — karena batch penuh, tenggat internal 50 dtk tercapai, atau
// gelombangnya belum sempat jalan — ia TIDAK PERNAH dicoba lagi. Jam 08:00
// berikutnya `isDueNow` menjawab "tidak", user itu hilang dari pandangan dan
// laporannya tidak terkirim hari itu tanpa suara.
//
// Solusinya dua lapis dan keduanya perlu, karena kegagalan bisa terjadi di
// tingkat berbeda:
//   1. `planTopUp` (di sini) — memilih user yang jam jadwalnya SUDAH LEWAT dan
//      belum punya jejak TUNTAS hari ini. Menangkap yang tertunda karena batch
//      penuh / tenggat, yang tidak pernah mengembalikan hasil apa pun.
//   2. `performSubmit` (jalur CRON) — sudah punya penjaga "sudah tuntas?" dari
//      SubmitLog. Itu menangkap yang tertunda setelah `performSubmit` SEMPAT
//      menulis baris (mis. gagal jaringan), karena log FAILED tidak menutup
//      kesempatan coba lagi.
//
// Keduanya bertumpuk dengan sengaja: lapis 1 murah (satu query log per
// pemanggilan) dan lapis 2 sudah ada. Duplikat percobaan mustahil terjadi
// karena lapis 2 yang menentukan — bukan daftar di sini.
//
// Modul ini MURNI: tanpa DB, tanpa jaringan, tanpa `Date.now`. Keputusan ada
// di sini, pengambilan data di cron-dispatch-run.ts.

import type { DueCandidate } from "./cron-dispatch";

/** Satu kandidat untuk pemanggilan ulang: user + jam jadwalnya. */
export type TopUpCandidate = DueCandidate;

/**
 * Apakah jadwal user ini SUDAH LEWAT pada jam `currentHour` (WIB)?
 *
 * Bedanya dengan `isDueNow` (yang menuntut jam SAMA PERSIS): di sini jam
 * sekarang harus LEBIH BESAR. User jadwal 12:00 pada pukul 13:00 atau 20:00
 * sudah lewat; pada 11:00 belum, jadi tidak boleh dikirim lebih awal.
 *
 * Dua kasus pinggir yang disengaja:
 *   - Jam yang sama TIDAK dianggap lewat. Slot itu sudah ditangani
 *     `planDispatch` lewat jalur normal (batch + tenggatnya sendiri). Bila
 *     keduanya ikut memilih, user yang sama masuk dua kali dalam satu
 *     pemanggilan.
 *   - Tengah malam: jadwal 23:00 yang tertunda baru bisa dikejar pukul 00:00
 *     besoknya. Karena itu "lewat" dihitung dari `hour < currentHour` dan
 *     BUKAN dari selisih hari — jadwal 23:00 pada pukul 00:30 memang tidak
 *     lolos. Ini kompromi yang disengaja: laporan tanggal kemarin yang
 *     terkirim hari ini lebih buruk daripada absen yang terlihat di riwayat.
 *     Yang tetap tertolong adalah jadwal pagi/siang yang tertunda, yaitu
 *     mayoritas.
 */
export function isOverdueNow(candidate: TopUpCandidate, currentHour: number): boolean {
  return currentHour > candidate.hour;
}

/** Kandidat mana yang punya jejak TUNTAS hari ini (SUCCESS/DUPLICATE). */
export type SettledLookup = ReadonlySet<string>;

/**
 * Pilih user yang perlu dicoba ULANG: jadwalnya sudah lewat, dan hari ini ia
 * BELUM punya log tuntas.
 *
 * `settledUserIds` berasal dari satu query `SubmitLog` (status SUCCESS atau
 * DUPLICATE, tanggal WIB hari ini). User yang TIDAK ada di himpunan itu berarti
 * belum tuntas — termasuk yang belum pernah dicoba sama sekali (mis. server
 * mati pada jam jadwalnya) dan yang percobaannya FAILED (boleh diulang).
 *
 * @param candidates     Semua user otomasi aktif (sudah disaring `isEnabled`).
 * @param currentHour    Jam Asia/Jakarta sekarang.
 * @param settledUserIds User yang sudah tuntas hari ini.
 * @param limit          Batas jumlah per pemanggilan (mis. `DISPATCH_BATCH_SIZE`).
 */
export function planTopUp(
  candidates: TopUpCandidate[],
  currentHour: number,
  settledUserIds: SettledLookup,
  limit: number,
): { due: TopUpCandidate[]; remaining: number } {
  const overdue = candidates.filter(
    (c) => isOverdueNow(c, currentHour) && !settledUserIds.has(c.userId),
  );
  if (limit <= 0) {
    return { due: [], remaining: overdue.length };
  }
  return {
    due: overdue.slice(0, limit),
    remaining: Math.max(0, overdue.length - limit),
  };
}

/**
 * Pesan pendek untuk ringkasan cron: menjelaskan MENGAPA sejumlah user tidak
 * diproses pada pemanggilan ini. Kosong bila tidak ada yang tertunda.
 *
 * Ditampilkan di log GitHub Actions / panel admin supaya "processed: 3" tidak
 * disalahartikan sebagai "semua aman".
 */
export function topUpNote(remaining: number): string | null {
  if (remaining <= 0) return null;
  return `${remaining} user tertunda akan dicoba lagi pada pemanggilan berikutnya.`;
}
