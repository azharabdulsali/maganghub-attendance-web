// src/lib/monev-login.test.ts — uji orkestrasi login penuh.
//
// Fokus utama: GERBANG. Tes membuktikan bahwa tanpa `confirmLivePortalRequest:
// true`, tidak ada satu pun panggilan jaringan yang terjadi. `fetch` di-mock
// global supaya kalau gerbang bocor, tes langsung gagal (fetch tercatat).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  interpretSsoPrimeResponse,
  summarizeLoginStep,
  runLoginFlow,
  primeSsoSession,
} from "./monev-login";
import { SsoCredentials } from "./kemnaker-sso";

describe("interpretSsoPrimeResponse (murni)", () => {
  it("mengambil csrf dari header dan cookie relevan", () => {
    const r = interpretSsoPrimeResponse(200, {
      csrfToken: "tok-123",
      setCookies: [
        "kemnaker_ri_session=abc; Path=/; HttpOnly",
        "cf_clearance=xyz; Path=/",
        "acw_tc=ttt; Path=/",
        "lainnya=jangan-disertakan; Path=/",
      ],
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.csrfToken).toBe("tok-123");
      expect(r.cookies).toContain("kemnaker_ri_session=abc");
      expect(r.cookies).toContain("cf_clearance=xyz");
      expect(r.cookies).not.toContain("lainnya");
    }
  });

  it("jatuh ke cookie csrf bila header tak ada", () => {
    const r = interpretSsoPrimeResponse(200, {
      csrfToken: null,
      setCookies: ["XSRF-TOKEN=cookie-csrf; Path=/"],
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.csrfToken).toBe("cookie-csrf");
  });

  it("tanpa csrf sama sekali → ERROR jujur (bukan OK palsu)", () => {
    const r = interpretSsoPrimeResponse(200, {
      csrfToken: null,
      setCookies: ["kemnaker_ri_session=abc; Path=/"],
    });
    expect(r.status).toBe("ERROR");
  });

  it("HTTP non-2xx/3xx → ERROR", () => {
    const r = interpretSsoPrimeResponse(503, { csrfToken: "t", setCookies: [] });
    expect(r.status).toBe("ERROR");
  });
});

describe("summarizeLoginStep", () => {
  it("memberi ringkasan berbeda per langkah", () => {
    const steps = ["oauth-start", "sso-prime", "sso-login", "code-exchange"] as const;
    const seen = new Set(steps.map((s) => summarizeLoginStep(s)));
    expect(seen.size).toBe(4);
  });
});

describe("runLoginFlow — GERBANG (tanpa jaringan)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tanpa confirmLivePortalRequest → ERROR, fetch TIDAK dipanggil", async () => {
    const r = await runLoginFlow({
      credentials: new SsoCredentials("a@b.c", "rahasia"),
      confirmLivePortalRequest: false,
    });
    expect(r.status).toBe("ERROR");
    if (r.status === "ERROR") expect(r.step).toBe("oauth-start");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hasil tidak pernah memuat password", async () => {
    const r = await runLoginFlow({
      credentials: new SsoCredentials("a@b.c", "PASSWORD-RAHASIA-XYZ"),
      confirmLivePortalRequest: false,
    });
    expect(JSON.stringify(r)).not.toContain("PASSWORD-RAHASIA-XYZ");
  });
});

describe("primeSsoSession — GERBANG", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tanpa izin → ERROR, fetch TIDAK dipanggil", async () => {
    const r = await primeSsoSession({ confirmLivePortalRequest: false });
    expect(r.status).toBe("ERROR");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
