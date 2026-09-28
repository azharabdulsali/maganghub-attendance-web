// src/lib/monev-login.ts — orkestrasi login penuh ke portal Monev.
//
// Menyatukan tiga langkah yang sebelumnya terpisah menjadi SATU fungsi, supaya
// pemanggil (mis. route cron/webhook) tidak perlu menyusun urutannya sendiri:
//
//   (1) GET  /api/v1/auth/login                 → SSO URL + `state`  [startOAuthFlow]
//   (2) GET  account.kemnaker.go.id/auth        → x-csrf-token + cookie [primeSsoSession]
//   (3) POST account.kemnaker.go.id/auth/login  → `code` OAuth        [loginToSso]
//   (4) GET  /api/v1/auth/login/callback?code=&state= → access_token   [exchangeCodeForSession]
//
// Rujukan: docs/MONEV-API.md §4.0 (alur end-to-end, terverifikasi).
//
// ATURAN KEAMANAN (ditegakkan kode, bukan janji):
//   - SELURUH alur berpagar `confirmLivePortalRequest: true`. Tanpa itu, langkah
//     pertama membatalkan dan **tidak ada** jaringan yang disentuh.
//   - Password hidup HANYA di dalam `SsoCredentials` (punya `toJSON` pengaman)
//     dan hanya lewat satu panggilan. Tidak pernah masuk pesan error/kembalian.
//   - Tidak ada `console.log` di berkas ini, dan tidak boleh ditambahkan.
//   - `state` TIDAK pernah di-hardcode; selalu mengalir dari respons langkah (1).

import {
  loginToSso,
  parseOAuthCallbackParams,
  KEMNAKER_SSO_ORIGIN,
  type SsoCredentials,
} from "./kemnaker-sso";
import {
  startOAuthFlow,
  exchangeCodeForSession,
  type CodeExchangeResult,
} from "./monev-client";

const DEFAULT_TIMEOUT_MS = 15_000;

/** User-Agent resmi pemilik akun (konsisten dengan modul lain). */
const LOGIN_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Langkah (2): priming sesi SSO — ambil x-csrf-token + cookie
// ---------------------------------------------------------------------------

/** Hasil priming: token CSRF + nilai cookie yang harus diteruskan ke login. */
export type SsoPrimeResult =
  | { status: "OK"; httpCode: number; csrfToken: string; cookies: string }
  | { status: "ERROR"; message: string };

/**
 * Ambil `x-csrf-token` & cookie dari halaman login SSO — MURNI, tanpa jaringan.
 *
 * Dipisah supaya bisa diuji dengan header mentah saja. Sumber token yang
 * diterima (berurutan): header `x-csrf-token` respons, lalu cookie bernama
 * `csrf_token`/`XSRF-TOKEN`. Cookie yang digabung HANYA yang relevan untuk
 * login (cf/acw/session/csrf) — memakai daftar **awalan nama**, bukan menyalin
 * seluruh header `set-cookie` mentah.
 */
export function interpretSsoPrimeResponse(
  httpCode: number,
  headers: { csrfToken?: string | null; setCookies?: string[] },
): SsoPrimeResult {
  if (httpCode < 200 || httpCode >= 400) {
    return { status: "ERROR", message: `Priming SSO gagal (HTTP ${httpCode}).` };
  }

  const setCookies = headers.setCookies ?? [];

  // Kumpulkan cookie relevan: nama=nilai dipisah ';'.
  const pairs: string[] = [];
  let csrfFromCookie: string | undefined;
  for (const raw of setCookies) {
    const m = /^([^=]+)=([^;]*)/.exec(raw.trim());
    if (!m) continue;
    const name = m[1].trim();
    const value = m[2].trim();
    if (value.length === 0) continue;
    // Hanya cookie yang jelas dipakai alur login.
    if (
      /^(acw_tc|cf_clearance|kemnaker_ri_session|csrf_token|XSRF-TOKEN|_csrf)/i.test(
        name,
      )
    ) {
      pairs.push(`${name}=${value}`);
      if (/^(csrf_token|XSRF-TOKEN|_csrf)/i.test(name)) {
        csrfFromCookie = value;
      }
    }
  }

  const csrfToken =
    (headers.csrfToken ?? "").trim() || csrfFromCookie || undefined;

  if (!csrfToken) {
    return {
      status: "ERROR",
      message:
        "x-csrf-token tidak ditemukan pada respons GET /auth SSO. Bentuk " +
        "halaman login perlu direkam ulang (docs/MONEV-API.md §7).",
    };
  }

  return {
    status: "OK",
    httpCode,
    csrfToken,
    cookies: pairs.join("; "),
  };
}

/**
 * GET halaman login SSO untuk mendapatkan `x-csrf-token` + cookie. **GATED.**
 *
 * ⚠️  Menembak jaringan ke `account.kemnaker.go.id`. Butuh
 * `confirmLivePortalRequest: true`; tanpa itu → `ERROR` tanpa jaringan.
 */
export async function primeSsoSession(opts: {
  confirmLivePortalRequest: boolean;
  timeoutMs?: number;
}): Promise<SsoPrimeResult> {
  if (!opts.confirmLivePortalRequest) {
    return {
      status: "ERROR",
      message:
        "Dibatalkan: gerbang 'confirmLivePortalRequest' belum aktif. " +
        "Priming SSO tidak boleh menyentuh portal tanpa izin eksplisit.",
    };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${KEMNAKER_SSO_ORIGIN}/auth`, {
      method: "GET",
      headers: {
        "User-Agent": LOGIN_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];

    return interpretSsoPrimeResponse(res.status, {
      csrfToken: res.headers.get("x-csrf-token"),
      setCookies,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu priming SSO habis."
        : "Tidak dapat menghubungi halaman login SSO Kemnaker.";
    return { status: "ERROR", message };
  } finally {
    clearTimeout(timer);
  }
}


// ---------------------------------------------------------------------------
// Orkestrasi: rangkai keempat langkah jadi satu
// ---------------------------------------------------------------------------

/** Hasil akhir login penuh. Bila `SUCCESS`, `accessToken` = Bearer siap pakai. */
export type LoginFlowResult =
  | {
      status: "SUCCESS";
      accessToken: string;
      userId?: string;
      name?: string;
    }
  | {
      status: "REJECTED";
      /** Langkah yang menolak. */
      step: LoginStep;
      httpCode?: number;
      message: string;
    }
  | { status: "ERROR"; step: LoginStep; message: string };

/** Nama langkah, dipakai agar UI/audit tahu di mana alur berhenti. */
export type LoginStep =
  | "oauth-start"
  | "sso-prime"
  | "sso-login"
  | "code-exchange";

/**
 * Ringkasan langkah untuk UI/audit — MURNI. Sengaja tidak memuat rahasia:
 * hanya nama langkah.
 */
export function summarizeLoginStep(step: LoginStep): string {
  switch (step) {
    case "oauth-start":
      return "Langkah 1: meminta state OAuth dari portal Monev.";
    case "sso-prime":
      return "Langkah 2: mengambil x-csrf-token dari halaman SSO.";
    case "sso-login":
      return "Langkah 3: login kredensial ke SSO Kemnaker.";
    case "code-exchange":
      return "Langkah 4: menukar code menjadi access_token.";
  }
}

/**
 * Jalankan alur login penuh. **GATED** — butuh `confirmLivePortalRequest: true`.
 *
 * Tanpa gerbang itu, fungsi mengembalikan `ERROR` di langkah pertama dan
 * **tidak** memanggil satu pun fungsi jaringan. Password hanya dilihat oleh
 * `loginToSso` lewat objek `SsoCredentials`; nilai itu tidak pernah muncul di
 * hasil, pesan error, maupun ringkasan langkah.
 *
 * ⚠️  Belum pernah dijalankan. Cocok dipakai oleh cron/webhook nanti, tetapi
 * **jangan** dipanggil selama fase uji koneksi.
 */
export async function runLoginFlow(input: {
  credentials: SsoCredentials;
  confirmLivePortalRequest: boolean;
  timeoutMs?: number;
}): Promise<LoginFlowResult> {
  // Gerbang tunggal: cek sekali di muka supaya tidak ada langkah yang bocor.
  if (!input.confirmLivePortalRequest) {
    return {
      status: "ERROR",
      step: "oauth-start",
      message:
        "Dibatalkan: gerbang 'confirmLivePortalRequest' belum aktif. " +
        "Alur login penuh tidak boleh menyentuh portal tanpa izin eksplisit.",
    };
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // --- Langkah 1: mulai OAuth → state + URL SSO -------------------------------
  const start = await startOAuthFlow({
    confirmLivePortalRequest: true,
    timeoutMs,
  });
  if (start.status !== "OK") {
    return { status: "ERROR", step: "oauth-start", message: start.message };
  }
  if (!start.state || !start.authorizeUrl) {
    return {
      status: "ERROR",
      step: "oauth-start",
      message:
        "Respons /auth/login tidak memuat 'state' atau URL SSO yang bisa " +
        "diikuti. Bentuk respons perlu dicek ulang (docs/MONEV-API.md §4.0).",
    };
  }
  const { state, authorizeUrl } = start;

  // --- Langkah 2: priming SSO → csrf + cookie --------------------------------
  const prime = await primeSsoSession({ confirmLivePortalRequest: true, timeoutMs });
  if (prime.status !== "OK") {
    return { status: "ERROR", step: "sso-prime", message: prime.message };
  }

  // --- Langkah 3: login kredensial → code OAuth ------------------------------
  const login = await loginToSso(input.credentials, {
    csrfToken: prime.csrfToken,
    cookies: prime.cookies,
    confirmLivePortalRequest: true,
    timeoutMs,
  });
  if (login.status === "ERROR") {
    return { status: "ERROR", step: "sso-login", message: login.message };
  }
  if (login.status === "REJECTED") {
    return {
      status: "REJECTED",
      step: "sso-login",
      httpCode: login.httpCode,
      message: login.message ?? "SSO menolak kredensial.",
    };
  }

  // `code` bisa ada di `redirectUri` (respons login) atau di `authorizeUrl`
  // (URL SSO dari langkah 1, yang kini sudah berisi code setelah autentikasi).
  const fromRedirect = login.redirectUri
    ? parseOAuthCallbackParams(login.redirectUri)
    : {};
  const fromAuthorize = parseOAuthCallbackParams(authorizeUrl);
  const code = fromRedirect.code ?? fromAuthorize.code;
  if (!code) {
    return {
      status: "ERROR",
      step: "sso-login",
      message:
        "Login SSO berhasil tetapi 'code' OAuth tidak ditemukan di " +
        "redirect_uri/authorizeUrl. Bentuk respons perlu direkam ulang " +
        "(docs/MONEV-API.md §4.0).",
    };
  }

  // --- Langkah 4: tukar code → access_token ----------------------------------
  const exchanged: CodeExchangeResult = await exchangeCodeForSession(code, state, {
    confirmLivePortalRequest: true,
    cookies: `monev_oauth_state=${state}`,
    timeoutMs,
  });
  if (exchanged.status === "OK") {
    return {
      status: "SUCCESS",
      accessToken: exchanged.accessToken,
      userId: exchanged.userId,
      name: exchanged.name,
    };
  }
  if (exchanged.status === "REJECTED") {
    return {
      status: "REJECTED",
      step: "code-exchange",
      httpCode: exchanged.httpCode,
      message: exchanged.message,
    };
  }
  return { status: "ERROR", step: "code-exchange", message: exchanged.message };
}
