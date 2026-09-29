// src/app/api/reports/submit/route.ts — kirim laporan absensi ke portal Monev.
//
// Alur (SPEC.md §10, §11B):
//   1. Pastikan pengguna sudah masuk (NextAuth).
//   2. Ambil template & kredensial, lalu serahkan ke performSubmit() — yang
//      menjalankan policy + kesiapan + tukar token + kirim + audit log.
//   3. Petakan hasilnya ke bentuk respons HTTP yang diharapkan UI.
//
// Logika pengiriman ada di satu tempat (src/lib/perform-submit.ts), dipakai
// bersama webhook cron. Berkas ini hanya soal HTTP: auth, rate limit, body,
// dan bentuk respons.
//
// ⚠️  Etika & keselamatan (SPEC.md §10):
//   - TIDAK ada pengiriman otomatis diam-diam; route ini hanya jalan saat
//     pengguna menekan tombol.
//   - `decide()` diperiksa lebih dulu (via assessReadiness); libur & akhir
//     program TIDAK PERNAH kirim.
//   - Body permintaan TIDAK pernah memuat password/token dalam bentuk apa pun.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { todayInJakarta } from "@/lib/submit-service";
import {
  type SubmitOutcome,
  type SubmitTrigger,
  performSubmit,
} from "@/lib/perform-submit";

/** POST — kirim laporan untuk tanggal target (default: hari ini WIB). */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Rate limit per pengguna — mencegah dobel-klik & spam tombol kirim.
  const gate = await enforceRateLimit("submitManual", rateLimitKey("submit", userId));
  if (!gate.decision.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan kirim. Coba lagi dalam ${gate.decision.retryAfterSeconds} detik.`,
      },
      { status: 429, headers: gate.headers },
    );
  }

  // Body opsional: { date?: "YYYY-MM-DD", trigger?: "MANUAL"|"CRON" }.
  let body: { date?: unknown; trigger?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Body kosong bukan kesalahan — pakai default.
    body = {};
  }

  const trigger: SubmitTrigger = body.trigger === "CRON" ? "CRON" : "MANUAL";

  // Tanggal target: dari body bila sah, kalau tidak → hari ini WIB.
  const date =
    typeof body.date === "string" && body.date.trim().length > 0
      ? body.date.trim()
      : todayInJakarta();

  // --- Ambil data yang dibutuhkan performSubmit ------------------------------
  const [template, credential] = await Promise.all([
    prisma.reportTemplate.findUnique({
      where: { userId },
      select: { activity: true, learning: true, obstacles: true },
    }),
    prisma.maganghubCredential.findUnique({
      where: { userId },
      select: {
        tokenCiphertext: true,
        tokenIv: true,
        tokenAuthTag: true,
        accessCiphertext: true,
        accessIv: true,
        accessAuthTag: true,
        accessExpiresAt: true,
      },
    }),
  ]);

  // logOnNotReady=false: manual TIDAK mencatat libur/akhir program sebagai
  // FAILED (bukan kegagalan yang bisa diulang).
  const outcome = await performSubmit({
    userId,
    date,
    template,
    credential,
    trigger,
    logOnNotReady: false,
  });

  return manualResponse(outcome);
}

/** Petakan hasil terstruktur ke bentuk respons yang diharapkan UI manual. */
function manualResponse(outcome: SubmitOutcome): NextResponse {
  switch (outcome.kind) {
    case "BAD_DATE":
      return NextResponse.json(
        { error: `Tanggal tidak sah: ${outcome.date} (harus YYYY-MM-DD).` },
        { status: 400 },
      );

    case "NOT_READY":
      // Program berakhir → 410 Gone (konsumen tahu ini permanen); lainnya 200.
      return NextResponse.json(
        {
          ok: false,
          status: outcome.reason,
          message: outcome.message,
          date: outcome.date,
        },
        { status: outcome.reason === "PROGRAM_ENDED" ? 410 : 200 },
      );

    case "DRY_RUN":
      return NextResponse.json(
        {
          ok: false,
          status: "DRY_RUN",
          message:
            "Pengiriman nyata belum diaktifkan (ALLOW_LIVE_SUBMIT != 1). " +
            "Keputusan dihitung penuh, tetapi portal tidak disentuh.",
          date: outcome.date,
          policy: outcome.policy,
        },
        { status: 200 },
      );

    case "TOKEN_UNREADABLE":
      return NextResponse.json(
        { error: "Token tersimpan tidak dapat dibaca. Tempel ulang token." },
        { status: 500 },
      );

    case "EXCHANGE_FAILED":
      return NextResponse.json(
        { ok: false, status: outcome.status, message: outcome.message },
        { status: 200 },
      );

    case "SUBMITTED":
      return NextResponse.json(
        {
          ok: outcome.ok,
          status: outcome.status,
          message: outcome.message,
          date: outcome.date,
        },
        { status: 200 },
      );
  }
}
