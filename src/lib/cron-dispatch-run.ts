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
import { planTopUp, topUpNote } from "@/lib/cron-topup";
import { prepareCommitDraft, contentOf } from "@/lib/commit-draft-service";
import { chooseReportContent } from "@/lib/report-source";
import { jakartaDayRange } from "@/lib/admin-automation";

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
  /** Jumlah yang tertunda (jam lain, tenggat tercapai, atau batch penuh). */
  deferred: number;
  /**
   * Jumlah user yang jadwalnya SUDAH LEWAT tetapi belum tuntas hari ini dan
   * belum sempat dicoba pada pemanggilan ini. Mereka akan diambil pemanggilan
   * berikutnya (lihat cron-topup.ts). Bukan kegagalan, tetapi harus terlihat.
   */
  topUpPending: number;
  /** Penjelasan singkat bila `topUpPending > 0`, selain itu null. */
  note: string | null;
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
  const { due } = planDispatch(candidates, hour, DISPATCH_BATCH_SIZE);

  // --- Pemanggilan ulang untuk yang jadwalnya sudah lewat ---------------------
  // Tanpa ini, user yang tertunda pada jam jadwalnya hilang selamanya: jam
  // berikutnya `isDueNow` menjawab "tidak" dan tidak ada yang mencobanya lagi.
  // Lihat cron-topup.ts untuk alasan aturan ini.
  const sudahTuntas = await settledTodayUserIds(now);
  const sisaKuota = Math.max(0, DISPATCH_BATCH_SIZE - due.length);
  const topUp = planTopUp(candidates, hour, sudahTuntas, sisaKuota);

  // `due` (jam jadwal = sekarang) didahulukan supaya jadwal normal tidak
  // tergeser oleh pengejaran yang tertunda. Yang lolos batas batch menjadi
  // `topUpPending` dan tetap dikejar pada pemanggilan berikutnya.
  const work = [...due, ...topUp.due];
  const byUser = new Map(configs.map((c) => [c.userId, c]));

  // `date` dihitung di atas (sebelum query) dan WAJIB diturunkan dari `now`,
  // bukan dari `new Date()`. Lihat komentar di deklarasi `date`.
  const start = Date.now();
  const results: DispatchUserResult[] = [];
  let deadlineHit = false;

  for (let i = 0; i < work.length; i += DISPATCH_CONCURRENCY) {
    if (Date.now() - start > DISPATCH_DEADLINE_MS) {
      deadlineHit = true;
      break;
    }
    const slice = work.slice(i, i + DISPATCH_CONCURRENCY);
    // Nama `gelombang` (bukan `settled`): `settled` sudah dipakai untuk himpunan
    // user yang tuntas hari ini di atas. Dulu variabel ini menimpa nama itu —
    // shadowing yang lolos typecheck tetapi menyulitkan pembacaan.
    const gelombang = await Promise.all(
      slice.map(async (cand) => {
        const cfg = byUser.get(cand.userId);
        if (!cfg) return { userId: cand.userId, kind: "SKIPPED" };
        try {
          // Tenggat diperiksa LAGI per-user: satu gelombang berisi 10 user yang
          // masing-masing menunggu jaringan portal bisa sendiri melewati
          // `maxDuration` (60s) walau pemeriksaan di atas gelombang lolos.
          // User yang sudah lewat tenggat dikembalikan "DEFERRED" agar
          // dilaporkan sebagai ditunda, bukan seolah diproses. Ia TIDAK
          // menghalangi user lain di gelombang yang sama.
          if (Date.now() - start > DISPATCH_DEADLINE_MS) {
            return { userId: cand.userId, kind: "DEFERRED" };
          }

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
    results.push(...gelombang);
  }

  // `DEFERRED` adalah user yang sudah masuk gelombang tetapi per-user tenggat
  // terlewati. Ia TIDAK dihitung sebagai `processed` (memang tidak diproses),
  // tetapi juga bukan "menunggu dikejar" — ia sudah dicoba, hanya kehabisan
  // waktu, jadi ia masuk `deferred`.
  const processed = results.filter((r) => r.kind !== "DEFERRED").length;
  const deferredByDeadline = results.length - processed;

  // --- Hitungan ringkasan ----------------------------------------------------
  // Satu-satunya bagian yang bisa salah tanpa terlihat, jadi `deferred`
  // diturunkan dari INVARIAN dan bukan dari penjumlahan kelompok yang rawan
  // tumpang tindih (versi sebelumnya menghasilkan 42 untuk 41 user):
  //
  //     considered = processed + deferred
  //
  // Setiap user pasti salah satu: didatangi (processed) atau tidak (deferred).
  const deferredTotal = configs.length - processed;

  // Yang masih harus dikejar pemanggilan berikutnya: belum tuntas, tetapi tidak
  // sempat didatangi. Dihitung dari himpunan kandidat yang benar-benar tidak
  // tersentuh — bukan dari "sisa kuota" — supaya user yang tak terjangkau kuota
  // tidak terhitung dua kali.
  const sudahDidatangi = new Set(results.map((r) => r.userId));
  const topUpPending = candidates.filter(
    (c) => !sudahDidatangi.has(c.userId) && !sudahTuntas.has(c.userId),
  ).length;

  return {
    ok: true,
    hour,
    considered: configs.length,
    processed,
    deferred: deferredTotal,
    topUpPending,
    note: topUpNote(topUpPending),
    deadlineHit: deadlineHit || deferredByDeadline > 0,
    results,
  };
}

/**
 * User yang SUDAH tuntas hari ini (log SUCCESS atau DUPLICATE), dari SATU query.
 *
 * Dipakai untuk memilih siapa yang perlu dikejar ulang (cron-topup.ts). Sengaja
 * hanya membaca `userId` — tidak ada isi laporan atau rahasia yang ikut.
 *
 * Kegagalan query TIDAK boleh menggagalkan dispatch: bila lookup ini gagal,
 * lebih aman menganggap "belum ada yang tuntas" dan membiarkan `performSubmit`
 * (yang punya penjaga serupa per user) memutuskan. Itu bisa berarti satu
 * percobaan berlebih, tetapi percobaan berlebih tertahan pra-cek duplikat di
 * portal; sebaliknya, menganggap "semua tuntas" akan diam-diam melewatkan
 * laporan orang.
 */
async function settledTodayUserIds(now: Date): Promise<ReadonlySet<string>> {
  const range = jakartaDayRange(now);
  if (!range) return new Set();
  try {
    const rows = await prisma.submitLog.findMany({
      where: {
        status: { in: ["SUCCESS", "DUPLICATE"] },
        createdAt: { gte: range.start, lt: range.end },
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    return new Set(rows.map((r) => r.userId));
  } catch {
    return new Set();
  }
}
