// src/app/api/credentials/verify/route.ts: "Tes Koneksi" ke portal Monev.
//
// Alur (docs/MONEV-API.md §6, Opsi C1 §7):
//   1. Pengguna menempel `monev_refresh_token` dari DevTools.
//   2. Kita simpan terenkripsi (AES-256-GCM), sama seperti password.
//   3. Kita panggil `POST /auth/refresh` dengan token itu.
//        - 200  â†’ ACTIVE  (sesi hidup)
//        - 401  â†’ INVALID (sesi mati, pengguna harus login ulang)
//        - lain â†’ jangan ubah apa pun, laporkan ERROR apa adanya
//
// PENTING (SPEC.md §10): route ini TIDAK PERNAH mengirim laporan apa pun.
// Hanya memperbarui/ memeriksa sesi. Fase uji koneksi berhenti di sini.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { monevTokenSchema } from "@/lib/validate";
import { verifySession } from "@/lib/monev-client";
import { pickRefreshTokenToPersist } from "@/lib/credential-session";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

/** POST, simpan token (bila dikirim) lalu uji ke portal. */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Rate limit per pengguna SEBELUM menyentuh portal: tiap panggilan mengirim
  // token ke server Monev sungguhan, jadi percobaan beruntun perlu dibatasi.
  const gate = await enforceRateLimit(
    "credentialsVerify",
    rateLimitKey("credentials-verify", userId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi nanti." },
      { status: 429, headers: gate.headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." }, { status: 400 });
  }

  const { token } = (body ?? {}) as { token?: unknown };

  // Token baru (tempelan pengguna) bersifat opsional: kalau tidak dikirim,
  // kita uji token yang sudah tersimpan. Ini yang dipakai tombol "Tes ulang".
  let tokenToCheck: string | null = null;
  let isNewToken = false;

  if (token !== undefined) {
    const parsed = monevTokenSchema.safeParse(token);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Token tidak valid" },
        { status: 400 },
      );
    }
    tokenToCheck = parsed.data;
    isNewToken = true;
  } else {
    const saved = await prisma.maganghubCredential.findUnique({
      where: { userId },
      select: { tokenCiphertext: true, tokenIv: true, tokenAuthTag: true },
    });
    if (!saved?.tokenCiphertext || !saved.tokenIv || !saved.tokenAuthTag) {
      return NextResponse.json(
        { error: "Belum ada token tersimpan. Tempel token terlebih dahulu." },
        { status: 400 },
      );
    }
    try {
      tokenToCheck = decrypt({
        ciphertext: saved.tokenCiphertext,
        iv: saved.tokenIv,
        authTag: saved.tokenAuthTag,
      });
    } catch {
      // Data rusak/kunci berubah â†’ jangan diamkan; minta pengguna menempel ulang.
      return NextResponse.json(
        {
          error:
            "Token tersimpan tidak dapat dibaca (kunci enkripsi berubah?). Tempel ulang token.",
        },
        { status: 500 },
      );
    }
  }

  const result = await verifySession(tokenToCheck);

  // Token rotasi: bila portal mengganti monev_refresh_token saat kita memanggil
  // /auth/refresh, simpan nilai BARU (menimpa yang lama). Berlaku baik untuk
  // token tempelan baru maupun token tersimpan ("Tes ulang") — kalau tidak,
  // token lama yang sudah dicabut akan dipakai pada refresh berikutnya.
  const rotated = result.status === "ACTIVE" ? result.rotatedRefreshToken : undefined;
  if (rotated) {
    try {
      const enc = encrypt(rotated);
      await prisma.maganghubCredential.update({
        where: { userId },
        data: {
          tokenCiphertext: enc.ciphertext,
          tokenIv: enc.iv,
          tokenAuthTag: enc.authTag,
        },
      });
    } catch {
      // Gagal menyimpan rotasi bukan alasan menutupi hasil tes. Dicatat saja.
      console.warn(
        "Tes koneksi berhasil tetapi refresh token hasil rotasi gagal disimpan.",
      );
    }
  }

  // Simpan token baru HANYA setelah diuji, dan hanya bila bukan ERROR jaringan
  // (kalau jaringan gagal, token belum terbukti apa-apa, jangan klaim tersimpan).
  //
  // PENTING (rotasi): bila portal MEROTASI token saat uji di atas, `rotated`
  // adalah token yang masih hidup sedangkan `tokenToCheck` (tempelan pengguna)
  // SUDAH dicabut oleh rotasi itu. Jadi yang disimpan harus `rotated` — kalau
  // tidak, kita menimpa token hidup dengan token mati (bug rotasi terbalik).
  // Pilihan ini diekstrak ke fungsi murni `pickRefreshTokenToPersist` (ber-test).
  const tokenToPersist = pickRefreshTokenToPersist(rotated, tokenToCheck);
  if (isNewToken && result.status !== "ERROR") {
    const enc = encrypt(tokenToPersist);
    try {
      await prisma.maganghubCredential.upsert({
        where: { userId },
        create: {
          userId,
          // Cabang "create" hanya terjadi bila user menempel token SEBELUM
          // mengisi kredensial. Password belum ada, jadi kolom password diisi
          // string kosong terenkripsi (bukan token!) agar tidak ada campur
          // aduk: password dan token punya kolom masing-masing.
          ...encrypt(""),
          emailMonev: (await existingEmail(userId)) ?? "belum-diisi@monev.local",
          tokenCiphertext: enc.ciphertext,
          tokenIv: enc.iv,
          tokenAuthTag: enc.authTag,
          status: result.status === "ACTIVE" ? "ACTIVE" : "INVALID",
        },
        update: {
          tokenCiphertext: enc.ciphertext,
          tokenIv: enc.iv,
          tokenAuthTag: enc.authTag,
          status: result.status === "ACTIVE" ? "ACTIVE" : "INVALID",
        },
        select: { status: true },
      });
    } catch {
      // Penyimpanan gagal bukan alasan menutupi hasil tes yang sudah diperoleh.
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          message: "Tes berhasil dijalankan, tetapi token gagal disimpan.",
        },
        { status: 200 },
      );
    }
  } else if (!isNewToken && result.status !== "ERROR") {
    // Token lama: perbarui status saja.
    await prisma.maganghubCredential.update({
      where: { userId },
      data: { status: result.status === "ACTIVE" ? "ACTIVE" : "INVALID" },
    });
  }

  return NextResponse.json(toResponse(result), { status: 200 });
}

/** Email yang sudah tersimpan (bila ada), untuk tidak menimpa dengan placeholder. */
async function existingEmail(userId: string): Promise<string | null> {
  const row = await prisma.maganghubCredential.findUnique({
    where: { userId },
    select: { emailMonev: true },
  });
  return row?.emailMonev ?? null;
}

/** Bentuk balasan yang stabil untuk UI. Tidak pernah memuat token. */
function toResponse(result: Awaited<ReturnType<typeof verifySession>>) {
  if (result.status === "ACTIVE") {
    return { ok: true, status: "ACTIVE", message: "Sesi Monev aktif dan valid." };
  }
  if (result.status === "INVALID") {
    return {
      ok: false,
      status: "INVALID",
      message:
        result.message ??
        "Sesi Monev tidak valid. Silakan login ulang di portal lalu tempel token baru.",
      errorCode: result.errorCode,
    };
  }
  return { ok: false, status: "ERROR", message: result.message };
}
