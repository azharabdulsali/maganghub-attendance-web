// src/app/api/account/password/route.ts: ubah kata sandi akun sendiri (C-13).
//
// Diubah **dalam sesi** (pengguna sudah login), tanpa email/token reset. Karena
// tidak ada verifikasi email, keamanannya bersandar pada dua hal: sesi yang sah
// DAN pembuktian kata sandi lama. Yang dijaga di sini:
//
//   - Hanya pemilik sesi yang boleh mengubah kata sandinya (userId dari SESI,
//     bukan dari body, supaya tak bisa mengubah milik orang lain).
//   - Rate limit per pengguna (scope `passwordChange`): tiap percobaan
//     menjalankan bcrypt.compare pada kata sandi lama, jadi batas rendah membuat
//     tebak-menebak lewat endpoint ini tidak ekonomis.
//   - Kata sandi lama diverifikasi dengan bcrypt SEBELUM hash baru disimpan.
//   - Hash baru memakai bcrypt cost 12, persis sama dengan pendaftaran & login,
//     agar aturan satu sumber kebenaran (auth.ts, register/route.ts).
//   - Respons tidak pernah mengembalikan hash atau detail internal.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validate";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

const BCRYPT_COST = 12;

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Rate limit per pengguna (bukan per IP): yang dilindungi adalah akun ini.
  const gate = await enforceRateLimit(
    "passwordChange",
    rateLimitKey("passwordChange", userId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(
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
      { error: "Format permintaan salah" },
      { status: 400 },
    );
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Data tidak valid",
        field: typeof issue?.path[0] === "string" ? issue.path[0] : undefined,
      },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    // Sesi ada tetapi baris user hilang (mis. dihapus), perlakukan sebagai 401.
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const cocok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!cocok) {
    // Pesan generik + status 400: tidak membocorkan apakah kata sandi lama
    // "hampir benar". 400 (bukan 401) karena sesi tetap sah, hanya input salah.
    return NextResponse.json(
      { error: "Kata sandi saat ini salah", field: "currentPassword" },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  // Menaikkan `sessionVersion` mencabut SEMUA sesi lain yang beredar (token
  // lama tak lagi cocok dengan DB → callback `jwt` mengembalikan null).
  // `mustChangePassword` direset ke false: bila pengguna tadi dipaksa ganti
  // kata sandi oleh admin, kewajiban itu gugur begitu ia menggantinya sendiri.
  // Versi baru dikembalikan supaya klien bisa memperbarui sesinya sendiri
  // lewat `useSession().update({ sessionVersion })`, sehingga pengguna yang
  // sedang mengganti sandi TIDAK ikut ter-logout.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
    },
    select: { sessionVersion: true },
  });

  return NextResponse.json(
    { ok: true, sessionVersion: updated.sessionVersion, mustChangePassword: false },
    { status: 200 },
  );
}
