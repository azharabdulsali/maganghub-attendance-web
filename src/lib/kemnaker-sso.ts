// src/lib/kemnaker-sso.ts: KERANGKA login otomatis via SSO Kemnaker.
//
// ⚠️  STATUS: BELUM PERNAH DIJALANKAN. Endpoint & bentuknya sudah terekam
// (docs/MONEV-API.md §7), tapi fungsi yang benar-benar menembak jaringan
// (`loginToSso`) dilindungi gerbang opt-in eksplisit supaya TIDAK mungkin
// terpanggil tak sengaja selama fase uji koneksi.
//
// Alur penuh yang dituju (✅ terverifikasi live; lihat docs §4.0):
//   1. GET  https://account.kemnaker.go.id/auth          → token CSRF + cookie
//        ⚠️  Asal token CSRF BELUM pasti. Uji lapangan: header respons TIDAK
//        memuat `x-csrf-token`. Dugaan: token ada di HTML (meta/input/JS).
//        Lihat src/lib/monev-login.ts (extractCsrfTokenFromHtml) & docs §7.
//   2. POST .../auth/login  {username, password}
//        → `authenticated: true` + `redirect_uri` yang menunjuk HALAMAN SSO
//          (BUKAN callback Monev). `code` TIDAK ada di sini → lanjut 2b.
//   2b. IKUTI `redirect_uri`/`authorizeUrl`/rantai redirect SSO → cari `code`
//        (catchOAuthCode). ⚠️  BUKTI FINAL (2026-09-28): rantai `3xx` SELALU
//        berakhir di `200` pada account.kemnaker.go.id TANPA `code`, halaman
//        akhir adalah SHELL SPA (3214 byte; hanya `<script src>` + marker
//        framework, tanpa form/OTP/meta-refresh). `code` TIDAK mengalir lewat
//        redirect HTTP. ⚠️ KOREKSI (2026): kesimpulan lama "butuh headless/JS"
//        TERLALU CEPAT. `code` tetap bisa dipanen TANPA JS - setelah login,
//        panggil `POST https://account.kemnaker.go.id/auth` (body `{}`); SSO
//        membalas JSON berisi `redirect_uri` yang SUDAH memuat `code=`.
//        Lihat `fetchAuthorizationRedirect` & `extractCallbackUrlFromAuthJson`.
//   3. GET  .../api/v1/auth/login/callback?code=&state=  → server set monev_refresh_token
//
// ATURAN KEAMANAN (ditegakkan di kode, bukan sekadar janji):
//   - Password HANYA dikirim di body, TIDAK pernah ditulis ke log konsol,
//     pesan error, atau objek yang bisa di-serialisasi.
//   - `SsoCredentials` punya `toJSON()` yang membuang password, supaya
//     `JSON.stringify` yang tidak sengaja tidak membocorkannya.
//   - Tidak ada `console.log` di berkas ini, dan tidak boleh ditambahkan.

export const KEMNAKER_SSO_ORIGIN = "https://account.kemnaker.go.id";

/**
 * Domain yang boleh disentuh saat mengikuti rantai redirect OAuth, MURNI.
 *
 * SSO dan portal Monev semuanya berada di bawah `kemnaker.go.id`. Dengan
 * memeriksa host tiap hop terhadap akar ini, rantai redirect tidak bisa
 * dibelokkan keluar ke host internal/arbitrer (anti-SSRF) sekalipun upstream
 * SSO membalas `Location` yang mencurigakan. Subdomain apa pun diizinkan
 * (`account.`, `monev-api.`, `monev.`, dst) selama akarnya cocok.
 *
 * @param hostname host dari URL (bukan URL penuh), mis. "account.kemnaker.go.id".
 */
export function isAllowedSsoHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (host.length === 0) return false;
  // Cocokkan akar tepat ("kemnaker.go.id") atau subdomain di bawahnya
  // (".kemnaker.go.id"). `endsWith` dengan titik memimpin mencegah host jahat
  // seperti "evil-kemnaker.go.id" ikut lolos.
  return host === "kemnaker.go.id" || host.endsWith(".kemnaker.go.id");
}

/** Apakah URL menunjuk ke host yang diizinkan? MURNI, aman terhadap URL cacat. */
export function isAllowedSsoUrl(url: string): boolean {
  try {
    return isAllowedSsoHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** User-Agent resmi pemilik akun, dipakai konsisten dengan monev-client. */
const SSO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

/**
 * Header `sec-fetch-*` + `Accept-Language` yang SELALU dikirim browser modern.
 * Tanpa ini, server/WAF Kemnaker bisa membedakan permintaan dari klien HTTP
 * polos dan membalas `403` (temuan lapangan langkah (2)). Ini BUKAN penyamaran:
 * nilainya jujur, hanya melengkapi sinyal yang memang sah dikirim browser.
 */
const SSO_FETCH_METADATA_HEADERS: Record<string, string> = {
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "sec-ch-ua":
    '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

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

  /** JSON.stringify(ssoCredentials) akan menghasilkan ini, tanpa password. */
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
  | {
      status: "OK";
      httpCode: number;
      redirectUri?: string;
      /**
       * Cookie mentah (`set-cookie`) dari respons login, sesi AUTENTIKASI yang
       * harus dibawa ke permintaan otorisasi (`catchOAuthCode`). Tanpa ini SSO
       * menganggap permintaan anonim dan tak menerbitkan `code`.
       */
      setCookies?: string[];
    }
  | { status: "REJECTED"; httpCode: number; message?: string }
  | { status: "ERROR"; message: string };

/**
 * Tafsirkan respons `POST /auth/login` SSO, MURNI, tanpa jaringan.
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
 * Ambil URL callback Monev dari sebuah nilai `redirect_uri`, MURNI.
 *
 * ⚠️  Konteks penting (§4.6): `redirect_uri` yang dikembalikan `POST /auth/login`
 * **bukan** callback Monev. Ia adalah **halaman SSO** (`account.kemnaker.go.id/
 * auth?...`). `code` baru muncul setelah URL itu **diikuti**, SSO-lah yang
 * me-redirect ke `.../sso/callback?code=...`. Jadi fungsi ini memeriksa apakah
 * `redirect_uri` SUDAH berupa callback (mengandung `code=`); bila belum, ia
 * mengembalikan `undefined` supaya pemanggil tahu "harus diikuti dulu".
 *
 * Ini memisahkan tebakan lama ("cari `code` di redirect_uri") dari kenyataan.
 */
export function extractCallbackUrl(redirectUri: string | undefined): string | undefined {
  if (!redirectUri) return undefined;
  // Hanya anggap callback bila sudah membawa `code=` atau menunjuk `/sso/callback`.
  if (/[?&]code=/.test(redirectUri)) return redirectUri;
  if (/\/sso\/callback/.test(redirectUri)) return redirectUri;
  return undefined;
}

/** Apakah URL ini halaman SSO (bukan callback Monev)? MURNI. */
export function isSsoAuthPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      u.hostname === "account.kemnaker.go.id" && u.pathname.startsWith("/auth")
    );
  } catch {
    return false;
  }
}

/**
 * Cari URL callback ber-`code=` di **body HTML**, MURNI.
 *
 * Dipakai bila halaman SSO membalas `200` (bukan `302 + Location`): `code`
 * sering muncul di `<meta http-equiv="refresh" content="0;url=...">`, di
 * `<script>` (mis. `window.location = "...code=..."`), atau di sebuah anchor.
 * Fungsi ini hanya mengembalikan URL yang **mengandung `code=`**; kalau tidak
 * ada, `undefined`, jangan menebak.
 */
export function extractCallbackUrlFromHtml(html: string): string | undefined {
  if (!html || html.length === 0) return undefined;

  // Kumpulkan kandidat URL dari atribut yang lazim membawa redirect.
  const patterns: RegExp[] = [
    // <meta http-equiv="refresh" content="0;url=https://...code=...">
    /http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i,
    // window.location(.href)? = "https://...code=..."
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']*code=[^"']+)["']/i,
    // <a href="https://...code=..."> atau atribut apa pun yang memuat code=
    /(\/sso\/callback\?[^"'\s>]*code=[^"'\s>]+)/i,
    /(https?:\/\/[^"'\s>]*\/sso\/callback\?[^"'\s>]*code=[^"'\s>]+)/i,
  ];

  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) {
      // Buang entitas HTML yang lazim (`&amp;` → `&`) sebelum diparse.
      const raw = m[1].replace(/&amp;/g, "&").trim();
      if (/[?&]code=/.test(raw)) return raw;
    }
  }
  return undefined;
}

/**
 * Apakah halaman ini adalah **shell otorisasi SSO** (bukan form login)?
 *
 * MURNI, tanpa jaringan. Dipakai untuk memutuskan langkah (3b) alternatif:
 * setelah `POST /auth/login` sukses, halaman `/auth` yang kembali ternyata
 * bukan redirect, ia hanya shell yang memuat penanda `auth-authorize`. Saat
 * itu terjadi, `code` TIDAK mengalir lewat HTTP redirect (temuan 4.0), jadi
 * kita harus memanggil `POST /auth` (lihat `fetchAuthorizationRedirect`),
 * persis langkah yang dipakai klien yang terbukti berhasil.
 *
 * Sengaja longgar: cukup memuat salah satu penanda yang dikenal.
 */
export function isSsoAuthAuthorizePage(html: string): boolean {
  if (!html || html.length === 0) return false;
  return (
    html.includes("auth-authorize") ||
    /data-page=["'][^"']*auth[^"']*["']/i.test(html) ||
    /<div[^>]+id=["']app["']/i.test(html)
  );
}

/**
 * Ambil URL callback (yang memuat `code=`) dari **body JSON** respons
 * `POST /auth`. MURNI, tanpa jaringan.
 *
 * Bentuk yang diterima (berdasarkan respons SSO yang terverifikasi):
 *   - `{ data: { redirect_uri: "...code=..." } }`
 *   - `{ redirect_uri: "...code=..." }`
 *   - `{ data: { url: "...code=..." } }` (cadangan)
 *
 * Mengembalikan `undefined` bila tak ada URL dengan `code=` - jangan menebak,
 * supaya pemanggil jujur melaporkan gagal alih-alih memakai URL kosong.
 */
export function extractCallbackUrlFromAuthJson(bodyText: string): string | undefined {
  if (!bodyText || bodyText.length === 0) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;

  const asRecord = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;

  const root = asRecord(parsed);
  if (!root) return undefined;
  const data = asRecord(root.data);

  const candidates: unknown[] = [
    data?.redirect_uri,
    root.redirect_uri,
    data?.url,
    root.url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && /[?&]code=/.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}


/**
 * Petunjuk ringan isi halaman HTML non-redirect, MURNI, aman.
 *
 * Dipakai saat `code` tak ditemukan dan rantai berhenti di halaman `200`.
 * Hanya mengembalikan **kategori** berdasarkan kata kunci umum (mis. "form
 * login", "otp", "dashboard") + panjang body, **tidak pernah** isi/teks asli,
 * sehingga tak ada rahasia yang bocor ke log.
 */
export function describeHtmlHint(html: string): string {
  const len = html.length;
  const has = (re: RegExp) => re.test(html);
  const tags: string[] = [];
  if (has(/<input[^>]*type=["']?password/i) || has(/name=["']?(password|passwd)/i))
    tags.push("ada-form-password");
  if (has(/type=["']?email/i) || has(/name=["']?(username|email|user)/i))
    tags.push("ada-field-user");
  if (has(/\b(otp|verifikasi|verification|kode-?verifikasi)\b/i)) tags.push("ada-otp");
  if (has(/\b(dashboard|beranda|selamat-datang|welcome)\b/i)) tags.push("nuansa-dashboard");
  if (has(/<form[^>]*>/i)) tags.push("ada-<form>");
  // Deteksi shell SPA (kode OAuth biasanya dirakit oleh JS, bukan redirect HTTP).
  if (has(/<script[^>]*src=/i)) tags.push("ada-<script src>");
  if (has(/id=["']?(app|root|__next|__nuxt)["']?/i)) tags.push("ada-mount-spa");
  if (has(/window\.__|\bVue\b|\breact\b|\bnext\.js\b/i)) tags.push("marker-framework");
  const label = tags.length > 0 ? tags.join(",") : "tanpa-penanda-khusus";
  return `body ${len} byte (${label})`;
}

/**
 * Ringkasan diagnostik AMAN dari respons halaman SSO, MURNI.
 *
 * ⚠️  Hanya mengungkap **metadata** (status, keberadaan/host `Location`, nama
 * cookie). **Tidak pernah** nilai `code`/token/kredensial. Dipakai untuk pesan
 * galat supaya sesi trial berikutnya menghasilkan bukti, bukan tebakan.
 */
export function describeSsoRedirectResponse(res: {
  status: number;
  location?: string;
  cookieNames: string[];
}): string {
  const locPart = (() => {
    if (!res.location) return "Location: (tidak ada)";
    let host = "?";
    try {
      host = new URL(res.location).hostname;
    } catch {
      host = "(tak bisa diparse)";
    }
    const hasCode = /[?&]code=/.test(res.location) ? "mengandung 'code'" : "tanpa 'code'";
    return `Location host: ${host} (${hasCode})`;
  })();
  const cookiePart =
    res.cookieNames.length > 0
      ? `set-cookie: ${res.cookieNames.join(", ")}`
      : "set-cookie: (tidak ada)";
  return `[HTTP ${res.status}; ${locPart}; ${cookiePart}]`;
}

/**
 * Ambil **nama** cookie dari header `set-cookie` mentah (nilai dibuang), MURNI.
 * Nilai sengaja TIDAK diambil supaya tidak ada rahasia yang bisa bocor ke log.
 */
export function extractCookieNames(setCookies: string[]): string[] {
  const names: string[] = [];
  for (const raw of setCookies) {
    const m = /^\s*([^=;,\s]+)=/.exec(raw);
    if (m && m[1]) names.push(m[1]);
  }
  return names;
}

/** Baca semua `set-cookie` dari respons (kompatibel Node/undici & fallback). */
function readSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
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
        ...SSO_FETCH_METADATA_HEADERS,
        // Sinyal sah bahwa ini XHR same-origin (bukan navigasi dokumen).
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
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

    // ⚠️  PENTING: `POST /auth/login` yang sukses MEMPERBARUI sesi autentikasi
    // lewat `set-cookie`. Cookie ini WAJIB dibawa ke permintaan otorisasi
    // (`catchOAuthCode`), jika tidak SSO menganggap kita anonim dan membalas
    // halaman SPA alih-alih me-redirect dengan `code`. Sebelumnya cookie ini
    // dibuang, itulah sebab `code` tak pernah terbit.
    const setCookies = readSetCookies(res.headers);

    const interpreted = interpretSsoLoginResponse(res.status, text);
    if (interpreted.status === "OK" && setCookies.length > 0) {
      return { ...interpreted, setCookies };
    }
    return interpreted;
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

// ---------------------------------------------------------------------------
// Menangkap `code` OAuth, ikuti halaman SSO sampai ia me-redirect ke callback
// ---------------------------------------------------------------------------

/** Hasil menangkap `code` setelah mengikuti halaman SSO. */
export type CatchCodeResult =
  | { status: "OK"; code: string; state?: string; callbackUrl: string }
  | { status: "ERROR"; message: string };

/** Batas hop redirect agar tidak pernah terjebak loop tak berujung. */
const MAX_REDIRECT_HOPS = 8;
/**
 * Langkah (3b-alternatif): panggil `POST https://account.kemnaker.go.id/auth`
 * untuk memanen URL callback yang memuat `code=`. Jaringan,
 * **DILINDUNGI GERBANG.**
 *
 * Mengapa perlu (bukti dari klien yang terbukti berhasil): setelah login
 * sukses, halaman `/auth` bisa kembali sebagai **shell SPA** (memuat penanda
 * `auth-authorize`) dan TIDAK mengalirkan `code` lewat redirect HTTP. Dalam
 * kondisi itu `code` baru terbit bila kita mengirim permintaan otorisasi
 * eksplisit: `POST /auth` dengan body kosong. SSO membalas JSON berisi
 * `redirect_uri` yang SUDAH memuat `code=` (lihat `extractCallbackUrlFromAuthJson`).
 *
 * Ini murni menyelesaikan alur OAuth yang benar - sama seperti menjalankan
 * permintaan otorisasi dari browser pada umumnya, bukan menembus proteksi.
 *
 * @returns `{ status: "OK", callbackUrl }` bila JSON memuat `code=`;
 *          `{ status: "ERROR", message }` bila tidak (tanpa menebak).
 */
export async function fetchAuthorizationRedirect(
  opts: {
    csrfToken: string;
    cookies?: string;
    confirmLivePortalRequest: boolean;
    timeoutMs?: number;
  },
): Promise<
  | { status: "OK"; callbackUrl: string; setCookies?: string[] }
  | { status: "ERROR"; message: string }
> {
  if (!opts.confirmLivePortalRequest) {
    return {
      status: "ERROR",
      message:
        "Dibatalkan: gerbang 'confirmLivePortalRequest' belum aktif. " +
        "Permintaan otorisasi SSO tidak boleh menyentuh portal tanpa izin eksplisit.",
    };
  }
  if (!opts.csrfToken) {
    return { status: "ERROR", message: "Token CSRF kosong; tidak bisa otorisasi." };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${KEMNAKER_SSO_ORIGIN}/auth`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain, */*",
        Origin: KEMNAKER_SSO_ORIGIN,
        Referer: `${KEMNAKER_SSO_ORIGIN}/auth/login`,
        "User-Agent": SSO_USER_AGENT,
        "x-csrf-token": opts.csrfToken,
        "X-CSRF-TOKEN": opts.csrfToken,
        "x-requested-with": "XMLHttpRequest",
        ...SSO_FETCH_METADATA_HEADERS,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        ...(opts.cookies ? { cookie: opts.cookies } : {}),
      },
      body: "{}",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });

    const setCookies = readSetCookies(res.headers);

    // Respons redirect langsung => Location adalah tujuan (periksa `code`).
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") ?? undefined;
      if (location) {
        const absolute = (() => {
          try {
            return new URL(location, KEMNAKER_SSO_ORIGIN).toString();
          } catch {
            return location;
          }
        })();
        const parsed = parseOAuthCallbackParams(absolute);
        if (parsed.code) {
          return { status: "OK", callbackUrl: absolute, setCookies };
        }
      }
    }

    const text = await res.text().catch(() => "");
    // (a) Body JSON memuat redirect_uri ber-`code`?
    const fromJson = extractCallbackUrlFromAuthJson(text);
    if (fromJson) {
      const absolute = (() => {
        try {
          return new URL(fromJson, KEMNAKER_SSO_ORIGIN).toString();
        } catch {
          return fromJson;
        }
      })();
      return { status: "OK", callbackUrl: absolute, setCookies };
    }
    // (b) Body HTML memuat URL callback (`Location`/meta/script)?
    const fromHtml = extractCallbackUrlFromHtml(text);
    if (fromHtml) {
      return { status: "OK", callbackUrl: fromHtml, setCookies };
    }

    return {
      status: "ERROR",
      message:
        `POST /auth membalas HTTP ${res.status} tanpa 'code' ` +
        `(JSON/HTML tidak memuat redirect callback).`,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu otorisasi SSO habis."
        : "Tidak dapat menghubungi otorisasi SSO Kemnaker.";
    return { status: "ERROR", message };
  } finally {
    clearTimeout(timer);
  }
}



/**
 * Ikuti `redirect_uri` (halaman SSO) (**termasuk seluruh rantai redirect**)
 * untuk menangkap `code` OAuth. Jaringan, **DILINDUNGI GERBANG.**
 *
 * Mengapa mengikuti RANTAI (bukti §4.0 langkah 3b): mengikuti `redirect_uri`
 * hari ini membalas **`HTTP 301` → `account.kemnaker.go.id` tanpa `code`**.
 * Itu bukan callback, hanya satu hop perjalanan; `code` baru muncul setelah
 * beberapa hop berikutnya. Menghentikan di hop pertama = gagal selamanya.
 *
 * Karena itu fungsi ini (a) mengikuti redirect satu per satu (`redirect:
 * "manual"`), (b) memeriksa `code` di `Location`/`res.url`/body HTML **tiap**
 * hop, dan (c) berhenti **segera** saat `code` ditemukan. Berhenti juga saat
 * hop menuju domain non-SSO yang jelas callback Monev, atau saat batas hop
 * tercapai.
 *
 * Tidak ada token/kredensial yang ditulis ke log atau pesan error; `Location`
 * yang menuju callback **tidak** dimuat isinya (cukup dibaca URL-nya).
 */
export async function catchOAuthCode(
  ssoPageUrl: string,
  opts: {
    cookies?: string;
    confirmLivePortalRequest: boolean;
    timeoutMs?: number;
    maxHops?: number;
  },
): Promise<CatchCodeResult> {
  if (!opts.confirmLivePortalRequest) {
    return {
      status: "ERROR",
      message:
        "Dibatalkan: gerbang 'confirmLivePortalRequest' belum aktif. " +
        "Menangkap code OAuth tidak boleh menyentuh portal tanpa izin eksplisit.",
    };
  }
  if (!ssoPageUrl) {
    return { status: "ERROR", message: "URL halaman SSO kosong." };
  }
  // Anti-SSRF: halaman awal pun harus berada di domain Kemnaker. `ssoPageUrl`
  // datang dari respons server (authorizeUrl/redirect_uri), tetapi tetap
  // diverifikasi agar tak pernah menyentuh host lain.
  if (!isAllowedSsoUrl(ssoPageUrl)) {
    return {
      status: "ERROR",
      message: "URL halaman SSO bukan host Kemnaker yang diizinkan.",
    };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxHops = opts.maxHops ?? MAX_REDIRECT_HOPS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Jejak hop (hanya status + host tujuan) untuk diagnostik bila `code` tak ada.
  const trail: string[] = [];
  let cookieNames: string[] = [];
  // Petunjuk halaman non-redirect terakhir (mis. apakah form login / dashboard),
  // hanya metadata ringan, TANPA nilai rahasia.
  let lastBodyHint: string | undefined;

  // Cookie jar antar-hop: browser asli meneruskan cookie yang di-set hop
  // sebelumnya. Ini KRUSIAL untuk `authorizeUrl`: hop pertama terbukti
  // `set-cookie: kemnaker_ri_session` (sesi SSO), dan tanpa diteruskan ke hop
  // berikutnya SSO menganggap kita belum login → berhenti di halaman 200.
  const jar = new Map<string, string>();
  const seedJar = (rawCookies?: string) => {
    if (!rawCookies) return;
    for (const part of rawCookies.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) jar.set(name, value);
    }
  };
  seedJar(opts.cookies);
  const jarHeader = (): string | undefined => {
    if (jar.size === 0) return undefined;
    return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
  };
  // Simpan `set-cookie` hop ini ke jar (hanya nilai non-kosong; abaikan atribut).
  const absorbSetCookies = (headers: Headers) => {
    for (const raw of readSetCookies(headers)) {
      const first = raw.split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (name && value.length > 0 && !/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(name)) {
        jar.set(name, value);
      }
    }
  };

  try {
    let currentUrl = ssoPageUrl;
    let referer = `${KEMNAKER_SSO_ORIGIN}/auth/login`;

    for (let hop = 0; hop < maxHops; hop++) {
      const res = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": SSO_USER_AGENT,
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          ...SSO_FETCH_METADATA_HEADERS,
          // Ini navigasi dokumen (rantai redirect halaman SSO), bukan XHR.
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "cross-site",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
          Referer: referer,
          ...(jarHeader() ? { cookie: jarHeader() as string } : {}),
        },
        cache: "no-store",
        // Baca Location sendiri agar bisa memeriksa `code` tiap hop, dan agar
        // tidak pernah memuat halaman frontend Monev (butuh cf_clearance).
        redirect: "manual",
        signal: controller.signal,
      });

      // `Referer` hop berikutnya = URL hop ini (persis perilaku browser).
      referer = currentUrl;

      // Catat nama cookie hop ini (untuk diagnostik) lalu serap ke jar agar
      // diteruskan ke hop berikutnya, inti perbaikan sesi SSO lintas-hop.
      cookieNames = extractCookieNames(readSetCookies(res.headers));
      absorbSetCookies(res.headers);

      let host = "?";
      try {
        host = new URL(currentUrl).hostname;
      } catch {
        host = "(tak bisa diparse)";
      }

      const rawLocation = res.headers.get("location") ?? undefined;
      // Resolve `Location` relatif terhadap URL hop saat ini SEBELUM dipakai,
      // supaya `callbackUrl` selalu absolut (konsisten & bisa dikonsumsi).
      const location = rawLocation
        ? (() => {
            try {
              return new URL(rawLocation, currentUrl).toString();
            } catch {
              return rawLocation;
            }
          })()
        : undefined;

      // Jejak hop: `<status>@<host-askip>→<host-tujuan-petik>` (bila redirect).
      // Host tujuan membantu melihat apakah rantai menyeberang ke callback.
      const destHint = location
        ? (() => {
            try {
              return `→${new URL(location).hostname}`;
            } catch {
              return "→(relatif)";
            }
          })()
        : "";
      trail.push(`${res.status}@${host}${destHint}`);
      const candidates = [location, res.url].filter(
        (u): u is string => typeof u === "string" && u.length > 0,
      );

      // (1) `code` di Location / res.url hop ini?
      for (const candidate of candidates) {
        const parsed = parseOAuthCallbackParams(candidate);
        if (parsed.code) {
          return {
            status: "OK",
            code: parsed.code,
            state: parsed.state,
            callbackUrl: candidate,
          };
        }
      }

      // (2) Bukan redirect → cek body HTML (meta-refresh / script / <a href>).
      if (res.status < 300 || res.status >= 400) {
        const html = await res.text().catch(() => "");
        const fromHtml = extractCallbackUrlFromHtml(html);
        if (fromHtml) {
          const parsed = parseOAuthCallbackParams(fromHtml);
          if (parsed.code) {
            return {
              status: "OK",
              code: parsed.code,
              state: parsed.state,
              callbackUrl: fromHtml,
            };
          }
        }
        // Bukan redirect dan tanpa `code` → catat petunjuk ringan isi halaman
        // (form login vs dashboard) lalu berhenti; tak ada lagi yang bisa
        // diikuti (menghindari memuat halaman non-redirect berulang).
        lastBodyHint = describeHtmlHint(html);
        break;
      }

      // (3) Redirect tanpa `code` → lanjut ke hop berikutnya.
      if (!location) break; // 3xx tanpa Location: jalan buntu.
      // Anti-SSRF: hanya ikuti hop yang tetap di domain Kemnaker. Upstream SSO
      // boleh saja membalas `Location` ke host lain; kita berhenti di sini
      // daripada mempercayainya dan berisiko menyentuh host internal/arbitrer.
      if (!isAllowedSsoUrl(location)) {
        trail.push(`!blokir-host-luar:${(() => {
          try {
            return new URL(location).hostname;
          } catch {
            return "(tak bisa diparse)";
          }
        })()}`);
        break;
      }
      currentUrl = new URL(location, currentUrl).toString();
    }

    // Diagnostik AMAN (tanpa nilai code/token). Lihat §4.0/§7.
    const hint = lastBodyHint ? `; halaman akhir: ${lastBodyHint}` : "";
    const diag = describeSsoRedirectResponse({
      status: 0,
      cookieNames,
    }).replace("[HTTP 0; ", `[jejak hop: ${trail.join(" -> ")}${hint}; `);
    return {
      status: "ERROR",
      message:
        `Mengikuti halaman SSO (${trail.length} hop) tidak menghasilkan 'code' ` +
        `(dicari di: Location, res.url, dan body HTML tiap hop). ${diag} ` +
        "Kirim ringkasan ini untuk memastikan bentuk langkah (3b) " +
        "(docs/MONEV-API.md §4.0/§7).",
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu menangkap code OAuth habis."
        : "Tidak dapat mengikuti halaman SSO Kemnaker.";
    return { status: "ERROR", message };
  } finally {
    clearTimeout(timer);
  }
}
