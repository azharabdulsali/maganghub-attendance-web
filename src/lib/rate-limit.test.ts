import { describe, expect, it } from "vitest";

import {
  RATE_LIMITS,
  clientIpFromHeaders,
  decideRateLimit,
  rateLimitHeaders,
  rateLimitKey,
  type RateLimitCounter,
} from "./rate-limit";

const LIMIT = 3;
const WINDOW = 60_000;
const T0 = 1_700_000_000_000;

/** Jalankan `n` permintaan dari penghitung kosong, kembalikan urutan keputusan. */
function run(n: number, startAt = T0) {
  let counter: RateLimitCounter | null = null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const now = startAt + i * 1000;
    const { decision, next } = decideRateLimit(counter, LIMIT, WINDOW, now);
    counter = next;
    out.push(decision);
  }
  return out;
}

describe("decideRateLimit", () => {
  it("mengizinkan selama di bawah batas dan mengurangi sisa", () => {
    const decisions = run(3);
    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true]);
    expect(decisions.map((d) => d.remaining)).toEqual([2, 1, 0]);
  });

  it("menolak permintaan ke-(limit+1) dengan Retry-After wajar", () => {
    const decisions = run(4);
    const keempat = decisions[3];
    expect(keempat.allowed).toBe(false);
    expect(keempat.remaining).toBe(0);
    expect(keempat.retryAfterSeconds).toBeGreaterThan(0);
    expect(keempat.retryAfterSeconds).toBeLessThanOrEqual(WINDOW / 1000);
  });

  it("tidak membengkakkan penghitung meski ditolak berulang", () => {
    let counter: RateLimitCounter | null = null;
    let last = { count: 0 };
    for (let i = 0; i < 10; i++) {
      const r = decideRateLimit(counter, LIMIT, WINDOW, T0 + i * 100);
      counter = r.next;
      last = r.next;
    }
    expect(last.count).toBe(LIMIT); // tetap di batas, bukan 10
  });

  it("memulai jendela baru setelah windowMs lewat", () => {
    // Habiskan jatah.
    let counter: RateLimitCounter | null = null;
    for (let i = 0; i < LIMIT; i++) {
      counter = decideRateLimit(counter, LIMIT, WINDOW, T0 + i).next;
    }
    // Tepat di akhir jendela → boleh lagi.
    const { decision } = decideRateLimit(counter, LIMIT, WINDOW, T0 + WINDOW);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(LIMIT - 1);
  });

  it("resetAt konsisten = windowStart + windowMs", () => {
    const { decision, next } = decideRateLimit(null, LIMIT, WINDOW, T0);
    expect(next.windowStart).toBe(T0);
    expect(decision.resetAt).toBe(T0 + WINDOW);
  });

  it("menolak limit/windowMs tak wajar", () => {
    expect(() => decideRateLimit(null, 0, WINDOW, T0)).toThrow();
    expect(() => decideRateLimit(null, LIMIT, 0, T0)).toThrow();
    expect(() => decideRateLimit(null, -1, WINDOW, T0)).toThrow();
  });
});

describe("rateLimitKey", () => {
  it("mencuci input agar konsisten & aman", () => {
    expect(rateLimitKey("login", "  User@Example.COM ")).toBe(
      "rl:login:user@example.com",
    );
  });

  it("mengganti karakter aneh dan membatasi panjang", () => {
    const key = rateLimitKey("cron", "a b/c\\d" + "x".repeat(500));
    expect(key.startsWith("rl:cron:")).toBe(true);
    expect(key).not.toContain(" ");
    expect(key.length).toBeLessThanOrEqual("rl:cron:".length + 200);
  });
});

describe("clientIpFromHeaders", () => {
  it("mengambil IP paling kiri dari x-forwarded-for", () => {
    const ip = clientIpFromHeaders((h) =>
      h === "x-forwarded-for" ? "203.0.113.9, 10.0.0.1" : null,
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("jatuh ke x-real-ip bila xff tidak ada", () => {
    const ip = clientIpFromHeaders((h) => (h === "x-real-ip" ? "198.51.100.7" : null));
    expect(ip).toBe("198.51.100.7");
  });

  it("memakai 'unknown' bila tak ada header sama sekali", () => {
    expect(clientIpFromHeaders(() => null)).toBe("unknown");
  });
});

describe("rateLimitHeaders", () => {
  it("menyertakan limit/remaining/reset, dan Retry-After saat ditolak", () => {
    const allowed = rateLimitHeaders({
      allowed: true,
      remaining: 5,
      limit: 10,
      retryAfterSeconds: 0,
      resetAt: T0 + WINDOW,
    });
    expect(allowed["X-RateLimit-Remaining"]).toBe("5");
    expect(allowed["Retry-After"]).toBeUndefined();

    const denied = rateLimitHeaders({
      allowed: false,
      remaining: 0,
      limit: 10,
      retryAfterSeconds: 42,
      resetAt: T0 + WINDOW,
    });
    expect(denied["Retry-After"]).toBe("42");
  });
});

describe("RATE_LIMITS", () => {
  it("semua kebijakan punya limit & window positif", () => {
    for (const policy of Object.values(RATE_LIMITS)) {
      expect(policy.limit).toBeGreaterThan(0);
      expect(policy.windowMs).toBeGreaterThan(0);
    }
  });

  it("passwordChange ada, 5 / 10 menit, lebih ketat dari credentials", () => {
    expect(RATE_LIMITS.passwordChange.limit).toBe(5);
    expect(RATE_LIMITS.passwordChange.windowMs).toBe(10 * 60_000);
    expect(RATE_LIMITS.passwordChange.limit).toBeLessThan(
      RATE_LIMITS.credentials.limit,
    );
  });

  it("credentialsVerify ada, 12 / 10 menit, cegah banjir uji koneksi", () => {
    expect(RATE_LIMITS.credentialsVerify.limit).toBe(12);
    expect(RATE_LIMITS.credentialsVerify.windowMs).toBe(10 * 60_000);
    // Lebih longgar dari credentialsLogin (tombol uji boleh diklik beberapa
    // kali) tetapi tetap dibatasi karena tiap panggilan menyentuh portal.
    expect(RATE_LIMITS.credentialsVerify.limit).toBeGreaterThan(
      RATE_LIMITS.credentialsLogin.limit,
    );
  });

  it("register ada, 5 / 10 menit, jendela pendek (bukan 1 jam)", () => {
    expect(RATE_LIMITS.register.limit).toBe(5);
    expect(RATE_LIMITS.register.windowMs).toBe(10 * 60_000);
    // Jendela sengaja pendek: pengguna yang salah ketik / ganti email tidak
    // perlu menunggu hampir sejam. Kunci agar tidak diam-diam dikembalikan ke
    // 1 jam, yang akan membuat pendaftaran terasa "macet" tanpa alasan.
    expect(RATE_LIMITS.register.windowMs).toBeLessThan(60 * 60_000);
    // Tetap lebih ketat dari reportDraft supaya tidak jadi jalur termurah
    // untuk membuat akun massal dari satu IP.
    expect(RATE_LIMITS.register.windowMs).toBeGreaterThanOrEqual(
      RATE_LIMITS.reportDraft.windowMs,
    );
  });
});
