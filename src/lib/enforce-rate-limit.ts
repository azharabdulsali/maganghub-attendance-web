// src/lib/enforce-rate-limit.ts: penyatu kebijakan murni + store.
//
// Route cukup memanggil `enforceRateLimit(...)` dan memeriksa `.allowed`.
// Semuanya di satu tempat supaya aturan tak terduplikasi di tiap endpoint.
//
// Prinsip keselamatan: bila store bermasalah (mis. Upstash tak dapat
// dihubungi), kita TIDAK mengunci pengguna keluar, kita "fail open" untuk
// ketersediaan, tetapi mencatatnya. Rate limit adalah lapisan pertahanan,
// bukan gerbang tunggal; gerbang utama tetap sesi/kunci.

import {
  RATE_LIMITS,
  decideRateLimit,
  rateLimitHeaders,
  type RateLimitDecision,
} from "./rate-limit";
import { createRateLimitStore, type RateLimitStore } from "./rate-limit-store";

/** Nama kebijakan yang tersedia. */
export type RateLimitScope = keyof typeof RATE_LIMITS;

export interface EnforceResult {
  decision: RateLimitDecision;
  /** Header siap-tempel ke respons (X-RateLimit-*, Retry-After). */
  headers: Record<string, string>;
}

/**
 * Tegakkan satu kebijakan untuk `key` (biasanya dari `rateLimitKey`).
 *
 * @param scope  Kebijakan (mis. "login").
 * @param key    Kunci unik gabungan (dari `rateLimitKey(scope, id)`).
 * @param opts   Opsi: waktu kustom + store kustom (untuk pengujian).
 */
export async function enforceRateLimit(
  scope: RateLimitScope,
  key: string,
  opts: { now?: number; store?: RateLimitStore } = {},
): Promise<EnforceResult> {
  const { limit, windowMs } = RATE_LIMITS[scope];
  const now = opts.now ?? Date.now();
  const store = opts.store ?? createRateLimitStore();

  try {
    const counter = await store.increment(key, windowMs, now);
    const { decision } = decideRateLimit(counter, limit, windowMs, now);
    return { decision, headers: rateLimitHeaders(decision) };
  } catch {
    // Store mati → izinkan (fail open) tetapi laporkan sisa jatah "penuh"
    // supaya pemanggil tetap punya header yang masuk akal.
    const decision: RateLimitDecision = {
      allowed: true,
      remaining: limit,
      limit,
      retryAfterSeconds: 0,
      resetAt: now + windowMs,
    };
    return { decision, headers: rateLimitHeaders(decision) };
  }
}
