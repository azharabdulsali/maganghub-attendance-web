// src/lib/sso-prime-response.ts: logika MURNI (tanpa jaringan, tanpa `undici`)
// untuk mengurai & mengklasifikasi respons `GET /auth` halaman login SSO.
//
// ⚠️  KENAPA BERKAS INI TERPISAH (penting, jangan digabung kembali):
//
// Logika di sini adalah MURNI — hanya string/tipe, tidak menyentuh jaringan sama
// sekali. Ia dipakai DUA dunia:
//   1. sisi server (`monev-login.ts`, `kemnaker-sso.ts`) yang juga melakukan
//      jaringan (dan karena itu meng-import `undici` lewat `proxy-fetch`), dan
//   2. sisi KLIEN (mis. `credentials/credentials-form.tsx`) yang butuh
//      `isUnsolvableCloudflareChallenge` + `PrimeRejectionInfo` untuk menampilkan
//      pesan yang jujur.
//
// Dulu fungsi murni ini tinggal di `monev-login.ts`. Begitu `monev-login.ts`
// meng-import `proxy-fetch` → `undici` (`node:net`, `node:tls`), komponen klien
// yang meng-importnya ikut menyeret `undici` ke bundel browser dan GAGAL:
//
//   Cannot find module 'node:net': Unsupported external type Url ...
//
// Karena itu berkas MURNI ini **dilarang** meng-import modul apa pun yang
// menyentuh jaringan/Node-only (fetch, undici, kemnaker-sso, monev-client, ...).
// Hanya tipe & string. Dengan begitu klien bisa meng-importnya dengan aman.
//
// ATURAN: berkas ini tidak boleh punya `import` kecuali `import type` murni.

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
 * otomatis (Opsi A) **pasti** gagal dari IP datacenter.
 *
 * Dipakai UI untuk berkata jujur: jangan menyuruh pengguna "coba lagi" pada hal
 * yang mustahil. Dua jalan sah tersedia: (a) proxy residensial lewat
 * `MAGANGHUB_PROXY_URL` (SPEC §6 & AGENTS.md §73, DIIZINKAN 2026-06), atau
 * (b) jalur tempel token. Kita TIDAK mengakali proteksi dengan headless browser
 * atau meminjam `cf_clearance`; proxy residensial hanya membuat permintaan
 * datang dari IP wajar seperti browser pengguna.
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
  // kredensial salah. Sesuai SPEC §6/§10: jangan diakali, cukup dilaporkan —
  // penawar sahnya adalah IP residensial (proxy) atau jalur tempel token.
  const cloudflare =
    mitigated.length > 0 ||
    server.includes("cloudflare") ||
    (d.cfRay ?? "").length > 0;
  if (cloudflare) {
    parts.push(
      "Kemungkinan challenge Cloudflare/WAF (bukan kredensial salah). " +
        "Server kita tidak menjalankan JS. Set proxy residensial lewat " +
        "`MAGANGHUB_PROXY_URL`, atau pakai jalur tempel token.",
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
 *                   terhalang. UI harus mengarahkan ke proxy residensial /
 *                   tempel token manual.
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
