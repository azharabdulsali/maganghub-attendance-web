// src/lib/turnstile.ts: pemeriksaan CAPTCHA Cloudflare Turnstile di sisi server.
//
// Kenapa file terpisah dan tanpa impor `env`: aturan verifikasi adalah logika
// murni terhadap input + `fetch` yang bisa disuntik, sehingga bisa diuji tanpa
// koneksi internet. Pemanggil (route/otorisasi login) yang mengambil secret
// dari `env` dan memutuskan apakah fitur aktif (`turnstileConfigured()`).
//
// Kontrak Cloudflare: POST form-urlencoded ke /siteverify dengan `secret` +
// `response`, jawabannya `{ success: boolean }`. Token SEKALI PAKAI dan
// kedaluwarsa 5 menit, jadi widget di klien wajib di-reset setiap submit gagal.

export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Batas token yang diterima dari klien (jaga-jaga, bukan nilai rahasia). */
export const TURNSTILE_TOKEN_MAX_LENGTH = 4096;

export type TurnstileFailure = "missing" | "rejected" | "unavailable";

export type TurnstileVerdict =
  | { ok: true }
  | { ok: false; kind: TurnstileFailure };

/**
 * Pesan untuk pengguna. Sengaja tanpa istilah teknis: pengguna hanya perlu tahu
 * apa yang terjadi dan satu langkah berikutnya.
 */
export const PESAN_CAPTCHA: Record<TurnstileFailure, string> = {
  missing:
    "Pemeriksaan keamanan belum selesai. Tunggu sebentar sampai pemeriksaannya rampung, lalu kirim lagi.",
  rejected:
    "Pemeriksaan keamanan tidak lolos. Muat ulang halaman ini, lalu coba lagi.",
  unavailable:
    "Pemeriksaan keamanan sedang tidak bisa dilakukan. Coba lagi beberapa saat lagi.",
};

export function pesanCaptcha(kind: TurnstileFailure): string {
  return PESAN_CAPTCHA[kind];
}

/**
 * Verifikasi token Turnstile.
 *
 * Kegagalan jaringan/timeout TIDAK pernah dianggap lolos: hasilnya
 * `unavailable`, dan pemanggil wajib menolak permintaan. Diam-diam meloloskan
 * saat Cloudflare mati akan membuat CAPTCHA bisa dilewati hanya dengan
 * memutus koneksi ke Cloudflare.
 */
export async function verifyTurnstileToken(input: {
  token: unknown;
  secretKey: string;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<TurnstileVerdict> {
  const {
    token,
    secretKey,
    remoteIp,
    fetchImpl = fetch,
    timeoutMs = 5000,
  } = input;

  if (typeof token !== "string") return { ok: false, kind: "missing" };
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > TURNSTILE_TOKEN_MAX_LENGTH) {
    return { ok: false, kind: "missing" };
  }

  const body = new URLSearchParams({ secret: secretKey, response: trimmed });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, kind: "unavailable" };

    const data = (await res.json().catch(() => null)) as
      | { success?: unknown }
      | null;
    return data?.success === true
      ? { ok: true }
      : { ok: false, kind: "rejected" };
  } catch {
    // Timeout, DNS gagal, Cloudflare tidak terjangkau.
    return { ok: false, kind: "unavailable" };
  }
}
