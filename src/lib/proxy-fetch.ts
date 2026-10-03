// src/lib/proxy-fetch.ts: `fetch` yang bisa lewat proxy residensial (opsional).
//
// KENAPA ADA FILE INI
// -------------------
// Portal login SSO Kemnaker (`account.kemnaker.go.id`) dijaga **Cloudflare
// Managed Challenge**. Dari IP datacenter (mis. Vercel) challenge itu tidak
// bisa diselesaikan tanpa browser, sehingga langkah `sso-prime` (GET /auth)
// gagal `403` dengan `cf-mitigated: challenge` — jauh sebelum password dicek.
//
// Repo referensi `maganghub-bot-attendance` (yang terbukti berhasil) menembus
// ini dengan **proxy residensial**: `HttpsProxyAgent` + `MAGANGHUB_PROXY_URL`.
// Proxy membuat request muncul dari IP residensial (IP pengguna/rumah), tempat
// challenge Cloudflare lolos secara wajar — **tanpa** mengecoh CAPTCHA/OTP,
// tanpa memalsukan identitas orang lain.
//
// DESAIN (sengaja minim-kejutan)
// ------------------------------
// - **Opsional.** Bila `MAGANGHUB_PROXY_URL` kosong/tidak valid → `fetch` biasa,
//   perilaku lama TIDAK berubah sama sekali.
// - **Hanya** dipakai untuk host yang memang dijaga Cloudflare (SSO). API Monev
//   TIDAK diblokir (§7 docs), jadi TIDAK lewat proxy — hemat kuota & risiko.
// - Proxy URL TIDAK PERNAH ditulis ke log/pesan error (bisa memuat sandi).
//
// Catatan teknis: Node tidak menerima proxy langsung di `fetch`. Dipakai
// `undici.ProxyAgent` sebagai `dispatcher` (lihat `RequestInit` ekstensi
// undici). Ini pola resmi yang sama semangatnya dengan `HttpsProxyAgent`.

import { ProxyAgent, type Dispatcher } from "undici";

/** Env var baca-saja untuk proxy. Nama sama dengan repo referensi. */
const PROXY_ENV_VAR = "MAGANGHUB_PROXY_URL";

/**
 * Cache agent per-URL supaya koneksi proxy dipakai ulang (keep-alive) dan tidak
 * membuat agent baru tiap request. Kunci = URL proxy apa adanya.
 */
const agentCache = new Map<string, ProxyAgent>();

/** Ambil `MAGANGHUB_PROXY_URL` yang valid, atau `undefined` bila tidak dipakai. */
export function getProxyUrl(): string | undefined {
  const raw = process.env[PROXY_ENV_VAR]?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return raw;
  } catch {
    // Nilai tidak valid: abaikan diam-diam (jangan sampai fitur inti mati
    // hanya karena salah ketik proxy). Bukan rahasia, aman dilaporkan.
    return undefined;
  }
}

/** True bila proxy aktif — dipakai lint/diagnostik, bukan untuk log isi URL. */
export function isProxyEnabled(): boolean {
  return getProxyUrl() !== undefined;
}

/**
 * `dispatcher` undici untuk request ke `targetUrl`, atau `undefined` bila proxy
 * tidak aktif. Hanya menerapkan proxy bila `MAGANGHUB_PROXY_URL` di-set.
 */
function dispatcherFor(targetUrl: string): Dispatcher | undefined {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return undefined;

  // Proxy diterapkan ke request apa pun saat env di-set; pemanggil yang
  // memutuskan host mana yang lewat proxy (lihat `fetchPortal` di bawah).
  // `targetUrl` disertakan agar mudah diperluas (allow-list host) tanpa
  // mengubah tanda tangan fungsi.
  void targetUrl;

  let agent = agentCache.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    agentCache.set(proxyUrl, agent);
  }
  return agent;
}

/**
 * `fetch` yang otomatis lewat `MAGANGHUB_PROXY_URL` bila di-set, selain itu
 * `fetch` biasa. Drop-in pengganti `fetch` untuk request ke portal yang dijaga
 * Cloudflare.
 */
export function fetchPortal(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const dispatcher = dispatcherFor(url);
  if (!dispatcher) return fetch(url, init);

  // `dispatcher` bukan bagian dari tipe lib.dom `RequestInit`; undici
  // menambahkannya saat runtime. Cast sempit + alasan jelas lebih baik daripada
  // `any` lebar.
  const withDispatcher = { ...init, dispatcher } as RequestInit & {
    dispatcher: Dispatcher;
  };
  return fetch(url, withDispatcher);
}
