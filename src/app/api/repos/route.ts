// src/app/api/repos/route.ts: simpan, baca, dan hapus konfigurasi repo git.
//
// Prinsip keamanan (docs/GIT-COMMITS-PLAN.md §6), sama seperti kredensial:
//   - **Token git TIDAK PERNAH dikembalikan ke klien**, bahkan ke pemiliknya.
//     Yang dikirim hanya Boolean `hasToken`. Ini menutup jalur XSS membaca
//     token pihak ketiga yang bisa dipakai mengakses repo pribadi.
//   - Hanya pemilik sesi yang boleh menyentuh barisnya sendiri (`userId`).
//   - Token disandikan AES-256-GCM sebelum menyentuh DB.
//   - Penulisan dibatasi rate limit: menyimpan rahasia = operasi sensitif.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gitRepoSchema, gitRepoToggleSchema } from "@/lib/validate";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import {
  gitCommitsEnabled,
  saveRepoConfig,
  setRepoEnabled,
  toRepoView,
  type GitRepoRow,
} from "@/lib/git-repo-service";

/** Ambil id user dari sesi; null kalau belum login. */
async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Kolom yang boleh dibaca. `ciphertext` sengaja tetap diambil karena hanya
 * dipakai untuk menghitung `hasToken` (Boolean) di `toRepoView`, dan TIDAK
 * pernah diteruskan ke respons.
 */
const SAFE_SELECT = {
  provider: true,
  repoPath: true,
  branch: true,
  enabled: true,
  ciphertext: true,
  lastFetchedAt: true,
  lastError: true,
  updatedAt: true,
} as const;

/** GET, status konfigurasi repo milik user yang sedang login. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const row = await prisma.gitRepoConfig.findUnique({
    where: { userId },
    select: SAFE_SELECT,
  });

  return NextResponse.json({
    ...toRepoView(row as GitRepoRow | null),
    // Supaya UI bisa menyembunyikan bagian ini saat operator mematikannya.
    featureEnabled: gitCommitsEnabled(),
  });
}

/** PUT, simpan (buat atau ganti) konfigurasi repo milik user yang login. */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  if (!gitCommitsEnabled()) {
    return NextResponse.json(
      { error: "Fitur commit git sedang dinonaktifkan pengelola aplikasi." },
      { status: 503 },
    );
  }

  const gate = await enforceRateLimit("gitRepo", rateLimitKey("gitRepo", userId));
  if (!gate.decision.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak perubahan repo. Coba lagi nanti." },
      { status: 429, headers: gate.headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." },
      { status: 400 },
    );
  }

  // Jalur sakelar: hanya mengubah `enabled`, TIDAK menyentuh token. Dipisah
  // sebelum `gitRepoSchema` karena permintaan ini sengaja tidak membawa token
  // (pengguna tidak wajib menempel ulang hanya untuk menjeda fitur).
  if (
    typeof body === "object" &&
    body !== null &&
    (body as { action?: unknown }).action === "toggle"
  ) {
    const parsed = gitRepoToggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
        { status: 400 },
      );
    }

    const hasil = await setRepoEnabled(userId, parsed.data.enabled);
    if (!hasil) {
      return NextResponse.json(
        { error: "Belum ada repo untuk diaktifkan/dimatikan." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, enabled: hasil.enabled });
  }

  const parsed = gitRepoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 },
    );
  }

  const { provider, repoPath, branch, token } = parsed.data;

  const saved = await saveRepoConfig(userId, {
    provider,
    repoPath,
    branch,
    token,
  });

  // Balasan tidak memuat token dalam bentuk apa pun.
  return NextResponse.json({ ok: true, ...saved }, { status: 200 });
}

/** DELETE, hapus konfigurasi repo milik user yang login. */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const existing = await prisma.gitRepoConfig.findUnique({
    where: { userId },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Belum ada repo" }, { status: 404 });
  }

  await prisma.gitRepoConfig.delete({ where: { userId } });

  return NextResponse.json({ ok: true });
}
