// src/lib/admin-test-login.ts: INTI "Uji Login" per user (Panel Admin).
//
// Latar: admin ingin memverifikasi bahwa kredensial Monev seorang pengguna MASIH
// HIDUP, tanpa harus menunggu otomasi berjalan dan TANPA mengirim laporan apa
// pun. Fitur ini menjalankan alur login SSO yang SAMA dengan tombol
// "Login otomatis" milik pengguna (src/lib/monev-login.ts) dan menyimpan sesi
// hasilnya lewat jalur yang SAMA (saveLoginSession) — jadi status kredensial
// yang tampil di admin konsisten dengan yang dilihat pengguna.
//
// Prinsip keamanan (ditegakkan di kode):
//   - Password Monev didekripsi SESAAAT untuk satu panggilan login; tidak pernah
//     masuk respons/pesan error (sama seperti /api/credentials/login).
//   - Respons TIDAK PERNAH memuat token mentah maupun password, hanya status.
//   - Gerbang `confirmLivePortalRequest: true` dilewatkan secara SADAR di sini;
//     ini satu-satunya tempat (selain login pengguna sendiri) yang diizinkan
//     menembak portal.
//   - Yang TIDAK di sini: bentuk respons HTTP + penjagaan sesi, itu urusan route.
//
// Inilah versi "login saja" dari admin-run-one.ts: alih-alih performSubmit
// (yang ikut mengirim laporan), kita hanya runLoginFlow lalu simpan sesi.

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { SsoCredentials } from "@/lib/kemnaker-sso";
import { runLoginFlow } from "@/lib/monev-login";
import { saveLoginSession } from "@/lib/credential-session";

/** Hasil uji login: berhasil menyeleksi user + hasil terstruktur. */
export type TestLoginResult =
  | { ok: true; status: "ACTIVE"; message: string; name: string | null }
  | {
      ok: false;
      status: "REJECTED" | "ERROR" | "NO_CREDENTIAL" | "UNREADABLE" | "EMPTY_PASSWORD";
      message: string;
      /** Langkah alur yang gagal (REJECTED/ERROR), untuk diagnosis. */
      step?: string;
      /** Kategori kegagalan jaringan/WAF (ERROR), bila ada. */
      kind?: string | null;
    }
  | { ok: false; reason: "NOT_FOUND" | "DELETED" };

/**
 * Uji login ke portal Monev untuk SATU pengguna (HANYA login, TANPA submit).
 *
 * Mengembalikan hasil terstruktur (tanpa rahasia) supaya route bisa memetakan
 * ke status HTTP yang tepat. `REJECTED`/`ERROR` juga menandai status kredensial
 * di DB (INVALID untuk REJECTED; ERROR tidak mengubah status — belum tentu
 * kredensialnya salah, bisa jadi jaringan).
 *
 * @param userId  Sasaran. Dipanggil setelah route memverifikasi admin.
 */
export async function testLogin(userId: string): Promise<TestLoginResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      deletedAt: true,
      credential: {
        select: {
          emailMonev: true,
          ciphertext: true,
          iv: true,
          authTag: true,
        },
      },
    },
  });

  if (!user) return { ok: false, reason: "NOT_FOUND" };
  if (user.deletedAt) return { ok: false, reason: "DELETED" };

  const saved = user.credential;
  if (!saved) {
    return {
      ok: false,
      status: "NO_CREDENTIAL",
      message: "Pengguna ini belum menyimpan kredensial Monev.",
    };
  }

  let password: string;
  try {
    password = decrypt({
      ciphertext: saved.ciphertext,
      iv: saved.iv,
      authTag: saved.authTag,
    });
  } catch {
    // Data rusak / kunci enkripsi berubah. Jangan ubah status: bukan salah
    // kredensial, melainkan masalah penyimpanan.
    return {
      ok: false,
      status: "UNREADABLE",
      message:
        "Kredensial tersimpan tidak dapat dibaca (kunci enkripsi berubah?). Pengguna perlu mengisi ulang.",
    };
  }

  if (!password) {
    return {
      ok: false,
      status: "EMPTY_PASSWORD",
      message: "Password tersimpan kosong. Pengguna perlu mengisi ulang kredensial.",
    };
  }

  // --- Jalankan alur login penuh (gerbang AKTIF dengan sengaja) ---------------
  const result = await runLoginFlow({
    credentials: new SsoCredentials(saved.emailMonev, password),
    confirmLivePortalRequest: true,
  });

  if (result.status === "REJECTED") {
    // Kredensial ditolak SSO → tandai INVALID supaya UI jujur.
    await prisma.maganghubCredential.update({
      where: { userId },
      data: { status: "INVALID" },
    });
    return {
      ok: false,
      status: "REJECTED",
      step: result.step,
      message:
        result.message ||
        "Portal menolak login. Kredensial pengguna mungkin perlu diperbarui.",
    };
  }

  if (result.status === "ERROR") {
    // Kesalahan jaringan/WAF. JANGAN ubah status kredensial — belum tentu
    // kredensialnya salah. Detail teknis hanya dicatat ke log server.
    if (result.diagnostic) {
      console.warn(
        `[admin/test-login] langkah ${result.step} gagal (kind=${result.kind ?? "unknown"}): ${result.diagnostic}`,
      );
    }
    return {
      ok: false,
      status: "ERROR",
      step: result.step,
      kind: result.kind ?? null,
      message:
        result.message ||
        "Login tidak bisa dihubungi (jaringan atau proteksi anti-bot). Coba lagi atau minta pengguna pakai tempel token.",
    };
  }

  // --- Sukses: simpan sesi terenkripsi (sama seperti login pengguna sendiri) --
  const save = await saveLoginSession(userId, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });

  return {
    ok: true,
    status: "ACTIVE",
    message: save.hasRefreshToken
      ? "Login berhasil. Sesi aktif tersimpan (berlaku sekitar 30 hari)."
      : "Login berhasil. Sesi aktif tersimpan (berlaku sekitar 6 jam).",
    name: result.name ?? null,
  };
}
