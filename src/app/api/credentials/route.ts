// src/app/api/credentials/route.ts — simpan & baca status kredensial Monev.
//
// Prinsip keamanan yang dipegang di sini:
//   - Password Monev TIDAK PERNAH dikembalikan ke klien (bahkan ke pemiliknya).
//     Kalau user ingin tahu passwordnya, itu memang tidak bisa dilihat lagi —
//     ia hanya bisa menggantinya. Ini menutup celah XSS/CSRF membaca password.
//   - Hanya pemilik sesi yang boleh menyentuh kredensialnya sendiri.
//   - Email Monev disimpan apa adanya (bukan rahasia), password disandikan
//     AES-256-GCM (SPEC.md §5.1).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { credentialsSchema } from "@/lib/validate";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

/** Ambil id user dari sesi; null kalau belum login. */
async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** GET — status kredensial milik user yang sedang login. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const credential = await prisma.maganghubCredential.findUnique({
    where: { userId },
    // Sengaja pilih kolom tertentu: jangan pernah SELECT ciphertext/iv/authTag
    // kalau tidak diperlukan, supaya tidak ada jalan tak sengaja terkirim.
    select: {
      emailMonev: true,
      status: true,
      updatedAt: true,
      tokenCiphertext: true,
    },
  });

  if (!credential) {
    return NextResponse.json({ exists: false, hasToken: false });
  }

  return NextResponse.json({
    exists: true,
    emailMonev: credential.emailMonev,
    status: credential.status,
    updatedAt: credential.updatedAt,
    // Hanya Boolean — nilai token tidak pernah keluar dari server.
    hasToken: Boolean(credential.tokenCiphertext),
  });
}

/** PUT — simpan (buat atau ganti) kredensial Monev milik user yang login. */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Menulis rahasia = operasi sensitif → batasi agar tidak dibrute-ubah.
  const gate = await enforceRateLimit(
    "credentials",
    rateLimitKey("credentials", userId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak perubahan kredensial. Coba lagi nanti." },
      { status: 429, headers: gate.headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan salah" }, { status: 400 });
  }

  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 },
    );
  }

  const { emailMonev, passwordMonev } = parsed.data;

  const { ciphertext, iv, authTag } = encrypt(passwordMonev);

  // upsert: satu user hanya punya satu kredensial (userId @unique).
  // Setiap penyimpanan mengganti ciphertext, iv, dan authTag sekaligus —
  // IV lama tidak boleh dipakai ulang dengan kunci yang sama.
  const saved = await prisma.maganghubCredential.upsert({
    where: { userId },
    create: {
      userId,
      emailMonev,
      ciphertext,
      iv,
      authTag,
      status: "UNVERIFIED", // baru bisa ACTIVE setelah dicoba ke portal
    },
    update: {
      emailMonev,
      ciphertext,
      iv,
      authTag,
      status: "UNVERIFIED",
    },
    select: { emailMonev: true, status: true, updatedAt: true },
  });

  // Balasan tidak memuat password dalam bentuk apa pun.
  return NextResponse.json(
    {
      ok: true,
      emailMonev: saved.emailMonev,
      status: saved.status,
      updatedAt: saved.updatedAt,
    },
    { status: 200 },
  );
}

/** DELETE — hapus kredensial milik user yang login. */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const existing = await prisma.maganghubCredential.findUnique({
    where: { userId },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Belum ada kredensial" }, { status: 404 });
  }

  await prisma.maganghubCredential.delete({ where: { userId } });

  return NextResponse.json({ ok: true });
}
