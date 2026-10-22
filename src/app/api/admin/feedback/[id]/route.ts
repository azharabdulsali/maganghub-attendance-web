// src/app/api/admin/feedback/[id]/route.ts: tindakan admin atas satu masukan.
//
// PATCH  → tandai sudah dibaca (idempoten: yang sudah dibaca tidak berubah).
// DELETE → hapus masukan.
//
// Satu arah: tidak ada PATCH untuk mengirim balasan. Keputusan pemilik.
// Guard sesi + role ADMIN di SERVER (bukan hanya menu disembunyikan), rate
// limit scope `adminUserAction` (kelas yang sama dengan aksi admin lain).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/admin";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

type Params = { params: Promise<{ id: string }> };

/** Guard bersama: id admin, atau respons penolakan. */
async function requireAdmin(): Promise<
  { ok: true; actorId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Belum masuk" }, { status: 401 }),
    };
  }

  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!isAdminRole(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Hanya admin yang boleh mengelola masukan." },
        { status: 403 },
      ),
    };
  }

  const gate = await enforceRateLimit(
    "adminUserAction",
    rateLimitKey("adminUserAction", actorId),
  );
  if (!gate.decision.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Terlalu banyak aksi. Coba lagi dalam ${Math.ceil(
            gate.decision.retryAfterSeconds / 60,
          )} menit.`,
        },
        { status: 429, headers: gate.headers },
      ),
    };
  }

  return { ok: true, actorId };
}

export async function PATCH(_request: Request, { params }: Params) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const target = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, readAt: true },
  });
  if (!target) {
    return NextResponse.json(
      { error: "Masukan tidak ditemukan. Mungkin sudah dihapus." },
      { status: 404 },
    );
  }

  // Jangan menimpa waktu baca pertama bila admin menekan dua kali.
  if (target.readAt) {
    return NextResponse.json({ ok: true, readAt: target.readAt });
  }

  const saved = await prisma.feedback.update({
    where: { id },
    data: { readAt: new Date() },
    select: { readAt: true },
  });

  return NextResponse.json({ ok: true, readAt: saved.readAt });
}

export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const target = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json(
      { error: "Masukan tidak ditemukan. Mungkin sudah dihapus." },
      { status: 404 },
    );
  }

  await prisma.feedback.delete({ where: { id } });
  return NextResponse.json({ ok: true, id });
}
