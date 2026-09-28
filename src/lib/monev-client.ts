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
