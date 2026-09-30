// src/app/api/admin/users/[id]/reset-password/route.ts: admin menetapkan ulang
// kata sandi seorang pengguna.
//
// Alur: server membuat kata sandi sementara acak yang KUAT, menyimpan
// hash-nya (bcrypt cost 12, sama dengan register/login), menaikkan
// `sessionVersion` supaya semua sesi pengguna itu tercabut, lalu mengembalikan
// kata sandi MENTAH sekali saja ke admin untuk disalin & dikirim ke pengguna.
//
// Keamanan:
//   - Wajib sesi + role ADMIN (dicek di server).
//   - Diri sendiri & admin lain ditolak (lihat checkAdminTarget).
//   - Rate limit scope `adminUserAction`.
//   - Kata sandi mentah HANYA ada di respons; tidak pernah ditulis ke log.
//     Respons diberi `Cache-Control: no-store`.
//   - Aksi dicatat ke audit (log sementara, lihat admin-action-log.ts).
//
// Catatan: memaksa pengguna mengganti kata sandi saat login berikutnya
// (`mustChangePassword`) adalah TAHAP 2 dan menuntut kolom baru + migrasi; di
// sini belum ada. Sesi lama tetap tercabut karena `sessionVersion` naik.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/admin";
import {
  checkAdminTarget,
  describeActionDenial,
  generateTemporaryPassword,
  statusForDenial,
} from "@/lib/admin-user-actions";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { logAdminAction } from "@/lib/admin-action-log";

// Sama dengan register & login (SPEC.md §9). Dipisah sebagai konstanta agar
// perubahan biaya hanya di satu tempat.
const BCRYPT_COST = 12;

export async function POST(
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
      { error: "Hanya admin yang boleh mengatur ulang kata sandi." },
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
    logAdminAction("user.resetPassword", {
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

  const kataSandi = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(kataSandi, BCRYPT_COST);

  await prisma.user.update({
    where: { id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });

  logAdminAction("user.resetPassword", {
    actorId,
    targetId: id,
    outcome: "success",
  });

  return NextResponse.json(
    {
      ok: true,
      email: target!.email,
      // Kata sandi mentah: hanya di sini, tidak pernah di log/hash ulang.
      temporaryPassword: kataSandi,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
