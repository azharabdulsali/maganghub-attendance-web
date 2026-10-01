// src/app/api/admin/users/[id]/route.ts: hapus pengguna (SOFT DELETE).
//
// Kenapa soft, bukan hard: `User` punya relasi cascade ke laporan, template,
// kredensial, dan audit submit. Menghapus barisnya akan menghapus riwayat yang
// justru jadi bukti (SPEC.md §10). Karena itu penghapusan hanya mengisi
// `deletedAt`; pengguna tak bisa login dan tak muncul lagi di daftar admin,
// tetapi datanya tetap utuh bila perlu dipulihkan/diaudit.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/admin";
import {
  checkAdminTarget,
  describeActionDenial,
  statusForDenial,
} from "@/lib/admin-user-actions";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { logAdminAction } from "@/lib/admin-action-log";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!isAdminRole(role)) {
    return NextResponse.json(
      { error: "Hanya admin yang boleh menghapus pengguna." },
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

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true, deletedAt: true },
  });

  // Pengguna yang sudah dihapus dianggap "tidak ada" (idempoten, 404).
  const denial = checkAdminTarget(
    actorId,
    target && !target.deletedAt
      ? { id: target.id, role: target.role }
      : null,
  );
  if (denial) {
    await logAdminAction(
      "USER_DELETE",
      { actorId, targetId: id, reason: denial },
      "denied",
    );
    return NextResponse.json(
      { error: describeActionDenial(denial) },
      { status: statusForDenial(denial) },
    );
  }

  // Soft delete + cabut semua sesi pengguna (naikkan sessionVersion) supaya
  // JWT yang masih beredar langsung tak sah. Keduanya dalam satu transaksi.
  await prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });

  await logAdminAction("USER_DELETE", { actorId, targetId: id }, "success");

  return NextResponse.json({ ok: true, email: target!.email });
}

