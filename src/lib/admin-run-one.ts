// src/lib/admin-run-one.ts: INTI eksekusi "jalankan otomasi untuk 1 user" (Panel Admin).
//
// Latar: dispatcher massal hanya memproses user yang jam jadwalnya = jam
// sekarang, jadi admin tak bisa "mengejar" satu orang yang terlewat tanpa
// menunggu jam berikutnya. Fitur ini memberi admin tombol per-baris untuk
// MEMAKSA jalankan otomasi seorang pengguna, apa pun status hari itu.
//
// Konsistensi yang dijaga:
//   - Memakai `performSubmit` yang sama dengan dispatcher massal & webhook,
//     jadi aturan laporan (libur/akhir pekan/akhir program, pra-cek duplikat,
//     gerbang ALLOW_LIVE_SUBMIT) TIDAK dilanggar. "Paksa" berarti "abaikan jam
//     jadwal", BUKAN "abaikan kebijakan laporan".
//   - Pemicu tetap tercatat sebagai `CRON`: ini bukan submit manual oleh
//     pengguna, melainkan tindakan sistem atas namanya (keputusan pemilik).
//
// Yang TIDAK di sini: bentuk respons HTTP + penjagaan sesi, itu urusan route.

import { prisma } from "@/lib/prisma";
import { todayInJakarta, toPlainDate } from "@/lib/submit-service";
import { chooseTemplate } from "@/lib/template-selection";
import { performSubmit, type SubmitOutcome } from "@/lib/perform-submit";

/** Hasil eksekusi: berhasil menyeleksi user + hasil submit terstruktur. */
export type RunOneResult =
  | { ok: true; outcome: SubmitOutcome; userId: string; email: string }
  | { ok: false; reason: "NOT_FOUND" | "DELETED" };

/**
 * Jalankan otomasi untuk SATU pengguna, tanpa memandang jam jadwalnya.
 *
 * Mengembalikan `NOT_FOUND`/`DELETED` bila sasaran tidak layak supaya route
 * bisa memetakan status HTTP yang tepat; selebihnya `ok: true` dengan hasil
 * terstruktur (route memetakan ke ringkasan ringkas, tanpa rahasia).
 *
 * @param userId  Sasaran. Dipanggil setelah route memverifikasi admin.
 * @param now     Waktu acuan (disuntik untuk pengujian).
 */
export async function runOne(userId: string, now: Date = new Date()): Promise<RunOneResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      deletedAt: true,
      template: { select: { activity: true, learning: true, obstacles: true } },
      datedTemplates: {
        select: { date: true, activity: true, learning: true, obstacles: true },
      },
      credential: {
        select: {
          tokenCiphertext: true,
          tokenIv: true,
          tokenAuthTag: true,
          accessCiphertext: true,
          accessIv: true,
          accessAuthTag: true,
          accessExpiresAt: true,
        },
      },
    },
  });

  if (!user) return { ok: false, reason: "NOT_FOUND" };
  if (user.deletedAt) return { ok: false, reason: "DELETED" };

  const date = todayInJakarta(now);

  const outcome = await performSubmit({
    userId: user.id,
    date,
    template: chooseTemplate(
      date,
      user.template,
      user.datedTemplates.map((t) => ({
        date: toPlainDate(t.date),
        activity: t.activity,
        learning: t.learning,
        obstacles: t.obstacles,
      })),
    ).template,
    credential: user.credential,
    trigger: "CRON",
    // Sama seperti cron: catat SEMUA alasan tidak-siap (termasuk libur) supaya
    // Riwayat & tabel admin menunjukkan "hari ini dicek, memang libur".
    logOnNotReady: true,
  });

  return { ok: true, outcome, userId: user.id, email: user.email };
}

/**
 * Ringkas hasil submit menjadi bentuk ringan untuk UI admin (tanpa rahasia).
 * TIDAK PERNAH memuat token/pesan portal mentah.
 */
export type RunOneSummary = {
  /** Satu kata status: SUBMITTED | NOT_READY | DRY_RUN | TOKEN_UNREADABLE | EXCHANGE_FAILED | BAD_DATE. */
  kind: SubmitOutcome["kind"];
  ok: boolean;
  message: string;
};

export function summarizeRunOne(outcome: SubmitOutcome): RunOneSummary {
  switch (outcome.kind) {
    case "SUBMITTED":
      return { kind: "SUBMITTED", ok: outcome.ok, message: outcome.message };
    case "NOT_READY":
      return { kind: "NOT_READY", ok: false, message: outcome.message };
    case "DRY_RUN":
      return {
        kind: "DRY_RUN",
        ok: true,
        message: `Latihan (DRY_RUN): laporan ${outcome.date} siap dikirim.`,
      };
    case "TOKEN_UNREADABLE":
      return { kind: "TOKEN_UNREADABLE", ok: false, message: outcome.message };
    case "EXCHANGE_FAILED":
      return { kind: "EXCHANGE_FAILED", ok: false, message: outcome.message };
    case "BAD_DATE":
      return {
        kind: "BAD_DATE",
        ok: false,
        message: `Tanggal tidak sah: ${outcome.date}.`,
      };
  }
}
