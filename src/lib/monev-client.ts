// src/lib/monev-client.ts — klien HTTP ke portal Monev MagangHub Kemnaker.
//
// Acuan tunggal: docs/MONEV-API.md. Jangan menambah endpoint atau tebakan di
// luar yang tercatat di sana.
//
// Prinsip yang dipegang:
//   1. TIDAK ada browser, TIDAK ada Playwright. API tidak diblokir Cloudflare
//      (MONEV-API §7) — cukup fetch biasa dari server.
//   2. `x-frontend-build-id` diambil DINAMIS dari `version.json` (§3), karena
//      nilainya berubah tiap deploy frontend.
//   3. Fase ini HANYA login/verifikasi. TIDAK ADA fungsi submit di file ini —
//      endpoint submit belum diketahui (§8) dan tidak boleh dikirim apa pun
//      selama fase uji koneksi (§9).
//
// File ini sengaja tidak menyentuh database maupun file env aplikasi, supaya
// bisa diuji unit tanpa menjalankan Next maupun menyentuh rahasia.

/** Origin frontend — WAJIB dikirim sebagai `Origin`, jika tidak → CORS gagal (§2). */
export const MONEV_FRONTEND_ORIGIN = "https://monev.maganghub.kemnaker.go.id";

/** Host backend REST. Semua endpoint di bawah `/api/v1/...` (§1). */
export const MONEV_API_BASE = "https://monev-api.maganghub.kemnaker.go.id";

/**
 * User-Agent. Catatan §2: UA terikat dengan `cf_clearance`, tapi karena API
 * tidak butuh `cf_clearance`, UA di sini hanya untuk tampak wajar. Jangan
 * dipakai untuk memalsukan identitas orang lain.
 */
const MONEV_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

/** Timeout default tiap panggilan jaringan (ms). */
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Tipe hasil
// ---------------------------------------------------------------------------

/** Hasil pemeriksaan satu sesi terhadap portal. */
export type SessionCheckResult =
  | { status: "ACTIVE"; raw?: unknown }
  | { status: "INVALID"; httpCode: number; errorCode?: string; message?: string }
  | { status: "ERROR"; message: string };

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** fetch dengan timeout; supaya request yang menggantung tidak membekukan route. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ambil `x-frontend-build-id` terbaru dari endpoint publik (§3).
 * Menyertakan `?t=<epoch-ms>` untuk menembus cache.
 *
 * Melempar error bila respons tidak sesuai bentuk — lebih baik gagal terang
 * daripada mengirim build-id kosong yang membuat server bingung.
 */
export async function fetchBuildId(options?: {
  timeoutMs?: number;
}): Promise<string> {
  const url = `${MONEV_FRONTEND_ORIGIN}/version.json?t=${Date.now()}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: { accept: "*/*" },
      cache: "no-store",
    },
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  if (!res.ok) {
    throw new Error(
      `Gagal mengambil version.json (HTTP ${res.status}). Portal mungkin berubah.`,
    );
  }

  const data = (await res.json().catch(() => null)) as { build_id?: unknown } | null;
  const buildId = data?.build_id;

  if (typeof buildId !== "string" || buildId.length === 0) {
    throw new Error("version.json tidak memuat build_id yang sah.");
  }

  return buildId;
}

// ---------------------------------------------------------------------------
// Cek sesi — POST /auth/refresh (§4.1, §6)
// ---------------------------------------------------------------------------

/**
 * Periksa apakah `monev_refresh_token` masih hidup.
 *
 * Inilah dasar fitur "Tes Koneksi" (§6): tidak perlu `/auth/me` terpisah.
 *
 *   - `200`                     → sesi valid → `ACTIVE`
 *   - `401 AUTHORIZATION_ERROR` → sesi mati  → `INVALID`
 *   - error jaringan lain       → `ERROR` (jangan menyimpulkan "mati")
 *
 * PENTING: fungsi ini TIDAK mengirim laporan apa pun. Endpoint refresh hanya
 * memperbarui sesi, jadi aman dipanggil (§9).
 *
 * @param refreshToken nilai cookie `monev_refresh_token` (JWT) milik pengguna.
 */
export async function verifySession(
  refreshToken: string,
  options?: { buildId?: string; timeoutMs?: number },
): Promise<SessionCheckResult> {
  if (!refreshToken || refreshToken.trim().length === 0) {
    return { status: "INVALID", httpCode: 0, message: "Token kosong." };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    // Build-id boleh dikirim dari luar (hasil cache) atau diambil sekarang.
    const buildId = options?.buildId ?? (await fetchBuildId({ timeoutMs }));

    const res = await fetchWithTimeout(
      `${MONEV_API_BASE}/api/v1/auth/refresh`,
      {
        method: "POST",
        headers: {
          Origin: MONEV_FRONTEND_ORIGIN,
          "User-Agent": MONEV_USER_AGENT,
          "x-frontend-build-id": buildId,
          accept: "*/*",
          // Cookie dikirim manual: server-side fetch tidak punya cookie jar.
          cookie: `monev_refresh_token=${refreshToken}`,
          "content-length": "0",
        },
        cache: "no-store",
      },
      timeoutMs,
    );

    if (res.status === 200) {
      const raw = await res.json().catch(() => undefined);
      return { status: "ACTIVE", raw };
    }

    if (res.status === 401) {
      const body = (await res.json().catch(() => null)) as
        | { error_code?: string; message?: string }
        | null;
      return {
        status: "INVALID",
        httpCode: 401,
        errorCode: body?.error_code,
        message: body?.message,
      };
    }

    // Status tak terduga (mis. 403 challenge Cloudflare) → jangan tebak
    // "mati"; laporkan sebagai ERROR supaya pengguna tidak menyimpan token
    // yang sebenarnya masih bagus.
    return {
      status: "ERROR",
      message: `Respons tak terduga dari portal (HTTP ${res.status}).`,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu koneksi ke portal habis."
        : "Tidak dapat menghubungi portal Monev. Periksa koneksi server.";
    return { status: "ERROR", message };
  }
}

// ---------------------------------------------------------------------------
// Alur OAuth authorization-code — §4.0 (DILINDUNGI GERBANG)
// ---------------------------------------------------------------------------
//
// Alur terverifikasi (docs/MONEV-API.md §4.0):
//   (1) GET  /api/v1/auth/login               → set monev_oauth_state, arahkan ke SSO
//   (2) frontend /sso/callback?code=&state=   → terima `code`
//   (3) POST /api/v1/auth/login {code,state}  → tukar code jadi sesi
//
// ⚠️  Respons langkah (3) BELUM terekam. Fungsi di bawah menyiapkan bentuk
// permintaan dengan jujur; JANGAN dijalankan sampai rekaman respons ada.

/** Body permintaan tukar `code` → sesi (langkah 3). MURNI. */
export function buildCodeExchangeBody(code: string, state: string): string {
  // DEPRECATED: endpoint sebenarnya memakai GET + query (buildCodeExchangeUrl).
  return JSON.stringify({ code, state });
}

/** Endpoint tukar `code` → sesi (langkah 4 §4.0). ✅ Terverifikasi. */
export const OAUTH_CALLBACK_PATH = "/api/v1/auth/login/callback";

/** Bangun URL tukar `code` → sesi (query string). MURNI. */
export function buildCodeExchangeUrl(base: string, code: string, state: string): string {
  const u = new URL(`${base}${OAUTH_CALLBACK_PATH}`);
  u.searchParams.set("code", code);
  u.searchParams.set("state", state);
  return u.toString();
}

/**
 * Hasil tukar code → sesi (langkah 4). Bila `OK`, `accessToken` dipakai
 * sebagai `authorization: Bearer <accessToken>`.
 */
export type CodeExchangeResult =
  | {
      status: "OK";
      httpCode: number;
      accessToken: string;
      userId?: string;
      name?: string;
    }
  | { status: "REJECTED"; httpCode: number; message: string }
  | { status: "ERROR"; message: string };

/**
 * Tafsirkan respons `GET /api/v1/auth/login/callback` — MURNI, tanpa jaringan.
 * `200 { "access_token", "user_id", "name" }` (§4.0 langkah 4). Bila `200`
 * tanpa `access_token` → `ERROR`, bukan `OK` palsu.
 */
export function interpretCallbackResponse(
  httpCode: number,
  bodyText: string,
): CodeExchangeResult {
  if (httpCode < 200 || httpCode >= 300) {
    return {
      status: "REJECTED",
      httpCode,
      message: `Portal menolak penukaran code dengan HTTP ${httpCode}.`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = undefined;
  }
  const rec =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  const accessToken =
    rec && typeof rec.access_token === "string" ? rec.access_token : undefined;
  if (!accessToken) {
    return {
      status: "ERROR",
      message:
        "Respons 200 tetapi tanpa 'access_token'. Bentuk respons perlu " +
        "direkam ulang (docs/MONEV-API.md §4.0 langkah 4).",
    };
  }
  return {
    status: "OK",
    httpCode,
    accessToken,
    userId: typeof rec?.user_id === "string" ? rec.user_id : undefined,
    name: typeof rec?.name === "string" ? rec.name : undefined,
  };
}

/** Hasil mulai OAuth (langkah 1). */
export type OAuthStartResult =
  | { status: "OK"; httpCode: number; state?: string; authorizeUrl?: string }
  | { status: "ERROR"; message: string };

/** Parameter OAuth yang terverifikasi di §4.0 (nilai publik, bukan rahasia). */
export const KEMNAKER_OAUTH = {
  clientId: "79230891-cc02-43c8-964c-b525bce27857",
  redirectUri: "https://monev.maganghub.kemnaker.go.id/sso/callback",
  responseType: "code",
  scope: "basic email",
} as const;

/**
 * Mulai OAuth: minta `/api/v1/auth/login` untuk membangkitkan `state`.
 *
 * ✅ Terverifikasi (§4.0): respons TIDAK lewat header `Location` (bukan 302).
 * Server menaruh **URL SSO di body**. Fungsi ini menangani keduanya supaya
 * tahan banting: `state` dari `Set-Cookie: monev_oauth_state=...`, dan
 * `authorizeUrl` dari body (atau `Location` bila suatu saat berubah).
 *
 * ⚠️  **DILINDUNGI GERBANG.** Butuh `confirmLivePortalRequest: true`. Tanpa itu,
 * tidak menyentuh jaringan.
 */
export async function startOAuthFlow(opts: {
  confirmLivePortalRequest: boolean;
  timeoutMs?: number;
}): Promise<OAuthStartResult> {
  if (!opts.confirmLivePortalRequest) {
    return {
      status: "ERROR",
      message:
        "Dibatalkan: gerbang 'confirmLivePortalRequest' belum aktif. " +
        "Alur OAuth tidak boleh menyentuh portal tanpa izin eksplisit.",
    };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const res = await fetchWithTimeout(
      `${MONEV_API_BASE}/api/v1/auth/login`,
      {
        method: "GET",
        headers: {
          Origin: MONEV_FRONTEND_ORIGIN,
          "User-Agent": MONEV_USER_AGENT,
          accept: "*/*",
        },
        cache: "no-store",
        redirect: "manual",
      },
      timeoutMs,
    );

    if (res.status < 200 || res.status >= 400) {
      return { status: "ERROR", message: `Memulai OAuth gagal (HTTP ${res.status}).` };
    }

    // Ambil `state` dari Set-Cookie bila ada.
    const setCookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    let state: string | undefined;
    for (const raw of setCookies) {
      const m = /(?:^|;\s*)monev_oauth_state=([^;]+)/.exec(raw);
      if (m) {
        state = m[1];
        break;
      }
    }

    // URL authorize: dari body (§4.0 — terverifikasi) atau Location (cadangan).
    const rawBody = await res.text().catch(() => "");
    const bodyUrl = rawBody.trim();
    const authorizeUrl =
      /^https?:\/\/\S+$/.test(bodyUrl)
        ? bodyUrl
        : (res.headers.get("location") ?? undefined);

    // Bila state belum terbaca dari cookie, coba dari query `?state=` URL.
    if (!state && authorizeUrl) {
      const m = /[?&]state=([^&]+)/.exec(authorizeUrl);
      if (m) state = decodeURIComponent(m[1]);
    }

    return { status: "OK", httpCode: res.status, state, authorizeUrl };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu memulai OAuth habis."
        : "Tidak dapat menghubungi portal Monev saat memulai OAuth.";
    return { status: "ERROR", message };
  }
}

/**
 * Tukar `code` dari SSO menjadi sesi (langkah 3). **Menembak jaringan.**
 *
 * ⚠️  **DILINDUNGI GERBANG.** Butuh `confirmLivePortalRequest: true`. Juga
 * **belum pernah dijalankan**, dan respons suksesnya belum terekam → pemanggil
 * harus siap menerima `ERROR` jujur bila bentuknya di luar dugaan.
 *
 * @param code  nilai `code` dari callback SSO (langkah 2).
 * @param state nilai `state` yang sama dari langkah 1.
 */
/**
 * Tukar `code` dari SSO menjadi `access_token` (langkah 4 §4.0).
 * **Menembak jaringan.** ✅ Endpoint & bentuk respons TERVERIFIKASI.
 *
 * ⚠️  **DILINDUNGI GERBANG.** Butuh `confirmLivePortalRequest: true`.
 *
 * @param code  nilai `code` dari callback SSO (langkah 2b/3).
 * @param state nilai `state` yang konsisten dari langkah 1.
 * @param opts.cookies  cookie relevan (mis. `monev_oauth_state=<state>`).
 */
export async function exchangeCodeForSession(
  code: string,
  state: string,
  opts: {
    confirmLivePortalRequest: boolean;
    cookies?: string;
    buildId?: string;
    timeoutMs?: number;
  },
): Promise<CodeExchangeResult> {
  if (!opts.confirmLivePortalRequest) {
    return {
      status: "ERROR",
      message:
        "Dibatalkan: gerbang 'confirmLivePortalRequest' belum aktif. " +
        "Penukaran code tidak boleh menyentuh portal tanpa izin eksplisit.",
    };
  }
  if (!code || !state) {
    return { status: "ERROR", message: "code/state kosong." };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const buildId = opts.buildId ?? (await fetchBuildId({ timeoutMs }));
    const res = await fetchWithTimeout(
      buildCodeExchangeUrl(MONEV_API_BASE, code, state),
      {
        method: "GET",
        headers: {
          Origin: MONEV_FRONTEND_ORIGIN,
          "User-Agent": MONEV_USER_AGENT,
          "x-frontend-build-id": buildId,
          accept: "*/*",
          ...(opts.cookies ? { cookie: opts.cookies } : {}),
        },
        cache: "no-store",
        redirect: "manual",
      },
      timeoutMs,
    );

    const text = await res.text().catch(() => "");
    return interpretCallbackResponse(res.status, text);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu penukaran code habis."
        : "Tidak dapat menghubungi portal Monev saat menukar code.";
    return { status: "ERROR", message };
  }
}
