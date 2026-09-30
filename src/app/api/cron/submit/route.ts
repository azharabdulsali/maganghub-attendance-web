// src/app/api/cron/submit/route.ts — webhook pemicu otomasi (SPEC.md §7, §10, §11B).
//
// Dipanggil layanan cron eksternal (mis. cron-job.org) tiap hari. Rahasia
// (`webhookKey`) boleh dikirim dengan DUA cara:
//   GET /api/cron/submit            + header  Authorization: Bearer <webhookKey>   ← dianjurkan
//   GET /api/cron/submit?key=<webhookKey>                                          ← cara lama, masih didukung
//
// Kenapa header lebih baik: rahasia di query string gampang tersimpan di log
// akses proxy/edge dan bisa bocor lewat Referer. Query string tetap diterima
// agar cron yang sudah dipasang pengguna tidak mati mendadak (deprecation
// bertahap). Lihat src/lib/bearer-token.ts.
//
// Keamanan & etika:
//   - Dijaga `webhookKey` per pengguna; TANPA kunci yang cocok → 401 dengan
//     pesan generik (tidak membocorkan apakah key "hampir benar").
//   - Hanya jalan bila AutomationConfig.isEnabled = true. Kalau nonaktif → 200
//     { skipped: true } (bukan error; cron memanggil tanpa tahu status).
//   - Menghormati gerbang ALLOW_LIVE_SUBMIT; tanpa itu → mode latihan (dry-run),
//     jaringan tidak disentuh, tetap dicatat ke SubmitLog.
//   - Policy (libur / program selesai) diperiksa lebih dulu (via performSubmit).
//   - Semua percobaan tetap dicatat (trigger: CRON).
//
// Logika pengiriman ada di satu tempat (src/lib/perform-submit.ts); berkas ini
// hanya soal webhook: kunci, rate limit, dan bentuk respons untuk cron.
//
// Bentuk respons SENGAJA berbeda dari route manual: cron SELALU 200 kecuali
// kunci tidak sah (401) atau permintaan cacat (400). Cron eksternal tidak bisa
// menafsirkan status aneh, jadi "tidak ada yang dikirim hari ini" tetap 200.

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { clientIpFromHeaders, rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { todayInJakarta } from "@/lib/submit-service";
import { type SubmitOutcome, performSubmit } from "@/lib/perform-submit";
import { cronKeyFromRequest } from "@/lib/bearer-token";

/**
 * GET — dipicu cron. Rahasia (`webhookKey`) boleh dikirim lewat
 * `Authorization: Bearer <key>` (dianjurkan) ATAU `?key=<key>` (cara lama,
 * dipertahankan agar cron yang sudah terpasang tetap jalan).
 */
export async function GET(request: Request) {
  const key = cronKeyFromRequest(
    request.headers.get("authorization"),
    request.url,
  );

  if (key.trim().length === 0) {
    return NextResponse.json(
      { error: "Rahasia wajib (header 'Authorization: Bearer' atau parameter 'key')." },
      { status: 400 },
    );
  }

  // Rate limit per IP SEBELUM mencari kunci — meredam penebakan key acak.
  // Dicek lebih dulu agar tak ada percobaan DB untuk permintaan beruntun.
  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  const gate = await enforceRateLimit("cron", rateLimitKey("cron", ip));
  if (!gate.decision.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429, headers: gate.headers },
    );
  }

  const config = await prisma.automationConfig.findUnique({
    where: { webhookKey: key.trim() },
    select: {
      userId: true,
      isEnabled: true,
      hour: true,
      minute: true,
      user: {
        select: {
          template: {
            select: { activity: true, learning: true, obstacles: true },
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

  // Kunci salah atau tidak ada → satu pesan generik (jangan bocorkan apa pun).
  if (!config) {
    return NextResponse.json({ error: "Kunci tidak sah." }, { status: 401 });
  }

  // Nonaktif → dilewati. Tidak menulis log (tidak ada percobaan submit).
  if (!config.isEnabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Otomasi sedang nonaktif.",
    });
  }

  const outcome = await performSubmit({
    userId: config.userId,
    date: todayInJakarta(),
    template: config.user.template,
    credential: config.user.credential,
    trigger: "CRON",
    // logOnNotReady=true: cron mencatat SEMUA alasan tidak-siap, termasuk libur,
    // supaya Riwayat menunjukkan "hari ini dicek, memang libur".
    logOnNotReady: true,
  });

  return cronResponse(outcome);
}

/** Petakan hasil terstruktur ke bentuk respons webhook (selalu 200). */
function cronResponse(outcome: SubmitOutcome): NextResponse {
  switch (outcome.kind) {
    case "BAD_DATE":
      // Cron memakai todayInJakarta() yang selalu sah; ini jaring pengaman.
      return NextResponse.json(
        { error: `Tanggal tidak sah: ${outcome.date}.` },
        { status: 400 },
      );

    case "NOT_READY":
      return NextResponse.json({
        ok: false,
        skipped: true,
        reason: outcome.reason,
        message: outcome.message,
      });

    case "DRY_RUN":
      return NextResponse.json({
        ok: true,
        dryRun: true,
        status: "DRY_RUN",
        date: outcome.date,
        message: `Latihan (DRY_RUN): laporan ${outcome.date} siap dikirim. ${outcome.policy}`,
      });

    case "TOKEN_UNREADABLE":
      return NextResponse.json({
        ok: false,
        status: "FAILED",
        message: outcome.message,
      });

    case "EXCHANGE_FAILED":
      return NextResponse.json({
        ok: false,
        status: outcome.status,
        message: outcome.message,
      });

    case "SUBMITTED":
      return NextResponse.json({
        ok: outcome.ok,
        status: outcome.status,
        message: outcome.message,
        date: outcome.date,
      });
  }
}
