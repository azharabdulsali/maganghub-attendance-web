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
 * password salah", termasuk kasus yang bukan salah pengguna (CSRF kedaluwarsa,
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
  OAuthAccountNotLinked: {
    judul: "Email sudah terdaftar",
    detail:
      "Email ini sudah punya akun dengan kata sandi. Masuk dengan kata sandi dulu, lalu coba lagi dengan Google.",
  },
  OAuthSignin: {
    judul: "Gagal masuk dengan Google",
    detail:
      "Google belum bisa dihubungi dari halaman ini. Coba lagi sebentar, atau masuk dengan kata sandi.",
  },
  OAuthCallback: {
    judul: "Gagal masuk dengan Google",
    detail:
      "Jawaban dari Google tidak lengkap. Coba lagi sebentar, atau masuk dengan kata sandi.",
  },
  OAuthCallbackError: {
    judul: "Gagal masuk dengan Google",
    detail:
      "Proses masuk lewat Google terhenti. Coba lagi sebentar, atau masuk dengan kata sandi.",
  },
};

/** Pesan cadangan untuk kode error yang belum dipetakan. */
export const PESAN_CADANGAN: PesanLogin = {
  judul: "Login gagal",
  detail: "Tidak bisa masuk dengan kredensial itu. Coba lagi.",
};

/**
 * Pesan untuk kode RINCI (`code=`) yang menyertai `error=CredentialsSignin`.
 *
 * Auth.js memakai satu kode umum untuk semua kegagalan jalur kata sandi, lalu
 * menambahkan kode rinci. Tanpa peta ini, kegagalan pemeriksaan keamanan akan
 * tampil sebagai "email atau password salah", menyesatkan, karena keduanya
 * belum tentu salah.
 */
export const PESAN_KODE_KREDENSIAL: Record<string, PesanLogin> = {
  CaptchaGagal: {
    judul: "Pemeriksaan keamanan belum selesai",
    detail:
      "Muat ulang halaman ini lalu coba masuk lagi. Ini bukan salah email atau kata sandi Anda.",
  },
};

/** Pesan untuk sebuah kode error (atau cadangan bila null/tak dikenal). */
export function pesanUntukKode(kode: string | null): PesanLogin {
  if (!kode) return PESAN_CADANGAN;
  return PESAN_ERROR[kode] ?? PESAN_CADANGAN;
}

/**
 * Pesan akhir untuk satu kegagalan login: kode rinci (`code`) menang atas kode
 * umum (`error`), karena lebih spesifik dan lebih jujur.
 */
export function pesanUntukLogin(
  kodeError: string | null,
  kodeDetail: string | null,
): PesanLogin {
  if (kodeDetail) {
    const spesifik = PESAN_KODE_KREDENSIAL[kodeDetail];
    if (spesifik) return spesifik;
  }
  return pesanUntukKode(kodeError);
}

/** Ambil nilai satu parameter query dari URL apa pun. */
function parameterDari(url: string, nama: string): string | null {
  const match = new RegExp(`[?&]${nama}=([^&]+)`).exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // Persen-encoding cacat (mis. `%`). Lebih baik null daripada melempar.
    return null;
  }
}

/** Ambil nilai `error=` dari URL apa pun, atau null bila tidak ada/cacat. */
export function kodeErrorDari(url: string): string | null {
  return parameterDari(url, "error");
}

/** Ambil nilai `code=` (kode rinci CredentialsSignin) dari URL. */
export function kodeDetailDari(url: string): string | null {
  return parameterDari(url, "code");
}
