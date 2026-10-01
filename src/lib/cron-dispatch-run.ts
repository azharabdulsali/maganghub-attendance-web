// src/lib/cron-dispatch-run.ts: INTI eksekusi dispatcher massal (Tahap 6).
//
// Dipisahkan dari dua route agar aturannya satu sumber:
//   - GET /api/cron/run-all  → dijaga CRON_SECRET (dipanggil GitHub Actions).
//   - POST /api/admin/dispatch → dijaga sesi ADMIN (tombol manual di panel).
//
// Yang ada di sini: query user otomasi aktif, seleksi per jam (cron-dispatch.ts),
// lalu jalankan performSubmit PARALEL BERBATAS. Yang TIDAK di sini: bentuk
// respons HTTP, itu urusan tiap route, sama seperti pemisahan di
// perform-submit.ts.

import { prisma } from "@/lib/prisma";
import { todayInJakarta, toPlainDate } from "@/lib/submit-service";
import { chooseTemplate } from "@/lib/template-selection";
import { performSubmit, type SubmitOutcome } from "@/lib/perform-submit";
import { jakartaHour, planDispatch, type DueCandidate } from "@/lib/cron-dispatch";

/** Berapa user diproses bersamaan. Menahan burst tanpa membanjiri portal. */
export const DISPATCH_CONCURRENCY = 10;

/** Batas user per pemanggilan; sisanya diproses jam berikutnya (jitter alami). */
export const DISPATCH_BATCH_SIZE = 40;

/** Berhenti menerima hasil baru setelah tenggat ini (di bawah maxDuration 60s). */
export const DISPATCH_DEADLINE_MS = 50_000;

/** Satu ringkasan hasil per user, TANPA rahasia apa pun. */
export type DispatchUserResult = { userId: string; kind: string };

export type DispatchSummary = {
  ok: true;
  /** Jam WIB saat pemilihan dilakukan. */
  hour: number;
  /** Jumlah user dengan otomasi aktif yang dipertimbangkan. */
  considered: number;
  /** Jumlah yang benar-benar diproses pada pemanggilan ini. */
  processed: number;
  /** Jumlah yang tertunda (jam lain, atau tenggat tercapai). */
  deferred: number;
  /** True bila tenggat internal tercapai sebelum semua yang jatuh tempo selesai. */
  deadlineHit: boolean;
  results: DispatchUserResult[];
};

/**
 * Jalankan dispatcher: pilih user yang jatuh tempo pada jam WIB sekarang, lalu
 * kirim laporan untuk masing-masing, paralel berbatas, satu gagal tidak
 * menjatuhkan yang lain.
 *
 * @param now  Waktu acuan (bisa disuntik untuk pengujian).
 */
export async function runDispatch(now: Date = new Date()): Promise<DispatchSummary> {
  // Semua user otomasi aktif + data yang dibutuhkan untuk mengirim.
  const configs = await prisma.automationConfig.findMany({
    where: { isEnabled: true },
    select: {
      userId: true,
      hour: true,
      minute: true,
      user: {
        select: {
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
      },
    },
  });

  const candidates: DueCandidate[] = configs.map((c) => ({
    userId: c.userId,
    hour: c.hour,
    minute: c.minute,
  }));
  const hour = jakartaHour(now);
  const { due, deferred } = planDispatch(candidates, hour, DISPATCH_BATCH_SIZE);
  const byUser = new Map(configs.map((c) => [c.userId, c]));

  const date = todayInJakarta();
  const start = Date.now();
  const results: DispatchUserResult[] = [];
  let deadlineHit = false;

  for (let i = 0; i < due.length; i += DISPATCH_CONCURRENCY) {
    if (Date.now() - start > DISPATCH_DEADLINE_MS) {
      deadlineHit = true;
      break;
    }
    const slice = due.slice(i, i + DISPATCH_CONCURRENCY);
    const settled = await Promise.all(
      slice.map(async (cand) => {
        const cfg = byUser.get(cand.userId);
        if (!cfg) return { userId: cand.userId, kind: "SKIPPED" };
        try {
          const outcome: SubmitOutcome = await performSubmit({
            userId: cfg.userId,
            date,
            template: chooseTemplate(
              date,
              cfg.user.template,
              cfg.user.datedTemplates.map((t) => ({
                date: toPlainDate(t.date),
                activity: t.activity,
                learning: t.learning,
                obstacles: t.obstacles,
              })),
            ).template,
            credential: cfg.user.credential,
            trigger: "CRON",
            logOnNotReady: true,
          });
          return { userId: cand.userId, kind: outcome.kind };
        } catch {
          // Satu user gagal TIDAK boleh menggagalkan gelombang ini.
          return { userId: cand.userId, kind: "ERROR" };
        }
      }),
    );
    results.push(...settled);
  }

  return {
    ok: true,
    hour,
    considered: configs.length,
    processed: results.length,
    deferred: deferred.length + (deadlineHit ? due.length - results.length : 0),
    deadlineHit,
    results,
  };
}
