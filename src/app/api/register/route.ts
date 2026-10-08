// src/app/api/register/route.ts: pendaftaran terbuka (SPEC.md Â§13 baris 5).
//
// Pengaman yang wajib ada:
//   - Validasi Zod di sisi server (Â§9 poin 5).
//   - Rate limit 5 pendaftaran/10 menit per IP (Â§8 tabel endpoint).
//   - Password di-hash bcryptjs cost 12 (Â§9 poin 2).
//   - Email yang cocok dengan ADMIN_EMAIL otomatis jadi ADMIN (Â§13 baris 8).

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { env, isAdminEmail } from "@/lib/env";
import { clientIpFromHeaders, rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

const BCRYPT_COST = 12;

const registerSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(200, "Password terlalu panjang"),
});

export async function POST(request: Request) {
  // Rate limit 5 pendaftaran/10 menit per IP (SPEC.md Â§8), memakai modul bersama
  // (rate-limit.ts) agar aturannya satu sumber kebenaran dengan endpoint lain.
  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  const gate = await enforceRateLimit("register", rateLimitKey("register", ip));
  if (!gate.decision.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak pendaftaran. Coba lagi dalam ${Math.ceil(
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
    return NextResponse.json({ error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Email ini sudah terdaftar" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const role = isAdminEmail(email) ? "ADMIN" : "USER";

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
    select: { id: true, email: true, role: true },
  });

  // Jangan pernah mengembalikan hash atau detail internal.
  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      isAdmin: user.role === "ADMIN",
      adminConfigured: Boolean(env.ADMIN_EMAIL),
    },
    { status: 201 },
  );
}
