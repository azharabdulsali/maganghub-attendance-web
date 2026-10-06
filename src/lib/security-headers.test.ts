import { describe, expect, it } from "vitest";

import {
  HSTS_HEADER_VALUE,
  SECURITY_HEADERS,
  VERCEL_ANALYTICS_CONNECT_SRC,
  buildContentSecurityPolicy,
  securityHeaders,
} from "./security-headers";

describe("SECURITY_HEADERS", () => {
  it("memuat header wajib SPEC §9 poin 4", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("melarang API browser yang tidak dipakai", () => {
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("camera=()");
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("microphone=()");
  });
});

describe("buildContentSecurityPolicy", () => {
  it("memuat arahan pengaman inti", () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("mengizinkan endpoint Vercel Analytics di connect-src (kedua mode)", () => {
    // Tanpa ini, skrip Analytics terpasang tapi datanya diblokir CSP.
    for (const isDev of [true, false]) {
      const csp = buildContentSecurityPolicy(isDev);
      expect(csp).toContain(`connect-src 'self' ${VERCEL_ANALYTICS_CONNECT_SRC}`);
      expect(csp).toContain("vitals.vercel-insights.com");
    }
  });

  it("produksi memuat upgrade-insecure-requests, dev tidak", () => {
    expect(buildContentSecurityPolicy(false)).toContain(
      "upgrade-insecure-requests",
    );
    expect(buildContentSecurityPolicy(true)).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("dev mengizinkan unsafe-eval (react-refresh), produksi tidak", () => {
    expect(buildContentSecurityPolicy(true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(false)).not.toContain("'unsafe-eval'");
  });
});

describe("securityHeaders", () => {
  it("produksi menyertakan HSTS", () => {
    const headers = securityHeaders(false);
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts?.value).toBe(HSTS_HEADER_VALUE);
    expect(hsts?.value).toContain("includeSubDomains");
  });

  it("dev TIDAK menyertakan HSTS (agar localhost http tetap jalan)", () => {
    const headers = securityHeaders(true);
    expect(
      headers.find((h) => h.key === "Strict-Transport-Security"),
    ).toBeUndefined();
  });

  it("selalu menyertakan CSP di kedua mode", () => {
    for (const isDev of [true, false]) {
      const headers = securityHeaders(isDev);
      expect(
        headers.find((h) => h.key === "Content-Security-Policy"),
      ).toBeDefined();
    }
  });
});
