// src/app/api/reports/submit/route.ts — kirim laporan absensi ke portal Monev.
//
// Alur (SPEC.md §10, §11B):
//   1. Pastikan pengguna sudah masuk (NextAuth).
//   2. assessReadiness(): policy (libur? program selesai?) + kelengkapan data
//      (template & token). Kalau tidak siap → batal SEBELUM menyentuh portal.
//   3. Ambil refresh token tersimpan, tukar jadi access token (Bearer, ttl 6j).
//   4. submitReport() → kirim ke /api/v1/attendances/with-daily-log.
//   5. Selalu catat SubmitLog — sukses, duplikat, maupun gagal.
//
// ⚠️  Etika & keselamatan (SPEC.md §10):
//   - TIDAK ada pengiriman otomatis diam-diam; route ini hanya jalan saat
//     pengguna menekan tombol, atau saat cron memanggilnya (trigger dicatat).
//   - `decide()` diperiksa lebih dulu; libur & akhir program TIDAK PERNAH kirim.
//   - Body permintaan TIDAK pernah memuat password/token dalam bentuk apa pun.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import {
  assessReadiness,
  payloadFromTemplate,
  policyMessage,
  submitStatusFor,
  todayInJakarta,
} from "@/lib/submit-service";
import { exchangeRefreshForAccess, submitReport } from "@/lib/monev-submit";

/** Trigger yang sah — dipakai mengisi kolom `trigger` di audit log. */
type Trigger = "MANUAL" | "CRON";

/**
 * Gerbang keselamatan: pengiriman nyata ke portal HANYA aktif bila
 * `ALLOW_LIVE_SUBMIT=1`. Tanpa itu, route memakai mode latihan (dry-run):
 * seluruh keputusan dihitung, tetapi jaringan TIDAK disentuh. Ini melindungi
 * dari "menekan tombol tidak sengaja" selama pengembangan.
 */
function liveSubmitEnabled(): boolean {
  return process.env.ALLOW_LIVE_SUBMIT === "1";
}

/** POST — kirim laporan untuk tanggal target (default: hari ini WIB). */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Body opsional: { date?: "YYYY-MM-DD", trigger?: "MANUAL"|"CRON" }.
  let body: { date?: unknown; trigger?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Body kosong bukan kesalahan — pakai default.
    body = {};
  }

  const trigger: Trigger = body.trigger === "CRON" ? "CRON" : "MANUAL";

  // Tanggal target: dari body bila sah, kalau tidak → hari ini WIB.
  let date: string;
  if (typeof body.date === "string" && body.date.trim().length > 0) {
    date = body.date.trim();
  } else {
    date = todayInJakarta();
  }


  // --- Kesiapan data & policy ------------------------------------------------
  const [template, credential] = await Promise.all([
    prisma.reportTemplate.findUnique({
      where: { userId },
      select: { activity: true, learning: true, obstacles: true },
    }),
    prisma.maganghubCredential.findUnique({
      where: { userId },
      select: { tokenCiphertext: true, tokenIv: true, tokenAuthTag: true },
    }),
  ]);

  const hasToken = Boolean(
    credential?.tokenCiphertext && credential.tokenIv && credential.tokenAuthTag,
  );

  let readiness;
  try {
    readiness = assessReadiness({ date, hasTemplate: Boolean(template), hasToken });
  } catch {
    return NextResponse.json(
      { error: `Tanggal tidak sah: ${date} (harus YYYY-MM-DD).` },
      { status: 400 },
    );
  }

  if (!readiness.ready) {
    const pesan = readinessMessage(readiness.reason);
    // Catat sebagai FAILED hanya untuk alasan yang memang layak dicoba ulang;
    // libur/akhir program bukan kegagalan, jadi tidak dicatat sebagai error.
    if (readiness.reason !== "POLICY_SKIPPED" && readiness.reason !== "PROGRAM_ENDED") {
      await safeLog({ userId, status: "FAILED", message: pesan, trigger });
    }
    return NextResponse.json(
      { ok: false, status: readiness.reason, message: pesan, date: readiness.date },
      { status: readiness.reason === "PROGRAM_ENDED" ? 410 : 200 },
    );
  }

  // Dari sini: policy ALLOW + template ada + token ada.
  if (!liveSubmitEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        status: "DRY_RUN",
        message:
          "Pengiriman nyata belum diaktifkan (ALLOW_LIVE_SUBMIT != 1). " +
          "Keputusan dihitung penuh, tetapi portal tidak disentuh.",
        date: readiness.date,
        policy: policyMessage("ALLOW"),
      },
      { status: 200 },
    );
  }

  // --- Token refresh → access ------------------------------------------------
  // Refresh token tersimpan terenkripsi; dekripsi HANYA di memori server.
  let refreshToken: string;
  try {
    refreshToken = decrypt({
      ciphertext: credential!.tokenCiphertext!,
      iv: credential!.tokenIv!,
      authTag: credential!.tokenAuthTag!,
    });
  } catch {
    await safeLog({
      userId,
      status: "FAILED",
      message: "Token tersimpan tidak dapat dibaca (kunci enkripsi berubah?).",
      trigger,
    });
    return NextResponse.json(
      { error: "Token tersimpan tidak dapat dibaca. Tempel ulang token." },
      { status: 500 },
    );
  }

  const exchange = await exchangeRefreshForAccess(refreshToken);
  if (exchange.status !== "OK") {
    const pesan =
      exchange.status === "SESSION_DEAD"
        ? "Sesi Monev mati. Login ulang di portal lalu tempel token baru."
        : exchange.message;
    await safeLog({ userId, status: "FAILED", message: pesan, trigger });
    return NextResponse.json(
      { ok: false, status: exchange.status, message: pesan },
      { status: 200 },
    );
  }

  // --- Kirim -----------------------------------------------------------------
  const payload = payloadFromTemplate(template!, readiness.date);
  const result = await submitReport(exchange.accessToken, payload);

  const status = submitStatusFor(result);
  const message =
    result.status === "ERROR"
      ? result.message
      : result.status === "ALREADY_SUBMITTED"
        ? (result.message ?? "Laporan untuk tanggal ini sudah ada di portal.")
        : "Laporan terkirim ke portal.";

  await safeLog({
    userId,
    status,
    message,
    httpCode: "httpCode" in result ? result.httpCode : undefined,
    trigger,
  });

  return NextResponse.json(
    {
      ok: result.status === "SUCCESS",
      status: result.status,
      message,
      date: readiness.date,
    },
    { status: 200 },
  );
}

/** Pesan Indonesia untuk tiap alasan tidak-siap. */
function readinessMessage(reason: string): string {
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

/**
 * Catat percobaan submit ke audit log. Sengaja menelan error tulis: kegagalan
 * mencatat TIDAK boleh menggagalkan respons yang sudah diperoleh dari portal
 * (kalau tulis gagal, itu masalah DB, bukan masalah pengiriman).
 */
async function safeLog(entry: {
  userId: string;
  status: "SUCCESS" | "FAILED" | "DUPLICATE";
  message: string;
  httpCode?: number;
  trigger: Trigger;
}): Promise<void> {
  try {
    await prisma.submitLog.create({
      data: {
        userId: entry.userId,
        status: entry.status,
        message: entry.message.slice(0, 1000),
        httpCode: entry.httpCode,
        trigger: entry.trigger,
      },
    });
  } catch {
    // Sengaja diabaikan — lihat komentar di atas.
  }
}
