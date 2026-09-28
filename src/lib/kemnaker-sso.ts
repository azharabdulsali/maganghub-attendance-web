// src/lib/kemnaker-sso.ts — KERANGKA login otomatis via SSO Kemnaker.
//
// ⚠️  STATUS: BELUM PERNAH DIJALANKAN. Endpoint & bentuknya sudah terekam
// (docs/MONEV-API.md §7), tapi fungsi yang benar-benar menembak jaringan
// (`loginToSso`) dilindungi gerbang opt-in eksplisit supaya TIDAK mungkin
// terpanggil tak sengaja selama fase uji koneksi.
//
// Alur penuh yang dituju (setelah respons /auth/login terekam):
//   1. GET  https://account.kemnaker.go.id/auth          → ambil x-csrf-token + cookie
//   2. POST .../auth/login  {username, password}         → dapat `code` OAuth
//   3. GET  .../api/v1/auth/login/callback?code=&state=  → server set monev_refresh_token
//
// ATURAN KEAMANAN (ditegakkan di kode, bukan sekadar janji):
//   - Password HANYA dikirim di body, TIDAK pernah ditulis ke log konsol,
//     pesan error, atau objek yang bisa di-serialisasi.
//   - `SsoCredentials` punya `toJSON()` yang membuang password, supaya
//     `JSON.stringify` yang tidak sengaja tidak membocorkannya.
//   - Tidak ada `console.log` di berkas ini, dan tidak boleh ditambahkan.

export const KEMNAKER_SSO_ORIGIN = "https://account.kemnaker.go.id";

/** User-Agent resmi pemilik akun — dipakai konsisten dengan monev-client. */
const SSO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Kredensial untuk login SSO. Disengaja sebagai kelas (bukan objek polos)
 * supaya bisa memasang `toJSON` pengaman: kalau objek ini tanpa sengaja
 * di-`JSON.stringify` (mis. masuk log), password TIDAK ikut.
 */
export class SsoCredentials {
  readonly username: string;
  readonly password: string;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  /** JSON.stringify(ssoCredentials) akan menghasilkan ini — tanpa password. */
  toJSON(): { username: string; password: "<disembunyikan>" } {
    return { username: this.username, password: "<disembunyikan>" };
  }
}

/** Body permintaan login SSO yang siap dikirim (MURNI, bisa diuji). */
export function buildSsoLoginRequest(
  creds: SsoCredentials,
): { url: string; method: "POST"; contentType: string; body: string } {
  return {
    url: `${KEMNAKER_SSO_ORIGIN}/auth/login`,
    method: "POST",
    contentType: "application/json;charset=UTF-8",
    body: JSON.stringify({
      username: creds.username,
      password: creds.password,
    }),
  };
}

/** Hasil satu percobaan login SSO (sebelum penukaran OAuth). */
export type SsoLoginResult =
  | { status: "OK"; httpCode: number; redirectUri?: string }
  | { status: "REJECTED"; httpCode: number; message?: string }
  | { status: "ERROR"; message: string };

/**
 * Tafsirkan respons `POST /auth/login` SSO — MURNI, tanpa jaringan.
 *
 * ✅ Terverifikasi (§4.6): `200` dengan body
 * `{ data: { authenticated: true, redirect_uri: "http://account.kemnaker.go.id/auth?..." } }`.
 * `authenticated: true` = kredensial benar; langkah lanjut **mengikuti**
 * `redirect_uri` yang dikembalikan. `state` di URL itu **berbeda** dari langkah
 * (1) dan **tidak boleh di-hardcode**.
 *
 * ⚠️  Tidak ada kredensial yang dipantulkan di nilai kembalian.
 */
export function interpretSsoLoginResponse(
  httpCode: number,
  bodyText: string,
): SsoLoginResult {
  if (httpCode < 200 || httpCode >= 300) {
    return {
      status: "REJECTED",
      httpCode,
      message: `SSO menolak dengan HTTP ${httpCode}.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = undefined;
  }
  const data =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).data
      : undefined;
  const rec =
    data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;

  if (rec && rec.authenticated === true) {
    const redirectUri =
      typeof rec.redirect_uri === "string" ? rec.redirect_uri : undefined;
    return { status: "OK", httpCode, redirectUri };
  }

  return {
    status: "REJECTED",
    httpCode,
    message:
      "Kredensial ditolak atau respons tak terduga (tidak ada 'authenticated: true').",
  };
}

/**
 * Ambil parameter `code` & `state` dari sebuah URL callback. MURNI.
 * Berguna untuk mem-parsing `Location`/`redirect_uri` tanpa menebak.
 */
export function parseOAuthCallbackParams(url: string): {
  code?: string;
  state?: string;
} {
  const out: { code?: string; state?: string } = {};
  const cm = /[?&]code=([^&]+)/.exec(url);
  if (cm) out.code = decodeURIComponent(cm[1]);
  const sm = /[?&]state=([^&]+)/.exec(url);
  if (sm) out.state = decodeURIComponent(sm[1]);
  return out;
}

/**
 * Kirim login SSO ke portal. **DILINDUNGI GERBANG.**
 *
 * `opts.confirmLivePortalRequest` HARUS bernilai `true`. Tanpa itu, fungsi ini
 * langsung mengembalikan ERROR dan **tidak menyentuh jaringan sama sekali**.
 * Tujuannya: mencegah panggilan tak sengaja yang mengirim password ke portal
 * di luar sesi yang benar-benar disengaja pemilik akun.
 *
 * ⚠️ Belum pernah dijalankan. Respons `200` sudah terekam bentuknya (§4.6) dan
 * ditafsirkan `interpretSsoLoginResponse`. Fungsi ini sengaja **tidak** membaca
 * ulang body setelah penafsiran, dan **tidak** mencatat apa pun ke log.
 */
export async function loginToSso(
  creds: SsoCredentials,
  opts: {
    csrfToken: string;
    cookies: string;
    confirmLivePortalRequest: boolean;
    timeoutMs?: number;
  },
): Promise<SsoLoginResult> {
  if (!opts.confirmLivePortalRequest) {
    return {
      status: "ERROR",
      message:
        "Dibatalkan: gerbang 'confirmLivePortalRequest' belum aktif. " +
        "Fungsi ini tidak boleh menembak portal sungguhan tanpa izin eksplisit.",
    };
  }
  if (!creds.username || !creds.password) {
    return { status: "ERROR", message: "Username/password kosong." };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const req = buildSsoLoginRequest(creds);
    const res = await fetch(req.url, {
      method: req.method,
      headers: {
        "content-type": req.contentType,
        Origin: KEMNAKER_SSO_ORIGIN,
        Referer: `${KEMNAKER_SSO_ORIGIN}/auth/login`,
        "User-Agent": SSO_USER_AGENT,
        "x-csrf-token": opts.csrfToken,
        "x-requested-with": "XMLHttpRequest",
        accept: "application/json, text/plain, */*",
        cookie: opts.cookies,
      },
      body: req.body,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });

    // Baca body HANYA untuk penafsiran status terautentikasi (§4.6). Isi body
    // tidak pernah ditulis ke log/error.
    const text = await res.text().catch(() => "");
    return interpretSsoLoginResponse(res.status, text);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu login SSO habis."
        : "Tidak dapat menghubungi SSO Kemnaker.";
    return { status: "ERROR", message };
  } finally {
    clearTimeout(timer);
  }
}
