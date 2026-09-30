// src/lib/login-messages.ts: peta pesan kegagalan login + pembaca kode error.
//
// Murni (tanpa React, tanpa jaringan) sehingga bisa diuji langsung. Dipakai
// oleh `src/app/login/login-form.tsx` untuk menerjemahkan kode error Auth.js
// (`?error=...`) menjadi kalimat Indonesia yang jujur dan spesifik.

export type PesanLogin = { judul: string; detail: string };

/**
 * Terjemahkan kode error Auth.js (`?error=...`) menjadi kalimat Indonesia.
 *
 * Kenapa perlu peta ini: Auth.js memakai beberapa kode berbeda untuk kegagalan
 * yang berbeda pula, dan sebelumnya SEMUANYA jatuh ke satu pesan "Email atau
 * password salah" — termasuk kasus yang bukan salah pengguna (CSRF kedaluwarsa,
 * server tidak siap), sehingga pengguna dibuat bingung. Kode yang tidak dikenal
 * tetap punya pesan cadangan yang jujur.
 */
export const PESAN_ERROR: Record<string, PesanLogin> = {
  CredentialsSignin: {
    judul: "Email atau password salah",
    detail: "Periksa kembali email dan kata sandi Anda, lalu coba lagi.",
  },
  MissingCSRF: {
    judul: "Sesi login kedaluwarsa",
    detail:
      "Muat ulang halaman ini, lalu masuk kembali. Ini bukan salah email atau kata sandi Anda.",
  },
  Configuration: {
    judul: "Masalah konfigurasi server",
    detail:
      "Server login belum siap menerima permintaan. Coba beberapa saat lagi.",
  },
  AccessDenied: {
    judul: "Akses ditolak",
    detail: "Akun ini tidak diizinkan masuk. Hubungi administrator.",
  },
  Verification: {
    judul: "Verifikasi gagal",
    detail: "Tautan verifikasi sudah tidak berlaku. Minta tautan baru.",
  },
};

/** Pesan cadangan untuk kode error yang belum dipetakan. */
export const PESAN_CADANGAN: PesanLogin = {
  judul: "Login gagal",
  detail: "Tidak bisa masuk dengan kredensial itu. Coba lagi.",
};

/** Pesan untuk sebuah kode error (atau cadangan bila null/tak dikenal). */
export function pesanUntukKode(kode: string | null): PesanLogin {
  if (!kode) return PESAN_CADANGAN;
  return PESAN_ERROR[kode] ?? PESAN_CADANGAN;
}

/** Ambil nilai `error=` dari URL apa pun, atau null bila tidak ada/cacat. */
export function kodeErrorDari(url: string): string | null {
  const match = /[?&]error=([^&]+)/.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // Persen-encoding cacat (mis. `%`). Lebih baik null daripada melempar.
    return null;
  }
}
