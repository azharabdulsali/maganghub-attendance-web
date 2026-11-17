// src/app/api/register/route.ts: pendaftaran terbuka (SPEC.md §13 baris 5).
//
// Pengaman yang wajib ada:
//   - Validasi Zod di sisi server (§9 poin 5).
//   - Rate limit 5 pendaftaran/10 menit per IP (§8 tabel endpoint).
//   - Password di-hash bcryptjs cost 12 (§9 poin 2).
//   - Email yang cocok dengan ADMIN_EMAIL otomatis jadi ADMIN (§13 baris 8).

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { env, isAdminEmail, turnstileConfigured } from "@/lib/env";
import { clientIpFromHeaders, rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import {
  TURNSTILE_TOKEN_MAX_LENGTH,
  pesanCaptcha,
  verifyTurnstileToken,
} from "@/lib/turnstile";

const BCRYPT_COST = 12;

const registerSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(200, "Password terlalu panjang"),
  // Token CAPTCHA (opsional). Hanya diperiksa bila Turnstile dikonfigurasi.
  turnstileToken: z.string().max(TURNSTILE_TOKEN_MAX_LENGTH).optional(),
});

export async function POST(request: Request) {
  // Rate limit 5 pendaftaran/10 menit per IP (SPEC.md §8), memakai modul bersama
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

  // CAPTCHA diperiksa SEBELUM bcrypt dan sebelum menyentuh tabel User:
  // percobaan bot tidak boleh membakar CPU untuk hashing, dan pemeriksaan
  // email-terdaftar tidak boleh bisa ditebak lewat respons berbeda.
  if (turnstileConfigured()) {
    const verdict = await verifyTurnstileToken({
      token: parsed.data.turnstileToken,
      secretKey: env.TURNSTILE_SECRET_KEY ?? "",
      remoteIp: ip,
    });
    if (!verdict.ok) {
      return NextResponse.json(
        { error: pesanCaptcha(verdict.kind) },
        { status: 400 },
      );
    }
  }

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
