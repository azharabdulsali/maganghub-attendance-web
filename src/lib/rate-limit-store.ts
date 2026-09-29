// src/lib/rate-limit-store.ts — penyimpanan penghitung rate limit.
//
// Dipisah dari `rate-limit.ts` (kebijakan murni) supaya kebijakan tak pernah
// bergantung pada jaringan. Dua implementasi:
//
//   - InMemoryRateLimitStore : default, nol dependency, per-proses.
//   - UpstashRateLimitStore  : dipakai otomatis bila env Upstash tersedia.
//
// Store WAJIB idempoten: `increment(key, windowMs, now)` mengembalikan
// penghitung SETELAH kenaikan, dan tidak boleh menaikkan lebih dari sekali
// untuk satu panggilan.

import type { RateLimitCounter } from "./rate-limit";

export interface RateLimitStore {
  /**
   * Catat satu permintaan untuk `key`, kembalikan penghitung terbaru.
   * Bila jendela `windowMs` sudah lewat sejak windowStart tersimpan, store
   * menganggapnya jendela baru (count = 1).
   */
  increment(
    key: string,
    windowMs: number,
    now: number,
  ): Promise<RateLimitCounter>;
}

// ---------------------------------------------------------------------------
// In-memory — default dev / 1 instance. TIDAK akurat lintas instance Vercel.
// ---------------------------------------------------------------------------

/** Map kunci → penghitung. Modul-level agar bertahan antar-invokasi (per proses). */
const buckets = new Map<string, RateLimitCounter>();

/** Batas entri agar memori tak tumbuh tanpa batas pada lalu lintas liar. */
const MAX_BUCKETS = 10_000;

export class InMemoryRateLimitStore implements RateLimitStore {
  async increment(
    key: string,
    windowMs: number,
    now: number,
  ): Promise<RateLimitCounter> {
    const existing = buckets.get(key);
    const expired = !existing || now - existing.windowStart >= windowMs;

    const next: RateLimitCounter = expired
      ? { count: 1, windowStart: now }
      : { count: existing.count + 1, windowStart: existing.windowStart };

    buckets.set(key, next);

    // Sapu ringan: bila kebanyakan, buang entri yang jendelanya sudah lewat.
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets) {
        if (now - v.windowStart >= windowMs) buckets.delete(k);
      }
    }

    return next;
  }
}

/** Untuk pengujian: kosongkan semua penghitung. */
export function __resetInMemoryRateLimitStore(): void {
  buckets.clear();
}

// ---------------------------------------------------------------------------
// Upstash REST — opsional. Dipakai tanpa SDK: cukup REST API-nya.
//
// Menghindari dependency tambahan: cukup fetch + header Authorization. Bila
// env tidak ada, kelas ini tak pernah dibuat (lihat createRateLimitStore).
// ---------------------------------------------------------------------------

interface UpstashConfig {
  url: string;
  token: string;
}

export class UpstashRateLimitStore implements RateLimitStore {
  constructor(private readonly config: UpstashConfig) {}

  /**
   * Naikkan penghitung secara atomik via pipeline REST:
   *   INCR key  →  jika hasil 1 (baru), set EXPIRE windowMs  →  GET key
   *
   * Kita memakai INCR + EXPIRE, dan menyimpan windowStart di kunci pendamping
   * `key:ws` supaya keputusan murni tetap bisa menghitung resetAt dengan benar.
   */
  async increment(
    key: string,
    windowMs: number,
    now: number,
  ): Promise<RateLimitCounter> {
    const wsKey = `${key}:ws`;

    const commands: (string | number)[][] = [
      ["INCR", key],
      ["TTL", key],
    ];

    const results = await this.pipeline(commands);
    const count = Number(results[0] ?? 0);
    const ttl = Number(results[1] ?? -1);

    // Kunci baru (TTL -1 = tak kedaluwarsa) → set expiry + catat windowStart.
    if (ttl < 0) {
      await this.pipeline([
        ["PEXPIRE", key, windowMs],
        ["SET", wsKey, now, "PX", windowMs],
      ]);
    }

    const wsResults = await this.pipeline([["GET", wsKey]]);
    const wsRaw = wsResults[0];
    const windowStart =
      tablessParseInt(wsRaw) ?? now - Math.max(0, (ttl > 0 ? ttl : 0));

    return { count, windowStart };
  }

  /** Jalankan beberapa perintah Upstash lewat /pipeline (satu round-trip). */
  private async pipeline(
    commands: (string | number)[][],
  ): Promise<unknown[]> {
    const res = await fetch(`${this.config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      // Jangan cache jawaban rate limit.
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Upstash pipeline gagal: HTTP ${res.status}`);
    }

    const json = (await res.json()) as { result?: unknown }[];
    return json.map((entry) => entry.result);
  }
}

/** Parse hasil GET Upstash yang bisa string/null. */
function tablessParseInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pilih store: Upstash bila env tersedia, selain itu in-memory.
 *
 * Dibaca saat panggilan (bukan modul-level) supaya tes bisa mengubah env tanpa
 * memuat ulang modul.
 */
export function createRateLimitStore(env: NodeJS.ProcessEnv = process.env): RateLimitStore {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    return new UpstashRateLimitStore({ url, token });
  }
  return new InMemoryRateLimitStore();
}
