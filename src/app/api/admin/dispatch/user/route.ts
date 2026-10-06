// src/app/api/admin/dispatch/user/route.ts: jalankan otomasi untuk SATU user.
//
// Beda dengan /api/admin/dispatch (massal, seleksi per jam): route ini
// MEMAKSA jalankan seorang pengguna yang dipilih admin, apa pun jam jadwalnya —
// untuk "mengejar" orang yang terlewat tanpa menunggu jam berikutnya.
//
// Keamanan (sejajar dengan route admin lain):
//   - WAJIB sesi + role ADMIN, dicek di SERVER.
//   - `userId` datang dari klien tetapi DIVERIFIKASI ada & belum di-soft-delete;
//     bukan data rahasia, hanya sasaran.
//   - Aturan laporan (libur/akhir pekan/akhir program, pra-cek duplikat,
//     gerbang ALLOW_LIVE_SUBMIT) TETAP berlaku: `performSubmit` yang sama
//     dipakai, jadi "paksa" = abaikan jam jadwal, bukan abaikan kebijakan.
//   - Rate limit scope `adminUserAction`.
//
// Pemicu dicatat sebagai CRON (bukan submit manual pengguna). Tidak ada rahasia
// yang dikembalikan: ringkasan hanya status ringkas + pesan.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/admin";
import { runOne, summarizeRunOne } from "@/lib/admin-run-one";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

// Satu submit menyentuh portal (login token + kirim) → beri ruang > default.
export const maxDuration = 30;

const KIND_LABEL: Record<string, string> = {
  SUBMITTED: "Terkirim",
  DRY_RUN: "Latihan (dry-run)",
  NOT_READY: "Belum siap / dilewati",
  EXCHANGE_FAILED: "Gagal tukar token",
  TOKEN_UNREADABLE: "Token tak terbaca",
  BAD_DATE: "Tanggal tidak sah",
};

export async function POST(request: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const actorId = session?.user?.id;

  if (!actorId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }
  if (!isAdminRole(role)) {
    return NextResponse.json(
      { error: "Hanya admin yang boleh menjalankan otomasi pengguna." },
      { status: 403 },
    );
  }

  const gate = await enforceRateLimit(
    "adminUserAction",
    rateLimitKey("adminUserAction", actorId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak aksi. Coba lagi dalam ${Math.ceil(
          gate.decision.retryAfterSeconds / 60,
        )} menit.`,
      },
      { status: 429, headers: gate.headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Pesan ini bisa tampil di toast admin. Hindari istilah teknis ("Body
    // bukan JSON") yang tidak dimengerti pengguna awam.
    return NextResponse.json(
      { error: "Data permintaan tidak terbaca. Muat ulang halaman lalu coba lagi." },
      { status: 400 },
    );
  }

  const userId =
    body && typeof body === "object" && "userId" in body
      ? (body as { userId?: unknown }).userId
      : undefined;

  if (typeof userId !== "string" || userId.trim().length === 0) {
    return NextResponse.json(
      { error: "Data pengguna tidak terbaca. Muat ulang halaman lalu coba lagi." },
      { status: 400 },
    );
  }

  const result = await runOne(userId.trim());

  if (!result.ok) {
    const message =
      result.reason === "DELETED"
        ? "Pengguna sudah dihapus."
        : "Pengguna tidak ditemukan.";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  const summary = summarizeRunOne(result.outcome);
  return NextResponse.json({
    ok: true,
    userId: result.userId,
    email: result.email,
    kind: summary.kind,
    label: KIND_LABEL[summary.kind] ?? summary.kind,
    succeeded: summary.ok,
    message: summary.message,
  });
}
