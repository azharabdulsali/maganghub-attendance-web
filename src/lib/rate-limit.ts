// src/lib/rate-limit.ts: pembatas laju permintaan (rate limit).
//
// Kenapa ada: SPEC.md §10 poin 6 mewajibkan perlindungan terhadap percobaan
// berulang pada endpoint sensitif (login, submit, webhook cron, ubah
// kredensial). Tanpa ini, kunci webhook bisa ditebak berulang dan endpoint
// submit bisa dibanjiri permintaan.
//
// Desain, DUA lapis, sengaja dipisah:
//
//   1. BAGIAN MURNI (berkas ini): keputusan rate limit berbasis jendela tetap
//      (fixed window). Tidak menyentuh jaringan/DB sama sekali, sehingga bisa
//      diuji tuntas dengan waktu yang disuntikkan. Ini "kebijakan".
//
//   2. STORE (di route): penyimpanan penghitung.
//      - In-memory  → default saat dev / 1 instance (nol dependency).
//      - Upstash    → dipakai otomatis bila UPSTASH_REDIS_REST_URL &
//                     UPSTASH_REDIS_REST_TOKEN diisi (akurat lintas instance).
//      Kebijakan tidak pernah tahu store mana yang dipakai.
//
// Catatan kejujuran arsitektur: rate limit in-memory TIDAK akurat di serverless
// (tiap instance punya memori sendiri). Ia tetap berguna untuk dev dan
// melindungi kasus dasar; untuk produksi penuh, pasang Upstash.

/** Hasil keputusan pembatas (murni). */
export interface RateLimitDecision {
  /** Boleh lanjut atau tidak. */
  allowed: boolean;
  /** Sisa jatah di jendela ini (0 bila habis). */
  remaining: number;
  /** Batas total per jendela. */
  limit: number;
  /** Detik sampai jatah pulih (untuk header Retry-After). */
  retryAfterSeconds: number;
  /** Epoch ms kapan jendela saat ini berakhir. */
  resetAt: number;
}

/** Snapshot penghitung di store untuk satu kunci, dalam satu jendela. */
export interface RateLimitCounter {
  /** Jumlah permintaan yang sudah tercatat di jendela berjalan. */
  count: number;
  /** Epoch ms saat jendela berjalan dimulai. */
  windowStart: number;
}

/**
 * Hitung keputusan dari penghitung + waktu, MURNI (tanpa efek samping).
 *
 * Jendela tetap: setiap `windowMs` penghitung di-reset. Cukup untuk melindungi
 * dari banjir permintaan & tebak-menebak.
 *
 * @param counter   Penghitung saat ini. `null` = belum ada.
 * @param limit     Batas permintaan per jendela (harus > 0).
 * @param windowMs  Panjang jendela milidetik (harus > 0).
 * @param now       Waktu sekarang (epoch ms), disuntik agar bisa diuji.
 */
export function decideRateLimit(
  counter: RateLimitCounter | null,
  limit: number,
  windowMs: number,
  now: number,
): { decision: RateLimitDecision; next: RateLimitCounter } {
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("limit harus bilangan positif");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("windowMs harus bilangan positif");
  }

  // Jendela sudah lewat (atau belum ada) → mulai jendela baru.
  const windowExpired = counter === null || now - counter.windowStart >= windowMs;

  const next: RateLimitCounter = windowExpired
    ? { count: 1, windowStart: now }
    : { count: counter.count + 1, windowStart: counter.windowStart };

  const resetAt = next.windowStart + windowMs;

  if (next.count > limit) {
    // Lewat batas → tolak. Penghitung TIDAK dibengkakkan: disimpan tetap di
    // `limit` supaya percobaan berulang tak menaikkan angka tanpa henti.
    return {
      decision: {
        allowed: false,
        remaining: 0,
        limit,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
        resetAt,
      },
      next: { count: limit, windowStart: next.windowStart },
    };
  }

  return {
    decision: {
      allowed: true,
      remaining: Math.max(0, limit - next.count),
      limit,
      retryAfterSeconds: 0,
      resetAt,
    },
    next,
  };
}

/** Buang karakter yang bisa mengacaukan kunci store. */
function sanitizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:@-]/g, "_").slice(0, 200);
}

/**
 * Kunci rate limit dari lingkup + identitas.
 *
 * Identitas menitikberatkan pengguna bila diketahui, jatuh ke IP bila anonim
 * (mis. percobaan login gagal). Ini mencegah satu penyerang memboroskan jatah
 * IP bersama, sekaligus tetap melindungi endpoint tanpa sesi.
 */
export function rateLimitKey(scope: string, id: string): string {
  return `rl:${scope}:${sanitizeKeyPart(id)}`;
}

/**
 * Ambil IP klien dari header proxy yang lazim. MURNI (hanya baca string).
 *
 * Vercel menaruh IP asli paling kiri di `x-forwarded-for`. Bila tak ada,
 * "unknown", semua permintaan tanpa header berbagi satu jatah, pilihan yang
 * aman (lebih baik membatasi diri sendiri daripada membiarkan terbuka).
 */
export function clientIpFromHeaders(
  getHeader: (name: string) => string | null,
): string {
  const xff = getHeader("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return getHeader("x-real-ip")?.trim() || "unknown";
}

/** Header standar untuk melaporkan status rate limit ke klien. */
export function rateLimitHeaders(
  decision: RateLimitDecision,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
  };
  if (!decision.allowed) {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
  }
  return headers;
}

/** Batas lazim per kebijakan (satu sumber kebenaran). */
export const RATE_LIMITS = {
  /** Login: 10 / 5 menit per IP, cukup untuk salah ketik, bukan brute force. */
  login: { limit: 10, windowMs: 5 * 60_000 },
  /** Submit manual: 20 / 10 menit per pengguna, cegah dobel-klik & spam. */
  submitManual: { limit: 20, windowMs: 10 * 60_000 },
  /** Webhook cron: 30 / 5 menit per IP, cron normal 1×/hari; jaring pengaman. */
  cron: { limit: 30, windowMs: 5 * 60_000 },
  /** Ubah kredensial: 10 / 10 menit per pengguna. */
  credentials: { limit: 10, windowMs: 10 * 60_000 },
  /**
   * Ubah kata sandi akun sendiri: 5 / 10 menit per pengguna. Lebih ketat dari
   * `credentials` karena tiap percobaan memverifikasi kata sandi lama (bcrypt),
   * batas rendah membuat tebak-kata-sandi-lama lewat UI tidak ekonomis.
   */
  passwordChange: { limit: 5, windowMs: 10 * 60_000 },
  /**
   * Login otomatis ke portal Monev: 6 / 10 menit per pengguna. Lebih ketat
   * dari `credentials` karena tiap percobaan mengirim kredensial ke portal
   * sungguhan, salah password berulang bisa memicu penguncian akun di SSO.
   */
  credentialsLogin: { limit: 6, windowMs: 10 * 60_000 },
  /**
   * Uji koneksi sesi Monev ("Tes ulang"): 12 / 10 menit per pengguna. Lebih
   * longgar dari `credentialsLogin` (tombol uji boleh diklik beberapa kali),
   * tetapi tetap dibatasi karena tiap panggilan menyentuh portal sungguhan.
   */
  credentialsVerify: { limit: 12, windowMs: 10 * 60_000 },
  /**
   * Cabut semua sesi perangkat lain: 5 / 10 menit per pengguna. Sekali klik
   * sudah cukup; percobaan berulang hanya membebani DB dan memaksa sesi lain
   * login ulang berkali-kali tanpa manfaat.
   */
  sessionRevoke: { limit: 5, windowMs: 10 * 60_000 },
  /**
   * Ubah email akun sendiri: 5 / 10 menit per pengguna. Sama ketatnya dengan
   * `passwordChange` karena keduanya memverifikasi kata sandi lama (bcrypt) dan
   * karena email adalah identitas login, batas rendah mencegah endpoint ini
   * dipakai menebak kata sandi atau memindai email yang sudah terdaftar.
   */
  emailChange: { limit: 5, windowMs: 10 * 60_000 },
  /** Pendaftaran: 3 / jam per IP (SPEC.md §8). */
  register: { limit: 3, windowMs: 60 * 60_000 },
} as const;
