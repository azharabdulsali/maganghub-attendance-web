// src/app/api/admin/users/[id]/route.ts: hapus pengguna (SOFT DELETE).
//
// Kenapa soft, bukan hard: `User` punya relasi cascade ke laporan, template,
// kredensial, dan audit submit. Menghapus barisnya akan menghapus riwayat yang
// justru jadi bukti (SPEC.md §10). Karena itu penghapusan hanya menandai
// `deletedAt`; pengguna tak bisa login dan tak muncul lagi di daftar admin,
// tetapi datanya tetap utuh bila perlu dipulihkan/diaudit.
//
// ⚠️ `deletedAt` belum ada di skema saat ini. Menambahkannya butuh migrasi Neon
// yang di tahap ini BELUM dijalankan (menunggu izin). Sampai migrasi itu ada,
// route ini menolak dengan 501 supaya tidak diam-diam gagal. Ini disengaja:
// lebih baik tombol jujur "belum aktif" daripada menghapus data sungguhan.

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
    select: { id: true, role: true, email: true },
  });

  const denial = checkAdminTarget(
    actorId,
    target ? { id: target.id, role: target.role } : null,
  );
  if (denial) {
    logAdminAction("user.delete", {
      actorId,
      targetId: id,
      outcome: "denied",
      reason: denial,
    });
    return NextResponse.json(
      { error: describeActionDenial(denial) },
      { status: statusForDenial(denial) },
    );
  }

  // Lihat catatan di atas: sampai kolom `deletedAt` ada, jangan hapus diam-diam.
  return NextResponse.json(
    {
      error:
        "Fitur hapus pengguna belum aktif: menunggu migrasi kolom deletedAt.",
    },
    { status: 501 },
  );
}
