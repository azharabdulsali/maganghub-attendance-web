// src/lib/dispatch-log.ts: mencatat ringkasan tiap pemanggilan dispatcher cron.
//
// Kenapa perlu: `runDispatch` mengembalikan ringkasan (processed, deferred,
// deadlineHit, topUpPending) ke pemanggil HTTP, lalu ringkasan itu HILANG.
// Pemanggilnya adalah GitHub Actions yang hanya menyimpan log mentah beberapa
// hari, jadi pertanyaan "apakah cron kemarin kena tenggat?" tidak bisa dijawab
// dari aplikasi — padahal itulah tanda paling awal bahwa jam jadwal terlalu
// padat atau portal sedang lambat.
//
// Yang dicatat SENGAJA hanya angka: tidak ada id user, tidak ada isi laporan,
// tidak ada rahasia. Baris ini milik sistem, bukan milik pengguna, jadi ia
// tidak boleh bocor ke UI pengguna biasa.
//
// Tabelnya `AdminActionLog` dengan `action: SYSTEM_DISPATCH` dan actor/target
// dipetakan ke akun admin yang memicu (untuk tombol manual) atau ke satu baris
// penanda untuk cron. Alasan memakai tabel yang sudah ada, bukan tabel baru:
// artinya sama (tindakan sistem atas data orang lain), sudah punya indeks
// waktu, dan tidak perlu migrasi relasi baru. Bila kelak butuh analitik
// terpisah, baris ini mudah dipindahkan karena bentuknya hanya angka.

import { prisma } from "./prisma";
import type { DispatchSummary } from "./cron-dispatch-run";

/** Ringkasan yang aman dicatat: hanya angka & boolean, tanpa id user. */
export type DispatchLogFields = {
  hour: number;
  considered: number;
  processed: number;
  deferred: number;
  topUpPending: number;
  deadlineHit: boolean;
};

/**
 * Ambil HANYA angka dari ringkasan dispatch, MURNI.
 *
 * `results` sengaja TIDAK ikut: ia berisi `userId`, dan menyimpannya di log
 * sistem akan menggandakan data pribadi ke tempat yang tidak diperlukan untuk
 * diagnosis. Angka sudah cukup untuk menjawab "apakah ada yang tertinggal".
 */
export function dispatchLogFields(summary: DispatchSummary): DispatchLogFields {
  return {
    hour: summary.hour,
    considered: summary.considered,
    processed: summary.processed,
    deferred: summary.deferred,
    topUpPending: summary.topUpPending,
    deadlineHit: summary.deadlineHit,
  };
}

/**
 * Satu baris ringkas untuk dibaca manusia di panel admin, MURNI.
 * Bentuk sengaja stabil supaya mudah di-grep di log Vercel.
 */
export function formatDispatchLog(fields: DispatchLogFields): string {
  const bagian = [
    `jam ${fields.hour} WIB`,
    `${fields.processed}/${fields.considered} diproses`,
    `${fields.deferred} tertunda`,
  ];
  if (fields.topUpPending > 0) bagian.push(`${fields.topUpPending} menunggu dikejar`);
  if (fields.deadlineHit) bagian.push("TENGGAT TERCAPAI");
  return bagian.join(" · ");
}

/**
 * Tulis ringkasan dispatch ke `AdminActionLog`, TIDAK PERNAH melempar.
 *
 * Kegagalan pencatatan tidak boleh menggagalkan pengiriman laporan: laporan
 * yang sudah terkirim adalah fakta yang jauh lebih penting daripada baris
 * observasinya. Karena itu seluruh fungsi ini dibungkus try/catch dan hasilnya
 * hanya boolean untuk keperluan tes.
 *
 * `actorId`/`targetId` berasal dari pemanggil (akun admin untuk tombol manual,
 * penanda sistem untuk cron). Bila salah satunya tidak ada, pencatatan
 * dilewati: lebih baik tidak mencatat daripada mencatat dengan id palsu.
 */
export async function recordDispatchLog(input: {
  actorId: string | null;
  targetId: string | null;
  summary: DispatchSummary;
}): Promise<boolean> {
  const { actorId, targetId, summary } = input;
  if (!actorId || !targetId) return false;

  try {
    await prisma.adminActionLog.create({
      data: {
        action: "SYSTEM_DISPATCH",
        actorId,
        targetId,
        reason: formatDispatchLog(dispatchLogFields(summary)),
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Id akun yang dipakai sebagai actor+target untuk baris cron (tanpa sesi).
 *
 * `AdminActionLog` mewajibkan relasi ke `User`, jadi baris sistem tetap butuh
 * id nyata. Yang dipilih adalah **admin aktif pertama** (urut `createdAt`):
 * deterministik, bukan acak, dan tidak bergantung pada waktu pemanggilan.
 * Konsekuensinya tercatat di `AdminActionLog` seolah admin itu pelakunya; itu
 * memang kompromi yang disengaja — jenis aksinya `SYSTEM_DISPATCH` sehingga
 * pembaca log tahu ini tindakan sistem, bukan tindakan admin tersebut.
 *
 * Mengembalikan null bila belum ada admin sama sekali (aplikasi baru). Dalam
 * kasus itu pencatatan dilewati; dispatch tetap berjalan.
 *
 * Tidak pernah melempar: kegagalan DB di sini tidak boleh menghalangi kirim.
 */
export async function systemActorId(): Promise<string | null> {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return admin?.id ?? null;
  } catch {
    return null;
  }
}
