// src/lib/perform-submit.ts — inti pengiriman laporan, dipakai bersama dua route.
//
// Latar belakang: `POST /api/reports/submit` (manual) dan `GET /api/cron/submit`
// (webhook) melakukan LANGKAH yang sama — cek kesiapan → dekripsi token →
// tukar access token → kirim → catat audit log. Sebelumnya blok itu disalin
// nyaris identik di dua berkas; setiap perubahan aturan harus dilakukan dua
// kali, sumber bug yang jelas.
//
// Yang TIDAK disatukan (sengaja): bentuk respons HTTP. Manual membalas 500 saat
// token rusak & 410 saat program berakhir; cron SELALU 200 karena cron eksternal
// tak bisa menafsirkan status aneh. Itu keputusan per-konsumen, bukan logika
// pengiriman. Karena itu fungsi ini mengembalikan HASIL terstruktur, dan tiap
// route memetakannya sendiri.

import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { exchangeRefreshForAccess, submitReport } from "@/lib/monev-submit";
import { isAccessTokenFresh } from "@/lib/credential-session-policy";
import {
  assessReadiness,
  payloadFromTemplate,
  plainDateToUtcDate,
  policyMessage,
  submitStatusFor,
  type SubmitReadiness,
} from "@/lib/submit-service";

export type SubmitTrigger = "MANUAL" | "CRON";

/** Bentuk template/credential yang dibutuhkan pengiriman. */
export type SubmitTemplate = {
  activity: string;
  learning: string;
  obstacles: string;
} | null;

export type SubmitCredential = {
  tokenCiphertext: string | null;
  tokenIv: string | null;
  tokenAuthTag: string | null;
  /**
   * Access token hasil login otomatis (opsional). Bila masih segar, dipakai
   * LANGSUNG tanpa menukar refresh token — lebih hemat & tidak menyentuh
   * jaringan portal dua kali.
   */
  accessCiphertext?: string | null;
  accessIv?: string | null;
  accessAuthTag?: string | null;
  accessExpiresAt?: Date | null;
} | null;

/** Hasil terstruktur — satu cabang per kemungkinan akhir. */
export type SubmitOutcome =
  | { kind: "NOT_READY"; reason: string; message: string; date: string }
  | { kind: "BAD_DATE"; date: string }
  | { kind: "DRY_RUN"; date: string; policy: string }
  | { kind: "TOKEN_UNREADABLE"; message: string }
  | { kind: "EXCHANGE_FAILED"; status: string; message: string; date: string }
  | {
      kind: "SUBMITTED";
      ok: boolean;
      status: string;
      message: string;
      date: string;
      httpCode?: number;
    };

/** Pesan Indonesia untuk tiap alasan tidak-siap (dulu disalin di dua route). */
export function readinessMessage(reason: string): string {
  switch (reason) {
    case "POLICY_SKIPPED":
      return policyMessage("SKIPPED");
    case "PROGRAM_ENDED":
      return policyMessage("PROGRAM_ENDED");
    case "NO_TEMPLATE":
      return "Template laporan belum diisi. Lengkapi dulu di menu Template Laporan.";
    case "NO_TOKEN":
      return "Belum ada token Monev tersimpan. Tempel token di menu Kredensial Monev.";
    default:
      return "Tidak siap mengirim.";
  }
}

/** Gerbang keselamatan: kirim nyata hanya bila `ALLOW_LIVE_SUBMIT=1`. */
export function liveSubmitEnabled(): boolean {
  return process.env.ALLOW_LIVE_SUBMIT === "1";
}

/**
 * Catat percobaan ke audit log. Sengaja menelan error tulis: kegagalan mencatat
 * TIDAK boleh menggagalkan respons dari portal (itu masalah DB, bukan kirim).
 */
export async function safeLog(entry: {
  userId: string;
  status: "SUCCESS" | "FAILED" | "DUPLICATE";
  message: string;
  httpCode?: number;
  trigger: SubmitTrigger;
  /** Bila ada, hubungkan log ke baris Report terkait (SPEC.md §7). */
  reportId?: string;
}): Promise<void> {
  try {
    await prisma.submitLog.create({
      data: {
        userId: entry.userId,
        status: entry.status,
        message: entry.message.slice(0, 1000),
        httpCode: entry.httpCode,
        trigger: entry.trigger,
        reportId: entry.reportId,
      },
    });
  } catch {
    // Sengaja diabaikan — lihat komentar di atas.
  }
}

/** Terjemahkan `SubmitStatus` (SubmitLog) → `ReportStatus` (Report). MURNI. */
function reportStatusFor(
  status: "SUCCESS" | "FAILED" | "DUPLICATE",
): "SUBMITTED" | "FAILED" | "PRESENT_ALREADY_EXISTS" {
  if (status === "SUCCESS") return "SUBMITTED";
  if (status === "DUPLICATE") return "PRESENT_ALREADY_EXISTS";
  return "FAILED";
}

/**
 * Simpan isi laporan yang BENAR-BENAR dikirim ke portal ke tabel Report.
 *
 * Kenapa ini perlu: SubmitLog hanya menyimpan status/pesan/HTTP code — isi
 * laporan (uraian, pembelajaran, kendala) hilang begitu saja. Akibatnya
 * halaman Template Laporan tidak bisa menampilkan isi laporan historis per
 * tanggal, padahal itu yang diminta. Model `Report` sudah ada di skema (§7)
 * beserta relasi `Report.submitLogs`, tetapi selama ini belum pernah ditulis.
 *
 * `upsert` pada kunci unik `(userId, date)`: template hari yang sama dikirim
 * berulang (mis. percobaan gagal lalu berhasil) tidak menggandakan baris —
 * cukup diperbarui isinya & statusnya. `date` disimpan sebagai tanggal murni
 * (@db.Date) lewat `plainDateToUtcDate`.
 *
 * Mengembalikan `id` Report, atau `undefined` bila tanggal tidak sah / DB
 * menolak — kegagalan menyimpan isi TIDAK boleh menggagalkan respons portal,
 * sama seperti `safeLog`.
 */
async function persistReport(opts: {
  userId: string;
  date: string;
  template: { activity: string; learning: string; obstacles: string };
  status: "SUCCESS" | "FAILED" | "DUPLICATE";
}): Promise<string | undefined> {
  const dateValue = plainDateToUtcDate(opts.date);
  if (!dateValue) return undefined;

  try {
    const report = await prisma.report.upsert({
      where: { userId_date: { userId: opts.userId, date: dateValue } },
      create: {
        userId: opts.userId,
        date: dateValue,
        activity: opts.template.activity,
        learning: opts.template.learning,
        obstacles: opts.template.obstacles,
        source: "TEMPLATE",
        status: reportStatusFor(opts.status),
      },
      update: {
        activity: opts.template.activity,
        learning: opts.template.learning,
        obstacles: opts.template.obstacles,
        source: "TEMPLATE",
        status: reportStatusFor(opts.status),
      },
      select: { id: true },
    });
    return report.id;
  } catch {
    // Senyap — lihat doc comment di atas.
    return undefined;
  }
}

/**
 * Tandai kredensial sebagai INVALID setelah portal menolak tokennya.
 *
 * Kenapa ini ada: `POST /api/credentials/verify` sudah menulis INVALID saat
 * `POST /auth/refresh` membalas 401. Tapi jalur yang paling sering menemui
 * sesi mati adalah pengiriman itu sendiri. Sebelumnya `performSubmit` mencatat
 * FAILED lalu berhenti — status di DB tetap ACTIVE, jadi dashboard tetap
 * bilang "sehat" padahal token sudah mati, dan pengguna tak tahu sampai menekan
 * "Tes ulang" manual. Dua jalur yang menemukan fakta sama tidak boleh berbeda
 * soal menyimpannya.
 *
 * HANYA untuk SESSION_DEAD. Error jaringan juga berarti tukar-token gagal,
 * tetapi tidak membuktikan token buruk — jangan menghukum token yang sah
 * karena Wi-Fi putus. Sama seperti verify route yang tak mengubah status saat ERROR.
 */
export async function markCredentialInvalid(userId: string): Promise<void> {
  try {
    await prisma.maganghubCredential.update({
      where: { userId },
      data: { status: "INVALID" },
    });
  } catch {
    // Senyap: kegagalan menandai status tak boleh menggagalkan respons pengiriman.
  }
}

/**
 * Jalankan alur pengiriman lengkap dan kembalikan hasil terstruktur.
 *
 * Tidak menyentuh `NextResponse`, tidak membaca session/webhook — pemanggil
 * menyediakan `userId`, `date`, template & credential yang sudah diambil.
 *
 * @param opts.logOnNotReady  true (cron): setiap alasan tidak-siap dicatat.
 *                            false (manual): libur/akhir program tidak dicatat
 *                            sebagai FAILED (bukan kegagalan yang bisa diulang).
 */
export async function performSubmit(opts: {
  userId: string;
  date: string;
  template: SubmitTemplate;
  credential: SubmitCredential;
  trigger: SubmitTrigger;
  logOnNotReady: boolean;
}): Promise<SubmitOutcome> {
  const { userId, date, template, credential, trigger, logOnNotReady } = opts;

  const hasRefreshToken = Boolean(
    credential?.tokenCiphertext && credential.tokenIv && credential.tokenAuthTag,
  );

  // Access token dari login otomatis: hanya dihitung "ada" bila lengkap DAN
  // belum kedaluwarsa. Token basi = tidak ada sesi (harus login ulang).
  const hasFreshAccessToken = Boolean(
    credential?.accessCiphertext &&
      credential.accessIv &&
      credential.accessAuthTag &&
      isAccessTokenFresh(credential.accessExpiresAt),
  );

  const hasToken = hasRefreshToken || hasFreshAccessToken;

  // --- Kesiapan data & policy ------------------------------------------------
  let readiness: SubmitReadiness;
  try {
    readiness = assessReadiness({ date, hasTemplate: Boolean(template), hasToken });
  } catch {
    return { kind: "BAD_DATE", date };
  }

  if (!readiness.ready) {
    const message = readinessMessage(readiness.reason);
    const isPolicy =
      readiness.reason === "POLICY_SKIPPED" || readiness.reason === "PROGRAM_ENDED";
    if (logOnNotReady || !isPolicy) {
      await safeLog({ userId, status: "FAILED", message, trigger });
    }
    return {
      kind: "NOT_READY",
      reason: readiness.reason,
      message,
      date: readiness.date,
    };
  }

  // Dari sini: policy ALLOW + template ada + token ada.
  if (!liveSubmitEnabled()) {
    const policy = policyMessage("ALLOW");
    // Cron mencatat dry-run sebagai SUCCESS (itu jalan normalnya); manual TIDAK
    // mencatat apa pun (tidak ada yang dikirim, bukan percobaan).
    if (logOnNotReady) {
      await safeLog({
        userId,
        status: "SUCCESS",
        message: `Latihan (DRY_RUN): laporan ${readiness.date} siap dikirim. ${policy}`,
        trigger,
      });
    }
    return { kind: "DRY_RUN", date: readiness.date, policy };
  }

  // --- Dapatkan access token untuk submit ------------------------------------
  // Jalur 1 (paling murah): access token hasil login otomatis masih segar →
  // pakai langsung, tanpa menyentuh jaringan portal sama sekali.
  //
  // Jalur 2 (cadangan): tukar refresh token tersimpan → access token. Ini juga
  // satu-satunya jalur untuk pengguna yang menempel token secara manual.
  let accessToken: string;

  if (hasFreshAccessToken) {
    try {
      accessToken = decrypt({
        ciphertext: credential!.accessCiphertext!,
        iv: credential!.accessIv!,
        authTag: credential!.accessAuthTag!,
      });
    } catch {
      const message =
        "Access token tersimpan tidak dapat dibaca (kunci enkripsi berubah?).";
      await safeLog({ userId, status: "FAILED", message, trigger });
      return { kind: "TOKEN_UNREADABLE", message };
    }
  } else {
    let refreshToken: string;
    try {
      refreshToken = decrypt({
        ciphertext: credential!.tokenCiphertext!,
        iv: credential!.tokenIv!,
        authTag: credential!.tokenAuthTag!,
      });
    } catch {
      const message =
        "Token tersimpan tidak dapat dibaca (kunci enkripsi berubah?).";
      await safeLog({ userId, status: "FAILED", message, trigger });
      return { kind: "TOKEN_UNREADABLE", message };
    }

    const exchange = await exchangeRefreshForAccess(refreshToken);
    if (exchange.status !== "OK") {
      const message =
        exchange.status === "SESSION_DEAD"
          ? "Sesi Monev mati. Login ulang di portal lalu tempel token baru."
          : exchange.message;
      // Sesi mati = fakta pasti tentang token → simpan, jangan biarkan status
      // lama yang menyesatkan tampil di dashboard. Error jaringan TIDAK
      // menyentuh status (lihat catatan markCredentialInvalid).
      if (exchange.status === "SESSION_DEAD") {
        await markCredentialInvalid(userId);
      }
      await safeLog({ userId, status: "FAILED", message, trigger });
      return {
        kind: "EXCHANGE_FAILED",
        status: exchange.status,
        message,
        date: readiness.date,
      };
    }

    accessToken = exchange.accessToken;
  }

  // --- Kirim -----------------------------------------------------------------
  const payload = payloadFromTemplate(template!, readiness.date);
  const result = await submitReport(accessToken, payload);

  const status = submitStatusFor(result);
  const message =
    result.status === "ERROR"
      ? result.message
      : result.status === "ALREADY_SUBMITTED"
        ? (result.message ?? "Laporan untuk tanggal ini sudah ada di portal.")
        : "Laporan terkirim ke portal.";

  // Simpan isi laporan lebih dulu (bila tanggal sah), lalu catat log dengan
  // tautan ke Report tersebut. Urutan ini penting: log adalah bukti utama dan
  // harus menunjuk ke Report yang sudah ada.
  const reportId = await persistReport({
    userId,
    date: readiness.date,
    template: template!,
    status,
  });

  await safeLog({
    userId,
    status,
    message,
    httpCode: "httpCode" in result ? result.httpCode : undefined,
    trigger,
    reportId,
  });

  return {
    kind: "SUBMITTED",
    ok: result.status === "SUCCESS",
    status: result.status,
    message,
    date: readiness.date,
    httpCode: "httpCode" in result ? result.httpCode : undefined,
  };
}
