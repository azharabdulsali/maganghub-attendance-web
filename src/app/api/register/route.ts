// src/app/api/register/route.ts — pendaftaran terbuka (SPEC.md §13 baris 5).
//
// Pengaman yang wajib ada:
//   - Validasi Zod di sisi server (§9 poin 5).
//   - Rate limit 3 pendaftaran/jam per IP (§8 tabel endpoint).
//   - Password di-hash bcryptjs cost 12 (§9 poin 2).
//   - Email yang cocok dengan ADMIN_EMAIL otomatis jadi ADMIN (§13 baris 8).

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { env, isAdminEmail } from "@/lib/env";

const BCRYPT_COST = 12;

const registerSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(200, "Password terlalu panjang"),
});

// Rate limit sederhana berbasis memori.
// Cukup untuk melindungi dari pembuatan akun massal pada skala kecil.
// Catatan: di Vercel, memori bisa di-reset antar invocation — lihat §9 poin 6
// dan §15. Kalau penyalahgunaan mulai terlihat, ganti ke Upstash Redis.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000; // 1 jam
const MAX_PER_WINDOW = 3;

function rateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }

  if (entry.count >= MAX_PER_WINDOW) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const limit = rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Terlalu banyak pendaftaran. Coba lagi dalam ${Math.ceil(
          limit.retryAfterSec / 60,
        )} menit.`,
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan salah" }, { status: 400 });
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
