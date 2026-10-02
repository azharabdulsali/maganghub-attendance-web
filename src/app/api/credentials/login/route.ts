// src/app/api/credentials/login/route.ts: login otomatis ke portal Monev.
//
// Ini adalah "Opsi A" (docs/MONEV-API.md §7): alih-alih meminta pengguna
// menyalin `monev_refresh_token` dari DevTools, server yang menjalankan alur
// login SSO penuh memakai email+password Monev yang sudah tersimpan
// terenkripsi. Hasilnya: access token (6 jam) + refresh token (30 hari, bila
// portal mengirimkannya) disimpan terenkripsi.
//
// Prinsip keamanan (ditegakkan di kode):
//   - Hanya pemilik sesi yang boleh menjalankan untuk kredensialnya sendiri.
//   - Password Monev didekripsi SESAAAT untuk satu panggilan login, tidak
//     pernah masuk respons/pesan error.
//   - Gerbang `confirmLivePortalRequest: true` dilewatkan secara SADAR di sini
//, inilah satu-satunya tempat yang diizinkan menembak portal sungguhan.
//   - Rate limit diterapkan: login = operasi sensitif.
//   - Respons TIDAK PERNAH memuat token mentah, hanya ringkasan ada/tidak.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { SsoCredentials } from "@/lib/kemnaker-sso";
import { runLoginFlow } from "@/lib/monev-login";
import { saveLoginSession } from "@/lib/credential-session";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Login otomatis = operasi sensitif & menyentuh portal → batasi ketat.
  const gate = await enforceRateLimit(
    "credentialsLogin",
    rateLimitKey("credentials-login", userId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan login. Coba lagi nanti." },
      { status: 429, headers: gate.headers },
    );
  }

  // Ambil & dekripsi kredensial tersimpan.
  const saved = await prisma.maganghubCredential.findUnique({
    where: { userId },
    select: {
      emailMonev: true,
      ciphertext: true,
      iv: true,
      authTag: true,
    },
  });
  if (!saved) {
    return NextResponse.json(
      { error: "Belum ada kredensial tersimpan. Isi email & password dulu." },
      { status: 400 },
    );
  }

  let password: string;
  try {
    password = decrypt({
      ciphertext: saved.ciphertext,
      iv: saved.iv,
      authTag: saved.authTag,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Password tersimpan tidak dapat dibaca (kunci enkripsi berubah?). Isi ulang kredensial.",
      },
      { status: 500 },
    );
  }

  if (!password) {
    return NextResponse.json(
      { error: "Password tersimpan kosong. Isi ulang kredensial Monev." },
      { status: 400 },
    );
  }

  // --- Jalankan alur login penuh (gerbang AKTIF dengan sengaja) ---------------
  const result = await runLoginFlow({
    credentials: new SsoCredentials(saved.emailMonev, password),
    confirmLivePortalRequest: true,
  });

  if (result.status === "REJECTED") {
    // Cek kredensial/user ditolak SSO. Tandai INVALID supaya UI jujur.
    await prisma.maganghubCredential.update({
      where: { userId },
      data: { status: "INVALID" },
    });
    return NextResponse.json(
      {
        ok: false,
        status: "REJECTED",
        step: result.step,
        message:
          result.message ||
          "Portal menolak login. Periksa email & password Monev Anda.",
      },
      { status: 200 },
    );
  }

  if (result.status === "ERROR") {
    // Kesalahan jaringan/bentuk respons yang belum terekam. JANGAN ubah
    // status kredensial, belum tentu kredensialnya salah. `kind` (bila ada)
    // memberitahu UI apakah ini blokir WAF — supaya bisa mengarahkan ke jalur
    // tempel token manual, bukan menyalahkan password.
    return NextResponse.json(
      {
        ok: false,
        status: "ERROR",
        step: result.step,
        kind: result.kind ?? null,
        message:
          result.message ||
          "Login otomatis gagal dihubungi. Coba lagi atau pakai tempel token.",
      },
      { status: 200 },
    );
  }

  // --- Sukses: simpan token terenkripsi --------------------------------------
  try {
    const save = await saveLoginSession(userId, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return NextResponse.json(
      {
        ok: true,
        status: "ACTIVE",
        message: save.hasRefreshToken
          ? "Login otomatis berhasil. Sesi tersimpan (access token ±6 jam + refresh token ±30 hari)."
          : "Login otomatis berhasil. Sesi tersimpan sebagai access token (±6 jam). Portal tidak mengirim refresh token, jadi Anda perlu menekan ini lagi setelah 6 jam.",
        hasRefreshToken: save.hasRefreshToken,
        accessExpiresAt: save.accessExpiresAt.toISOString(),
        name: result.name ?? null,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "SAVE_FAILED",
        message:
          "Login berhasil tetapi sesi gagal disimpan. Coba lagi; kalau tetap gagal, pakai tempel token.",
      },
      { status: 200 },
    );
  }
}
