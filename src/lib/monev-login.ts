// src/lib/monev-login.ts: orkestrasi login penuh ke portal Monev.
//
// Menyatukan tiga langkah yang sebelumnya terpisah menjadi SATU fungsi, supaya
// pemanggil (mis. route cron/webhook) tidak perlu menyusun urutannya sendiri:
//
//   (1) GET  /api/v1/auth/login                 → SSO URL + `state`  [startOAuthFlow]
//   (2) GET  account.kemnaker.go.id/auth        → x-csrf-token + cookie [primeSsoSession]
//   (3) POST account.kemnaker.go.id/auth/login  → sesi autentikasi (set-cookie) [loginToSso]
//   (3b) IKUTI authorizeUrl/rantai redirect SSO → cari `code`         [catchOAuthCode]
//        ⚠️  Cookie sesi dari langkah (3) WAJIB dibawa ke sini, tanpa itu SSO
//        melihat kita anonim dan membalas halaman SPA, bukan redirect `code`.
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
  catchOAuthCode,
  fetchAuthorizationRedirect,
  parseOAuthCallbackParams,
  extractCallbackUrl,
  describeHtmlHint,
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

/**
 * Header navigasi yang SELALU dikirim browser saat membuka dokumen, dan yang
 * WAJIB disertakan agar permintaan dari server tidak dibedakan dari kunjungan
 * browser biasa (penyebab `403` WAF di langkah (2) — lihat docs/MONEV-API.md).
 *
 * ⚠️  Ini BUKAN penyamaran: nilainya jujur (Chrome, Windows, id-ID) sama seperti
 * `User-Agent` yang memang sudah dipakai alur ini. Yang dihilangkan hanyalah
 * "kelainan" (klien Node yang tak mengirim `sec-fetch-*`/`Accept-Language`),
 * bukan identitas palsu. Sesuai SPEC.md §5/§6 & AGENTS.md §73: jangan mengakali
 * proteksi (spoof `cf_clearance`, proxy) — cukup kirim sinyal yang memang sah.
 */
const BROWSER_NAV_HEADERS: Record<string, string> = {
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "cross-site",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

/** Origin portal Monev, dipakai sebagai `Referer`/`Origin` yang sah. */
const MONEV_PORTAL_ORIGIN = "https://monev.maganghub.kemnaker.go.id";

// ---------------------------------------------------------------------------
// Langkah (2): priming sesi SSO, ambil x-csrf-token + cookie
// ---------------------------------------------------------------------------

/** Hasil priming: token CSRF + nilai cookie yang harus diteruskan ke login. */
export type SsoPrimeResult =
  | { status: "OK"; httpCode: number; csrfToken: string; cookies: string }
  | {
      status: "ERROR";
      /** Pesan ramah untuk pengguna (tanpa istilah teknis). */
      message: string;
      /**
       * Detail diagnostik teknis (header respons, kategori halaman, URL).
       * **Hanya untuk log/audit**, JANGAN dirender ke UI, isinya membingungkan
       * pengguna non-teknis.
       */
      diagnostic?: string;
      /**
       * Kategori penolakan (hanya terisi bila ada sinyal respons). UI memakai
       * ini untuk memberi tindakan: `"waf"` mengarahkan ke tempel token manual.
       */
      kind?: PrimeRejectionKind;
      /** Kode HTTP mentah bila kegagalan datang dari respons (bukan jaringan). */
      httpCode?: number;
      /**
       * Ringkasan terstruktur NON-RAHASIA dari respons yang menolak (header
       * kategori + URL final). Aman diteruskan ke klien untuk diagnosis: tidak
       * memuat token, cookie, password, maupun body HTML. `diagnostic` (string)
       * tetap khusus log; `prime` ini yang boleh mengalir ke UI/DevTools.
       */
      prime?: PrimeRejectionInfo;
    };

/**
 * Cari token CSRF di dalam **HTML** halaman login, MURNI, tanpa jaringan.
 *
 * ⚠️  Konteks: `GET /auth` mengembalikan **HTML**, bukan JSON. Uji lapangan
 * menunjukkan responsnya TIDAK memuat header `x-csrf-token`, melainkan token
 * ditanam di dalam markup. Karena itu kita memindai pola-pola umum:
 *
 *   1. `<meta name="csrf-token" content="...">`  (Laravel/Rails)
 *   2. `<input type="hidden" name="_csrf" value="...">`  (Spring/Laravel)
 *   3. `csrfToken = "..."` / `"csrfToken":"..."`  (state JS / JSON inline)
 *
 * Fungsi ini **tidak** mengklaim pola mana yang benar; ia mengembalikan kandidat
 * pertama yang cocok. Setelah bentuk halaman direkam, persempit ke pola nyata.
 * Mengembalikan `undefined` bila tak ada yang cocok, supaya pemanggil jujur
 * memberi `ERROR`, bukan token palsu.
 */
export function extractCsrfTokenFromHtml(html: string): string | undefined {
  if (!html) return undefined;

  // (1) <meta name="csrf-token" content="...">, urutan atribut bisa bolak-balik.
  const metaA = /<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (metaA?.[1]) return metaA[1].trim();
  const metaB = /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i.exec(html);
  if (metaB?.[1]) return metaB[1].trim();

  // (2) <input type="hidden" name="_csrf" value="...">
  const inputA =
    /<input[^>]*name=["']_csrf["'][^>]*value=["']([^"']+)["']/i.exec(html);
  if (inputA?.[1]) return inputA[1].trim();
  const inputB =
    /<input[^>]*value=["']([^"']+)["'][^>]*name=["']_csrf["']/i.exec(html);
  if (inputB?.[1]) return inputB[1].trim();

  // (3) csrfToken = "<token>"  |  "csrfToken":"<token>"
  const jsEq = /\bcsrf_?token\b\s*[:=]\s*["']([^"']{8,})["']/i.exec(html);
  if (jsEq?.[1]) return jsEq[1].trim();

  return undefined;
}

/**
 * Diagnostik NON-RAHASIA dari respons `GET /auth` (hanya untuk jalur gagal).
 * Tidak ada token/cookie/password di dalamnya — aman untuk ditampilkan & dicatat.
 */
export type PrimeResponseDiagnostics = {
  /** Header `content-type` (mis. `text/html`, `application/json`). */
  contentType?: string | null;
  /** Header `server` (mis. `cloudflare`, `openresty`). */
  server?: string | null;
  /** Header `content-length` bila ada (petunjuk ukuran body). */
  contentLength?: string | null;
  /** Header `cf-mitigated` — penanda TEGAS bahwa Cloudflare memblokir. */
  cfMitigated?: string | null;
  /** Header `cf-ray` — bukti permintaan melewati edge Cloudflare. */
  cfRay?: string | null;
  /** Body HTML mentah (hanya dipindai jadi kategori, isinya tak dibocorkan). */
  html?: string;
  /** URL final yang benar-benar dijawab (untuk tahu fallback `/auth` dipakai). */
  finalUrl?: string | null;
};

/**
 * Ringkasan NON-RAHASIA & JSON-friendly dari respons yang menolak priming.
 * Berbeda dari `PrimeResponseDiagnostics` (yang memuat `html` mentah), bentuk
 * ini sengaja hanya menyimpan **kategori** — aman dikirim ke klien agar
 * penyebab `403` bisa ditentukan dari DevTools/UI tanpa membuka log server.
 *
 * Tidak ada token, cookie, password, atau isi body di sini.
 */
export type PrimeRejectionInfo = {
  /** HTTP status yang menolak (mis. `403`). */
  httpCode: number;
  /** Kategori: `waf` | `page` | `unknown`. */
  kind: PrimeRejectionKind;
  /** Header `server` yang dilaporkan portal (mis. `cloudflare`), bila ada. */
  server?: string;
  /** Header `cf-mitigated` (mis. `challenge`), bila ada — penanda WAF Cloudflare. */
  cfMitigated?: string;
  /** Header `content-type`, bila ada. */
  contentType?: string;
  /** URL final yang benar-benar dijawab (bukti hop mana yang menolak). */
  finalUrl?: string;
};

/**
 * Apakah penolakan ini sebuah **Cloudflare Managed Challenge** yang, secara
 * prinsip, TIDAK bisa dilewati klien non-browser (MURNI, tanpa jaringan).
 *
 * `cf-mitigated: challenge` hanya dikirim Cloudflare saat ia menyajikan
 * interstitial "Verify you are human": diperlukan eksekusi JS + proof-of-work
 * lalu cookie `cf_clearance`. Karena server kita tidak menjalankan JS, alur
 * otomatis (Opsi A) **pasti** gagal di sini — bukan soal header yang kurang.
 *
 * Dipakai UI untuk berkata jujur: jangan menyuruh pengguna "coba lagi" pada hal
 * yang mustahil, arahkan langsung ke jalur tempel token. Sesuai SPEC §5/§6 &
 * AGENTS.md §73: kita TIDAK mengakali proteksi (headless browser, pinjam
 * `cf_clearance`, proxy) — cukup melaporkan dan mengalihkan.
 */
export function isUnsolvableCloudflareChallenge(
  info?: PrimeRejectionInfo | null,
): boolean {
  if (!info) return false;
  return (info.cfMitigated ?? "").toLowerCase() === "challenge";
}

/**
 * Bangun ringkasan non-rahasia dari respons penolakan, MURNI tanpa jaringan.
 * Selalu mengembalikan objek (tak pernah `undefined`) supaya jalur gagal selalu
 * menyertakan fakta mentah untuk diagnosis lapangan.
 */
export function buildPrimeRejectionInfo(
  httpCode: number,
  d?: PrimeResponseDiagnostics,
): PrimeRejectionInfo {
  const info: PrimeRejectionInfo = {
    httpCode,
    kind: classifyPrimeRejection(httpCode, d),
  };
  // Hanya salin bila berisi — hindari field kosong yang bising di UI/log.
  const server = d?.server ?? "";
  if (server) info.server = server;
  const cfMitigated = d?.cfMitigated ?? "";
  if (cfMitigated) info.cfMitigated = cfMitigated;
  const contentType = d?.contentType ?? "";
  if (contentType) info.contentType = contentType;
  const finalUrl = d?.finalUrl ?? "";
  if (finalUrl) info.finalUrl = finalUrl;
  return info;
}


/**
 * Susun pesan diagnostik (MURNI, tanpa jaringan) dari kode HTTP non-2xx + sinyal
 * respons, supaya penyebab `403` bisa ditentukan tanpa menebak.
 *
 * Yang dilaporkan hanya **kategori**, bukan isi: apakah challenge Cloudflare
 * (`cf-mitigated`/`server: cloudflare`), WAF Alibaba (`acw_tc`), halaman HTML
 * biasa (via `describeHtmlHint`), atau bentuk tak dikenal. Tidak ada token,
 * cookie, atau password yang pernah masuk ke sini.
 */
export function diagnosePrimeRejection(
  httpCode: number,
  d?: PrimeResponseDiagnostics,
): string {
  if (!d) return "";

  const parts: string[] = [];
  const ct = (d.contentType ?? "").toLowerCase();
  const server = (d.server ?? "").toLowerCase();
  const mitigated = (d.cfMitigated ?? "").toLowerCase();

  // (a) Sinyal TEGAS Cloudflare: header `cf-mitigated` ada, atau `server`
  // menyebut cloudflare. Ini menjelaskan 403 sebagai challenge WAF, BUKAN
  // kredensial salah. Sesuai SPEC §6/§10: jangan diakali, cukup dilaporkan.
  const cloudflare =
    mitigated.length > 0 ||
    server.includes("cloudflare") ||
    (d.cfRay ?? "").length > 0;
  if (cloudflare) {
    parts.push(
      "Kemungkinan challenge Cloudflare/WAF (bukan kredensial salah). " +
        "Server kita tidak punya cookie `cf_clearance` & tidak menjalankan JS, " +
        "jadi permintaan non-browser bisa diblokir.",
    );
  }

  // (b) WAF Alibaba (sering muncul di host Kemnaker) menandai lewat cookie `acw_tc`.
  if (httpCode === 403 && !cloudflare) {
    parts.push(
      "Kemungkinan ditolak WAF (mis. Alibaba `acw_tc`/`Server`). " +
        "Coba pastikan `authorizeUrl` lengkap dipakai, bukan `/auth` polos.",
    );
  }

  // (c) Isi respons: kategori halaman, bukan isinya.
  if (ct.includes("html") && d.html) {
    parts.push(`Halaman: ${describeHtmlHint(d.html)}.`);
  } else if (ct) {
    parts.push(`content-type: ${ct}.`);
  }

  // (d) Jejak teknis ringkas (aman).
  const tail: string[] = [];
  if (server) tail.push(`server=${server}`);
  if (mitigated) tail.push(`cf-mitigated=${mitigated}`);
  if (d.contentLength) tail.push(`len=${d.contentLength}`);
  if (d.finalUrl) tail.push(`url=${d.finalUrl}`);

  const head = parts.length ? ` ${parts.join(" ")}` : "";
  const tailStr = tail.length ? ` [${tail.join(" ")}]` : "";
  return `${head}${tailStr}`;
}

/**
 * Kategori penolakan priming SSO. MURNI, diturunkan dari sinyal respons yang
 * sama dengan `diagnosePrimeRejection`, tapi dalam bentuk **kode terstruktur**
 * supaya UI bisa memberi tindakan yang tepat (bukan sekadar menampilkan pesan).
 *
 * - `"waf"`       → server non-browser diblokir proteksi (Cloudflare/Alibaba).
 *                   **Bukan** kredensial salah; jalur login otomatis memang
 *                   terhalang. UI harus mengarahkan ke tempel token manual.
 * - `"page"`      → respons HTML normal tapi tanpa CSRF yang dikenali; bentuk
 *                   halaman berubah, butuh rekaman ulang (docs §4.0).
 * - `"unknown"`   → tak ada sinyal yang bisa disimpulkan.
 */
export type PrimeRejectionKind = "waf" | "page" | "unknown";

/**
 * Tentukan kategori penolakan priming, MURNI & teruji, tanpa jaringan.
 *
 * Dipisah dari `diagnosePrimeRejection` supaya UI tidak perlu mengurai teks
 * pesan; ia cukup membaca kategori ini. Keduanya memakai sinyal yang sama, jadi
 * tidak mungkin bertentangan.
 */
export function classifyPrimeRejection(
  httpCode: number,
  d?: PrimeResponseDiagnostics,
): PrimeRejectionKind {
  if (!d) return "unknown";

  const server = (d.server ?? "").toLowerCase();
  const mitigated = (d.cfMitigated ?? "").toLowerCase();
  const cloudflare =
    mitigated.length > 0 ||
    server.includes("cloudflare") ||
    (d.cfRay ?? "").length > 0;

  // Penanda WAF: Cloudflare terdeteksi, atau 403/429/503 tanpa sinyal lain
  // (khas penolakan gate, bukan halaman aplikasi normal).
  if (cloudflare) return "waf";
  if (httpCode === 403 || httpCode === 429 || httpCode === 503) return "waf";

  // Respons HTML sungguhan tapi gagal diekstrak → bentuk halaman berubah.
  if ((d.contentType ?? "").toLowerCase().includes("html")) return "page";

  return "unknown";
}

/**
 * Ambil `x-csrf-token` & cookie dari halaman login SSO, MURNI, tanpa jaringan.
 *
 * Sumber token diterima **berurutan** (yang pertama cocok menang):
 *   1. header respons `x-csrf-token` (bila portal memang mengirimnya),
 *   2. cookie `csrf_token`/`XSRF-TOKEN`/`_csrf`,
 *   3. **HTML body** via `extractCsrfTokenFromHtml` (jalur paling mungkin untuk
 *      halaman login berbasis markup).
 *
 * Cookie yang digabung HANYA yang relevan untuk login (cf/acw/session/csrf),
 * memakai daftar **awalan nama**, bukan menyalin seluruh header `set-cookie`.
 *
 * Bila respons **non-2xx/3xx** (mis. `403` dari WAF), pesan galat TIDAK sekadar
 * menyebut kode HTTP. Ia memuat **diagnostik non-rahasia** (`diagnosePrime-
 * Rejection`) supaya penyebabnya bisa ditentukan dari satu kiriman: apakah ini
 * challenge Cloudflare/WAF, halaman HTML biasa, atau WAF Alibaba (`acw_tc`).
 * Ini melayani temuan `docs/MONEV-API.md` §4.0 yang menyebut asal/usul `403`
 * pada `GET /auth` masih TERBUKA dan butuh satu rekaman nyata.
 */
export function interpretSsoPrimeResponse(
  httpCode: number,
  headers: {
    csrfToken?: string | null;
    setCookies?: string[];
    html?: string;
    /** Diagnostik non-rahasia untuk jalur non-2xx (opsional, aman). */
    diagnostics?: PrimeResponseDiagnostics;
  },
): SsoPrimeResult {
  if (httpCode < 200 || httpCode >= 400) {
    const kind = classifyPrimeRejection(httpCode, headers.diagnostics);
    return {
      status: "ERROR",
      httpCode,
      kind,
      // `message` = versi ramah untuk layar pengguna. `diagnostic` = detail
      // teknis (server/cf-mitigated/byte/URL) yang HANYA untuk log, tidak
      // pernah dirender. Tanpa pemisahan ini, istilah seperti "cf-mitigated"
      // dan 6724 byte muncul di kartu kredensial dan membingungkan pengguna.
      message: describeLoginErrorForUser({
        step: "sso-prime",
        kind,
        httpCode,
      }),
      diagnostic:
        `Priming SSO gagal (HTTP ${httpCode}).` +
        diagnosePrimeRejection(httpCode, headers.diagnostics),
      // Versi terstruktur yang AMAN dikirim ke klien (tanpa token/cookie/body).
      prime: buildPrimeRejectionInfo(httpCode, headers.diagnostics),
    };
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

  const csrfFromHtml = extractCsrfTokenFromHtml(headers.html ?? "");

  const csrfToken =
    (headers.csrfToken ?? "").trim() || csrfFromCookie || csrfFromHtml || undefined;

  if (!csrfToken) {
    return {
      status: "ERROR",
      message:
        "Token CSRF tidak ditemukan pada respons GET /auth SSO (dicari di " +
        "header, cookie, dan HTML). Bentuk halaman login perlu direkam ulang " +
        "(docs/MONEV-API.md §7).",
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
 * GET halaman login SSO untuk mendapatkan token CSRF + cookie. **GATED.**
 *
 * ⚠️  Menembak jaringan ke `account.kemnaker.go.id`. Butuh
 * `confirmLivePortalRequest: true`; tanpa itu → `ERROR` tanpa jaringan.
 *
 * `authorizeUrl` (dari langkah 1) **sebaiknya** diteruskan: halaman login
 * sebenarnya butuh query `?client_id=&redirect_uri=&state=&...`. Memanggil
 * `/auth` tanpa query bisa mengembalikan halaman/challenge yang berbeda.
 * Bila tak diberikan, kita jatuh ke `${ORIGIN}/auth` (perilaku lama).
 *
 * ⚠️  Redirect diikuti **MANUAL** (`redirect: "manual"`), bukan `"follow"`.
 * Dengan `"follow"`, cookie `set-cookie` di balik respons `3xx` perantara
 * HILANG — padahal cookie sesi inilah yang wajib dibawa ke langkah (3); tanpa
 * itu SSO melihat kita anonim. Tiap hop juga membawa header navigasi browser
 * yang sah (`sec-fetch-*`, `Accept-Language`, `Referer`) agar WAF tidak
 * membedakan permintaan server dari kunjungan browser (penyebab `403`).
 */
export async function primeSsoSession(opts: {
  confirmLivePortalRequest: boolean;
  authorizeUrl?: string;
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

  // Pakai URL authorize lengkap bila ada; kalau tidak, fallback ke /auth.
  const targetUrl =
    opts.authorizeUrl && /^https?:\/\//.test(opts.authorizeUrl)
      ? opts.authorizeUrl
      : `${KEMNAKER_SSO_ORIGIN}/auth`;

  try {
    // ⚠️  Ikuti redirect SECARA MANUAL (`redirect: "manual"`), bukan `"follow"`.
    // Alasannya: saat `"follow"`, cookie `set-cookie` yang dikirim di balik
    // respons `3xx` perantara HILANG — padahal cookie sesi itulah yang wajib
    // dibawa ke langkah (3). Klien referensi pun mengikuti redirect manual dan
    // menyimpan cookie tiap hop. `Referer` juga di-update tiap hop (sah: browser
    // mengirim `Referer` halaman sebelumnya).
    let currentUrl = targetUrl;
    let referer = `${MONEV_PORTAL_ORIGIN}/`;
    let cookies = "";
    let res!: Response;
    let html = "";

    const MAX_PRIME_HOPS = 4;
    for (let hop = 0; hop < MAX_PRIME_HOPS; hop++) {
      res = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": LOGIN_USER_AGENT,
          accept:
            "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          ...BROWSER_NAV_HEADERS,
          Referer: referer,
          ...(cookies ? { Cookie: cookies } : {}),
        },
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });

      const hopSetCookies =
        typeof res.headers.getSetCookie === "function"
          ? res.headers.getSetCookie()
          : [];
      cookies =
        mergeCookieHeader(cookies || undefined, hopSetCookies) ?? cookies;

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        referer = currentUrl;
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      // Baca HTML body: token CSRF kemungkinan besar ditanam di markup, BUKAN
      // di header. Isi body tidak pernah ditulis ke log/error, hanya dipindai.
      html = await res.text().catch(() => "");
      break;
    }

    // Bila loop habis saat MASIH berada di 3xx, rangkaian redirect tak selesai
    // (mis. loop tak berujung / `Location` hilang). Jangan salah tafsir sebagai
    // sukses: laporkan sebagai ERROR dengan fakta URL terakhir.
    if (res.status >= 300 && res.status < 400) {
      return {
        status: "ERROR",
        httpCode: res.status,
        kind: "unknown",
        message: describeLoginErrorForUser({
          step: "sso-prime",
          kind: "unknown",
          httpCode: res.status,
        }),
        diagnostic:
          `Priming SSO berhenti di redirect (HTTP ${res.status}) setelah ` +
          `${MAX_PRIME_HOPS} hop tanpa halaman final. url=${currentUrl}`,
        prime: {
          httpCode: res.status,
          kind: "unknown",
          finalUrl: currentUrl,
        },
      };
    }

    // Cookie gabungan tiap hop dipindai untuk token CSRF berbasis cookie.
    const setCookies = cookies
      ? cookies.split("; ").map((pair) => `${pair};`)
      : [];

    return interpretSsoPrimeResponse(res.status, {
      csrfToken: res.headers.get("x-csrf-token"),
      setCookies,
      html,
      // Diagnostik non-rahasia (tanpa token/cookie). Melayani temuan §4.0:
      // kenapa `GET /auth` bisa `403` (challenge WAF, HTML biasa, dst).
      diagnostics: {
        contentType: res.headers.get("content-type"),
        server: res.headers.get("server"),
        contentLength: res.headers.get("content-length"),
        cfMitigated: res.headers.get("cf-mitigated"),
        cfRay: res.headers.get("cf-ray"),
        finalUrl: res.url,
        html,
      },
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
      /**
       * Cookie `monev_refresh_token` bila portal mengirimkannya saat callback.
       * Sesi 30 hari, jauh lebih tahan lama dari access token (6 jam). Tidak
       * selalu ada; pemanggil harus siap menerima `undefined`.
       */
      refreshToken?: string;
    }
  | {
      status: "REJECTED";
      /** Langkah yang menolak. */
      step: LoginStep;
      httpCode?: number;
      message: string;
    }
  | {
      status: "ERROR";
      step: LoginStep;
      /** Pesan ramah untuk layar pengguna. */
      message: string;
      /** Detail teknis untuk log saja (tidak pernah dirender ke UI). */
      diagnostic?: string;
      kind?: PrimeRejectionKind;
      /**
       * Fakta non-rahasia dari respons yang menolak priming (HTTP/kategori/URL
       * final), AMAN dikirim ke klien untuk diagnosis mandiri. Berbeda dari
       * `diagnostic` yang khusus log server.
       */
      prime?: PrimeRejectionInfo;
    };

/** Nama langkah, dipakai agar UI/audit tahu di mana alur berhenti. */
export type LoginStep =
  | "oauth-start"
  | "sso-prime"
  | "sso-login"
  | "code-exchange";

/**
 * Gabungkan header cookie dari dua sumber menjadi satu, MURNI, bisa diuji.
 *
 * Dipakai untuk menyatukan cookie priming (langkah 2) dengan cookie sesi hasil
 * login (langkah 3). Bila nama cookie sama, nilai dari sumber **berikutnya**
 * (login) menang, karena ia yang paling baru. Hanya `nama=nilai` yang
 * dipertahankan; atribut (`Path`, `HttpOnly`, dst.) dibuang.
 */
export function mergeCookieHeader(
  baseCookies: string | undefined,
  setCookies: string[] | undefined,
): string | undefined {
  const jar = new Map<string, string>();
  const absorb = (raw: string) => {
    const first = raw.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) return;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name && value.length > 0) jar.set(name, value);
  };
  if (baseCookies) for (const part of baseCookies.split(";")) absorb(part);
  if (setCookies) for (const raw of setCookies) absorb(raw);
  if (jar.size === 0) return undefined;
  return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

/**
 * Ringkasan langkah untuk UI/audit, MURNI. Sengaja tidak memuat rahasia:
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
 * Pesan untuk MATA PENGGUNA, MURNI. Terpisah dari pesan diagnostik
 * (`diagnosePrimeRejection`) yang penuh istilah teknis (`cf-mitigated`, byte,
 * URL). Pengguna hanya perlu tahu: apa yang terjadi, apakah salah mereka, dan
 * langkah berikutnya. Detail teknis tetap tersedia untuk log lewat field lain,
 * tidak pernah dirender ke layar.
 *
 * `kind` menentukan nada kalimat: `waf` menegaskan ini BUKAN soal kredensial
 * (sesuai SPEC §6/§10: jangan biarkan pengguna menebak password salah).
 */
export function describeLoginErrorForUser(input: {
  step: LoginStep;
  kind?: PrimeRejectionKind;
  httpCode?: number;
}): string {
  const { step, kind, httpCode } = input;

  if (step === "sso-prime" && (kind === "waf" || httpCode === 403)) {
    return (
      "Portal MagangHub menolak permintaan dari server kami karena proteksi " +
      "anti-bot, bukan karena email & password Anda salah. Gunakan cara " +
      "tempel token di bawah untuk menghubungkan sesi."
    );
  }

  if (step === "sso-prime") {
    return (
      "Halaman login portal tidak bisa dibaca saat ini. Coba lagi nanti, atau " +
      "pakai cara tempel token di bawah."
    );
  }

  if (step === "sso-login" && kind === "waf") {
    return (
      "Portal menolak permintaan dari server kami karena proteksi anti-bot, " +
      "bukan karena kredensial Anda. Gunakan cara tempel token di bawah."
    );
  }

  if (step === "sso-login") {
    return (
      "Login ke portal belum berhasil diselesaikan. Coba lagi sebentar, atau " +
      "pakai cara tempel token di bawah."
    );
  }

  return (
    "Login otomatis belum berhasil. Coba lagi sebentar, atau pakai cara " +
    "tempel token di bawah."
  );
}

/**
 * Jalankan alur login penuh. **GATED**, butuh `confirmLivePortalRequest: true`.
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
  const { state: stateFromStep1, authorizeUrl } = start;

  // --- Langkah 2: priming SSO → csrf + cookie --------------------------------
  const prime = await primeSsoSession({
    confirmLivePortalRequest: true,
    authorizeUrl,
    timeoutMs,
  });
  if (prime.status !== "OK") {
    return {
      status: "ERROR",
      step: "sso-prime",
      message: prime.message,
      diagnostic: prime.diagnostic,
      kind: prime.kind,
      prime: prime.prime,
    };
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

  // `code` OAuth hanya diterbitkan saat SSO memproses **permintaan otorisasi**,
  // yaitu `authorizeUrl` dari langkah (1), yang memuat
  // `client_id`/`response_type=code`/`state`. Mengikuti `redirectUri` dari
  // langkah (3) TERBUKTI buntu (jejak hop `301→302→200` tanpa `code`, §4.0):
  // halaman itu halaman SSO biasa, bukan permintaan otorisasi. Karena itu urutan
  // percobaan: (a) `authorizeUrl` (permintaan otorisasi, paling mungkin),
  // (b) `redirect_uri` dari respons login (cadangan), (c) `code` langsung di
  // keduanya, (d) apa pun di `Location`/body saat mengikuti.
  let code = authorizeUrl ? parseOAuthCallbackParams(authorizeUrl).code : undefined;
  let state = authorizeUrl
    ? (parseOAuthCallbackParams(authorizeUrl).state ?? stateFromStep1)
    : stateFromStep1;
  if (!code && login.redirectUri) {
    code = parseOAuthCallbackParams(login.redirectUri).code;
    if (code) {
      state = parseOAuthCallbackParams(login.redirectUri).state ?? stateFromStep1;
    }
  }

  // Jejak diagnostik (aman, tanpa token) untuk pesan galat bila `code` tak ada.
  const catchDiags: string[] = [];
  const followTargets: Array<{ label: string; url: string }> = [];
  // (a) Permintaan otorisasi asli dari langkah (1), pihak yang benar-benar
  // menerbitkan `code`. Dilewati bila URL sudah membawa `code` (sudah ditangkap).
  if (!code && authorizeUrl && !parseOAuthCallbackParams(authorizeUrl).code) {
    followTargets.push({ label: "authorizeUrl(langkah 1)", url: authorizeUrl });
  }
  // (b) Cadangan: `redirect_uri` dari respons login (halaman SSO).
  if (!code && login.redirectUri && !extractCallbackUrl(login.redirectUri)) {
    followTargets.push({ label: "redirect_uri(langkah 3)", url: login.redirectUri });
  }

  for (const target of followTargets) {
    if (code) break;
    // Gabungkan cookie priming (langkah 2) DENGAN cookie sesi hasil login
    // (langkah 3). Cookie login-lah yang menandai sesi AUTENTIKASI; tanpa itu
    // SSO membalas halaman SPA, bukan redirect `code` (lihat `loginToSso`).
    const mergedCookies = mergeCookieHeader(prime.cookies, login.setCookies);
    const caught = await catchOAuthCode(target.url, {
      cookies: mergedCookies,
      confirmLivePortalRequest: true,
      timeoutMs,
    });
    if (caught.status === "OK") {
      code = caught.code;
      state = caught.state ?? state;
    } else {
      catchDiags.push(`${target.label}: ${caught.message}`);
    }
  }
  // (c) Cadangan terakhir & TERBUKTI berhasil: bila mengikuti redirect buntu
  // (halaman SSO adalah shell SPA), panggil `POST /auth` untuk memanen
  // `redirect_uri` ber-`code`. Lihat `fetchAuthorizationRedirect`.
  if (!code) {
    const mergedCookies = mergeCookieHeader(prime.cookies, login.setCookies);
    const authz = await fetchAuthorizationRedirect({
      csrfToken: prime.csrfToken,
      cookies: mergedCookies,
      confirmLivePortalRequest: true,
      timeoutMs,
    });
    if (authz.status === "OK") {
      const parsed = parseOAuthCallbackParams(authz.callbackUrl);
      if (parsed.code) {
        code = parsed.code;
        state = parsed.state ?? state;
      }
    } else {
      catchDiags.push(`POST /auth: ${authz.message}`);
    }
  }



  if (!code) {
    code = parseOAuthCallbackParams(authorizeUrl).code;
  }

  if (!code) {
    // Pesan galat memuat DIAGNOSTIK asli dari (3b) supaya bisa direkam, bukan
    // diringkas jadi "bentuk respons berbeda" yang menghapus bukti.
    const detail = catchDiags.length
      ? ` Detail (3b): ${catchDiags.join(" | ")}`
      : "(3b tidak dijalankan: tidak ada authorizeUrl/redirect_uri yang bisa diikuti).";
    return {
      status: "ERROR",
      step: "sso-login",
      message:
        "Login SSO diterima (authenticated: true) tetapi 'code' OAuth tidak " +
        "berhasil ditangkap. Kirim detail ini untuk memastikan bentuk langkah " +
        "(3b) (docs/MONEV-API.md §4.0/§7)." +
        detail,
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
      refreshToken: exchanged.refreshToken,
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
