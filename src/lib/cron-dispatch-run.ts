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
import { plainDateToUtcDate, todayInJakarta, toPlainDate } from "@/lib/submit-service";
import { chooseTemplate } from "@/lib/template-selection";
import { performSubmit, type SubmitOutcome } from "@/lib/perform-submit";
import { jakartaHour, planDispatch, type DueCandidate } from "@/lib/cron-dispatch";
import { prepareCommitDraft, contentOf } from "@/lib/commit-draft-service";
import { chooseReportContent } from "@/lib/report-source";

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
  // Tanggal dihitung SEBELUM query karena dipakai untuk menyaring template
  // bertanggal. Diturunkan dari `now` (bukan `new Date()`) supaya jam dan
  // tanggal selalu berasal dari waktu acuan yang sama.
  const date = todayInJakarta(now);
  // WAJIB gagal keras bila tanggal tak terbaca. `?? undefined` akan MENGHAPUS
  // saringan, sehingga query kembali memuat SELURUH riwayat template bertanggal
  // (persis pemborosan yang ingin dicegah) tanpa ada tanda apa pun.
  const hariIni = plainDateToUtcDate(date);
  if (!hariIni) {
    throw new Error(`Tanggal WIB tidak dapat dibaca: "${date}"`);
  }

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
            // Hanya tanggal hari ini: tanpa saringan ini, seluruh riwayat
            // template bertanggal semua pengguna ikut terbaca di setiap
            // pemanggilan cron, dan jumlahnya bertambah tiap hari (draf commit
            // disimpan sebagai baris bertanggal).
            where: { date: hariIni },
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

  // `date` dihitung di atas (sebelum query) dan WAJIB diturunkan dari `now`,
  // bukan dari `new Date()`. Lihat komentar di deklarasi `date`.
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
          // --- Sumber isi laporan (SPEC §5.3a, diputuskan pemilik) -------------
          // commit hari itu -> template bertanggal -> template harian -> batal.
          //
          // `prepareCommitDraft` MENYIMPAN hasilnya sebagai template bertanggal
          // hari itu, sehingga pengguna bisa membuka & menyuntingnya di
          // /report-templates. Kalau baris bertanggal sudah ada (tulisan atau
          // suntingan pengguna), ia TIDAK menimpa — suntingan manusia menang.
          //
          // Kegagalan git tidak pernah menghalangi kirim: hasilnya NO_COMMITS
          // dan alur jatuh ke template di bawah.
          const commitOutcome = await prepareCommitDraft(cfg.userId, date);

          const dated = cfg.user.datedTemplates.map((t) => ({
            date: toPlainDate(t.date),
            activity: t.activity,
            learning: t.learning,
            obstacles: t.obstacles,
          }));

          // Bila draf baru saja disimpan, ia sudah ada di `datedTemplates` yang
          // dibaca SEBELUM penyimpanan — jadi salinan DB itu belum memuatnya.
          // Kita suntikkan isi segar agar tidak perlu query ulang per user.
          const dipilih = chooseReportContent(
            date,
            contentOf(commitOutcome),
            cfg.user.template,
            dated,
          );

          const outcome: SubmitOutcome = await performSubmit({
            userId: cfg.userId,
            date,
            // Pemanggil lama memakai `chooseTemplate`; kini urutannya ditentukan
            // `chooseReportContent`. `chooseTemplate` tetap dipakai sebagai
            // cadangan bila pemilihan baru tidak menemukan apa pun, supaya
            // perilaku lama tidak berubah untuk data yang sudah ada.
            template: dipilih.content ?? chooseTemplate(
              date,
              cfg.user.template,
              dated,
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
