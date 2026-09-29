import { beforeEach, describe, expect, it, vi } from "vitest";

import { enforceRateLimit } from "./enforce-rate-limit";
import { RATE_LIMITS } from "./rate-limit";
import {
  InMemoryRateLimitStore,
  __resetInMemoryRateLimitStore,
  createRateLimitStore,
} from "./rate-limit-store";
import type { RateLimitStore } from "./rate-limit-store";
import type { RateLimitCounter } from "./rate-limit";

beforeEach(() => {
  __resetInMemoryRateLimitStore();
});

describe("InMemoryRateLimitStore", () => {
  it("menaikkan penghitung dalam jendela yang sama", async () => {
    const store = new InMemoryRateLimitStore();
    const a = await store.increment("k", 60_000, 1000);
    const b = await store.increment("k", 60_000, 2000);
    expect(a).toEqual({ count: 1, windowStart: 1000 });
    expect(b).toEqual({ count: 2, windowStart: 1000 });
  });

  it("memulai ulang setelah jendela lewat", async () => {
    const store = new InMemoryRateLimitStore();
    await store.increment("k", 60_000, 1000);
    const c = await store.increment("k", 60_000, 1000 + 60_000);
    expect(c).toEqual({ count: 1, windowStart: 1000 + 60_000 });
  });
});

describe("createRateLimitStore", () => {
  it("memakai in-memory bila env Upstash kosong", () => {
    expect(createRateLimitStore({} as unknown as NodeJS.ProcessEnv)).toBeInstanceOf(
      InMemoryRateLimitStore,
    );
  });

  it("memakai Upstash bila kedua env diisi", () => {
    const store = createRateLimitStore({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "tok",
    } as unknown as NodeJS.ProcessEnv);
    expect(store.constructor.name).toBe("UpstashRateLimitStore");
  });
});

/** Store palsu: selalu mengembalikan penghitung yang kita tentukan. */
function fakeStore(counter: RateLimitCounter | null): RateLimitStore {
  return { increment: async () => counter ?? { count: 1, windowStart: 0 } };
}

describe("enforceRateLimit", () => {
  it("mengizinkan & mengembalikan header saat di bawah batas", async () => {
    const res = await enforceRateLimit("login", "rl:login:x", {
      now: 1000,
      store: fakeStore({ count: 1, windowStart: 1000 }),
    });
    expect(res.decision.allowed).toBe(true);
    expect(res.headers["X-RateLimit-Limit"]).toBe(String(RATE_LIMITS.login.limit));
  });

  it("menolak saat penghitung melewati batas", async () => {
    const limit = RATE_LIMITS.login.limit;
    const res = await enforceRateLimit("login", "rl:login:x", {
      now: 1000,
      store: fakeStore({ count: limit + 1, windowStart: 1000 }),
    });
    expect(res.decision.allowed).toBe(false);
    expect(res.headers["Retry-After"]).toBeDefined();
  });

  it("fail open bila store melempar (ketersediaan diutamakan)", async () => {
    const broken: RateLimitStore = {
      increment: vi.fn().mockRejectedValue(new Error("upstash down")),
    };
    const res = await enforceRateLimit("cron", "rl:cron:x", {
      now: 1000,
      store: broken,
    });
    expect(res.decision.allowed).toBe(true);
    expect(res.decision.remaining).toBe(RATE_LIMITS.cron.limit);
  });
});
