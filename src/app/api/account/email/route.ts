// src/app/api/account/email/route.ts: ubah email akun sendiri.
//
// Ini endpoint paling sensitif di aplikasi: email adalah identitas login DAN
// penentu peran admin (`isAdminEmail`). Karena tidak ada verifikasi email,
// perubahan langsung berlaku, tidak ada langkah konfirmasi lewat kotak masuk.
// Yang dijaga di sini:
//
//   - userId diambil dari SESI, bukan body, tidak bisa mengubah email orang lain.
//   - Kata sandi lama WAJIB diverifikasi (bcrypt) sebelum email berubah.
//   - ESCALATION GUARD: pengguna non-admin tidak boleh menetapkan email yang
//     sama dengan ADMIN_EMAIL. Tanpa ini, siapa pun bisa menaikkan dirinya jadi
//     admin hanya dengan mengganti email. Admin yang sudah ada tetap bebas
//     mengganti emailnya (termasuk ke ADMIN_EMAIL yang sama).
//   - Email dinormalisasi (trim + lowercase) sebelum dibandingkan & disimpan,
//     konsisten dengan jalur login/daftar.
//   - `sessionVersion` dinaikkan → semua sesi lain dicabut (identitas berubah,
//     jadi sesi lama tidak boleh tetap sah). Nilai baru dikembalikan agar klien
//     memperbarui sesinya sendiri supaya tidak ikut ter-logout.
//   - Respons tidak pernah membocorkan hash atau detail internal.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changeEmailSchema } from "@/lib/validate";
import { isAdminEmail } from "@/lib/env";
import { bolehUbahKeEmail, normalisasiEmail } from "@/lib/email-change-policy";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const gate = await enforceRateLimit(
    "emailChange",
    rateLimitKey("emailChange", userId),
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

  const parsed = changeEmailSchema.safeParse(body);
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

  const { currentPassword } = parsed.data;
  // Normalisasi di server (satu bentuk per email, lihat email-change-policy).
  const newEmail = normalisasiEmail(parsed.data.newEmail);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, email: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Kata sandi diperiksa LEBIH DULU, baru peran. Urutan ini disengaja agar
  // pesan kegagalan tidak membocorkan apakah kata sandi benar (jika guard peran
  // jalan duluan, penyerang bisa menyimpulkan sesuatu dari pesan yang berbeda).
  const cocok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!cocok) {
    return NextResponse.json(
      { error: "Kata sandi saat ini salah", field: "currentPassword" },
      { status: 400 },
    );
  }

  // Non-admin tidak boleh menetapkan email admin. Pesan sengaja generik agar
  // tidak mengonfirmasi nilai ADMIN_EMAIL kepada penyerang.
  if (!bolehUbahKeEmail(user.role, isAdminEmail(newEmail))) {
    return NextResponse.json(
      { error: "Email tersebut tidak dapat digunakan", field: "newEmail" },
      { status: 400 },
    );
  }

  // Tidak ada perubahan nyata → tidak perlu cabut sesi atau tulis DB.
  // Kedua sisi dinormalisasi: baris lama bisa saja tersimpan sebelum aturan
  // normalisasi berlaku, jadi jangan mengandalkan `user.email` sudah lowercase.
  if (newEmail === normalisasiEmail(user.email)) {
    return NextResponse.json(
      { error: "Email baru sama dengan email saat ini", field: "newEmail" },
      { status: 400 },
    );
  }

  // Cek ketersediaan lebih awal agar pesan ramah; tetap tangani P2002 di bawah
  // untuk balapan (dua permintaan menyimpan email sama bersamaan).
  const dipakai = await prisma.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (dipakai && dipakai.id !== userId) {
    return NextResponse.json(
      { error: "Email sudah terdaftar", field: "newEmail" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail, sessionVersion: { increment: 1 } },
      select: { email: true, sessionVersion: true },
    });

    return NextResponse.json(
      {
        ok: true,
        email: updated.email,
        sessionVersion: updated.sessionVersion,
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    // P2002 = unique constraint (email) dilanggar, balapan dengan request lain.
    if (
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Email sudah terdaftar", field: "newEmail" },
        { status: 400 },
      );
    }
    throw e;
  }
}