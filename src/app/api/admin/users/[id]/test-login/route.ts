// src/app/api/admin/users/[id]/test-login/route.ts: admin menguji login seorang
// pengguna ke portal Monev.
//
// Beda dengan /api/admin/dispatch/user: route ini HANYA menjalankan alur login
// SSO (untuk membuktikan kredensial masih hidup), TIDAK mengirim laporan apa
// pun. Intinya ada di src/lib/admin-test-login.ts (teruji tanpa HTTP).
//
// Keamanan (sejajar dengan route admin lain):
//   - WAJIB sesi + role ADMIN, dicek di SERVER.
//   - Diri sendiri & admin lain ditolak (checkAdminTarget): menguji login orang
//     lain = tindakan atas akun orang, sama kelasnya dengan reset/hapus.
//   - Penyimpanan sesi hasil uji MENULIS ke kredensial sasaran (memperbarui
//     status + token), jadi tetap dipagari.
//   - Rate limit scope `adminUserAction`.
//   - Respons TIDAK PERNAH memuat password/token mentah, hanya status ringkas.
//   - Aksi dicatat ke audit (AdminActionLog, enum USER_TEST_LOGIN).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  checkAdminTarget,
  describeActionDenial,
  statusForDenial,
} from "@/lib/admin-user-actions";
import { testLogin } from "@/lib/admin-test-login";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { logAdminAction } from "@/lib/admin-action-log";

// Satu uji login menyentuh portal (beberapa request SSO) → beri ruang.
export const maxDuration = 30;

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
      { error: "Hanya admin yang boleh menguji login pengguna." },
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

  // Uji login menyentuh akun orang lain, jadi pakai aturan sasaran yang SAMA
  // dengan reset/hapus: diri sendiri & admin lain ditolak.
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true, deletedAt: true },
  });
  const denial = checkAdminTarget(
    actorId,
    target && !target.deletedAt
      ? { id: target.id, role: target.role }
      : null,
  );
  if (denial) {
    await logAdminAction(
      "USER_TEST_LOGIN",
      { actorId, targetId: id, reason: denial },
      "denied",
    );
    return NextResponse.json(
      { error: describeActionDenial(denial) },
      { status: statusForDenial(denial) },
    );
  }

  let result: Awaited<ReturnType<typeof testLogin>>;
  try {
    result = await testLogin(id);
  } catch (error) {
    // Kegagalan tak terduga (bukan hasil terstruktur). Catat sebagai error,
    // jangan bocorkan detail internal ke klien.
    console.warn(
      `[admin/test-login] uji login gagal tak terduga untuk ${id}:`,
      error instanceof Error ? error.message : "unknown",
    );
    await logAdminAction("USER_TEST_LOGIN", { actorId, targetId: id }, "error");
    return NextResponse.json(
      { error: "Uji login gagal dijalankan. Coba lagi nanti." },
      { status: 500 },
    );
  }

  if (!result.ok && ("reason" in result)) {
    // NOT_FOUND / DELETED — sasaran tak layak (denial sudah menangani deleted,
    // jadi ini praktis NOT_FOUND).
    await logAdminAction(
      "USER_TEST_LOGIN",
      { actorId, targetId: id, reason: result.reason },
      "denied",
    );
    return NextResponse.json(
      { error: "Pengguna tidak ditemukan." },
      { status: 404 },
    );
  }

  // Catat ke audit: sukses/gagal tetap tercatat supaya ada bukti admin pernah
  // menyentuh kredensial ini. Jangan simpan pesan mentah ke `reason` (bisa
  // berisi petunjuk teknis); cukup status ringkas.
  await logAdminAction(
    "USER_TEST_LOGIN",
    {
      actorId,
      targetId: id,
      reason: result.ok ? "ACTIVE" : result.status,
    },
    result.ok ? "success" : "error",
  );

  return NextResponse.json({
    ok: result.ok,
    status: result.ok ? "ACTIVE" : result.status,
    message: result.message,
    ...(result.ok ? {} : { step: result.step ?? null, kind: result.kind ?? null }),
    email: target!.email,
    // Tidak pernah ada password/token di sini.
  });
}
