// src/app/api/feedback/route.ts: kirim kritik & saran ke admin.
//
// Satu arah (keputusan pemilik): pengguna mengirim, admin membaca & menandai
// sudah dibaca di /admin/feedback. Tidak ada endpoint balasan.
//
// Hanya POST. Daftar masukan milik sendiri dibaca langsung oleh halaman
// /feedback (server component + Prisma), pola sama seperti halaman lain.
//
// Guard: sesi wajib + rate limit scope `feedback` per pengguna. Tanpa rate
// limit, satu akun bisa membanjiri halaman admin.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { validateFeedbackInput } from "@/lib/feedback";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const gate = await enforceRateLimit(
    "feedback",
    rateLimitKey("feedback", userId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak kiriman. Coba lagi dalam ${Math.ceil(
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
    return NextResponse.json(
      { error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." },
      { status: 400 },
    );
  }

  const parsed = validateFeedbackInput((body ?? {}) as { message?: unknown });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field },
      { status: 400 },
    );
  }

  const saved = await prisma.feedback.create({
    data: { userId, message: parsed.message },
    select: { id: true, message: true, readAt: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, feedback: saved }, { status: 201 });
}
