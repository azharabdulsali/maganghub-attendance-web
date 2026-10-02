// src/lib/monev-login.test.ts: uji orkestrasi login penuh.
//
// Fokus utama: GERBANG. Tes membuktikan bahwa tanpa `confirmLivePortalRequest:
// true`, tidak ada satu pun panggilan jaringan yang terjadi. `fetch` di-mock
// global supaya kalau gerbang bocor, tes langsung gagal (fetch tercatat).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  interpretSsoPrimeResponse,
  diagnosePrimeRejection,
  classifyPrimeRejection,
  extractCsrfTokenFromHtml,
  summarizeLoginStep,
  describeLoginErrorForUser,
  mergeCookieHeader,
  runLoginFlow,
  primeSsoSession,
} from "./monev-login";
import { SsoCredentials } from "./kemnaker-sso";

describe("mergeCookieHeader (murni)", () => {
  it("menggabungkan cookie priming + cookie login", () => {
    const r = mergeCookieHeader("acw_tc=1; kemnaker_ri_session=anon", [
      "kemnaker_ri_session=SESI-LOGIN; Path=/; HttpOnly",
    ]);
    expect(r).toContain("acw_tc=1");
    // Cookie login menang atas nama yang sama (paling baru).
    expect(r).toContain("kemnaker_ri_session=SESI-LOGIN");
    expect(r).not.toContain("anon");
    expect(r).not.toContain("Path");
  });

  it("tanpa sumber apa pun → undefined", () => {
    expect(mergeCookieHeader(undefined, undefined)).toBeUndefined();
    expect(mergeCookieHeader("", [])).toBeUndefined();
  });

  it("hanya cookie login → tetap valid", () => {
    expect(mergeCookieHeader(undefined, ["sesi=A; Path=/"])).toBe("sesi=A");
  });
});

describe("extractCsrfTokenFromHtml (murni)", () => {
  it("mengambil dari <meta name='csrf-token' content='...'>", () => {
    const html = `<html><head><meta name="csrf-token" content="META-TOKEN-123"></head></html>`;
    expect(extractCsrfTokenFromHtml(html)).toBe("META-TOKEN-123");
  });

  it("meta dengan urutan atribut terbalik tetap terbaca", () => {
    const html = `<meta content="REV-TOKEN" name="csrf-token">`;
    expect(extractCsrfTokenFromHtml(html)).toBe("REV-TOKEN");
  });

  it("mengambil dari <input hidden name='_csrf' value='...'>", () => {
    const html = `<form><input type="hidden" name="_csrf" value="INPUT-TOKEN"></form>`;
    expect(extractCsrfTokenFromHtml(html)).toBe("INPUT-TOKEN");
  });

  it("mengambil dari state JS  csrfToken = \"...\"", () => {
    const html = `<script>window.csrfToken = "JS-TOKEN-ABCDEF";</script>`;
    expect(extractCsrfTokenFromHtml(html)).toBe("JS-TOKEN-ABCDEF");
  });

  it("HTML tanpa token → undefined (bukan string kosong)", () => {
    expect(extractCsrfTokenFromHtml("<html><body>halo</body></html>")).toBeUndefined();
    expect(extractCsrfTokenFromHtml("")).toBeUndefined();
  });
});

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

  it("jatuh ke HTML body bila header & cookie tak ada", () => {
    const r = interpretSsoPrimeResponse(200, {
      csrfToken: null,
      setCookies: ["kemnaker_ri_session=abc; Path=/"],
      html: `<html><head><meta name="csrf-token" content="DARI-HTML"></head></html>`,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.csrfToken).toBe("DARI-HTML");
  });

  it("header menang atas HTML bila keduanya ada", () => {
    const r = interpretSsoPrimeResponse(200, {
      csrfToken: "DARI-HEADER",
      setCookies: [],
      html: `<meta name="csrf-token" content="DARI-HTML">`,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.csrfToken).toBe("DARI-HEADER");
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

  it("403 tanpa diagnostik → pesan ramah + diagnostic teknis terpisah", () => {
    const r = interpretSsoPrimeResponse(403, { setCookies: [] });
    expect(r.status).toBe("ERROR");
    if (r.status === "ERROR") {
      // Pesan UI ramah: tanpa istilah teknis, tanpa MENYALAHKAN kredensial.
      expect(r.message).not.toMatch(/HTTP \d{3}/);
      expect(r.message).not.toMatch(/cf-mitigated|content-type|byte/i);
      // Kata "password" boleh muncul HANYA dalam penegasan "bukan ... salah".
      expect(r.message).not.toMatch(/periksa (email|password)|password salah/i);
      // Detail teknis tetap ada untuk log.
      expect(r.diagnostic).toContain("HTTP 403");
    }
  });

  it("403 + sinyal Cloudflare → pesan UI ramah, detail teknis hanya di diagnostic", () => {
    const r = interpretSsoPrimeResponse(403, {
      setCookies: [],
      diagnostics: {
        contentType: "text/html",
        server: "cloudflare",
        cfMitigated: "challenge",
        cfRay: "8a1b2c3d-FRA",
        finalUrl: "https://account.kemnaker.go.id/auth",
      },
    });
    expect(r.status).toBe("ERROR");
    if (r.status === "ERROR") {
      // UI: bahasa manusia, menegaskan bukan kredensial.
      expect(r.message).toMatch(/bukan karena/i);
      expect(r.message).not.toMatch(/HTTP \d{3}/);
      expect(r.message).not.toMatch(/cloudflare|cf-mitigated/i);
      expect(r.message).not.toMatch(/periksa (email|password)|password salah/i);
      // Diagnostic: memuat jejak teknis lengkap.
      expect(r.diagnostic).toContain("HTTP 403");
      expect(r.diagnostic).toMatch(/cloudflare/i);
      expect(r.diagnostic).toContain("cf-mitigated=challenge");
    }
  });

  it("403 tanpa sinyal Cloudflare → diagnostic menyebut WAF & authorizeUrl", () => {
    const r = interpretSsoPrimeResponse(403, {
      setCookies: [],
      diagnostics: { server: "openresty", contentType: "text/html" },
    });
    if (r.status === "ERROR") {
      expect(r.diagnostic).toMatch(/WAF/i);
      expect(r.diagnostic).toContain("authorizeUrl");
      // Pesan UI tetap bersih dari jargon WAF/authorizeUrl.
      expect(r.message).not.toMatch(/WAF|authorizeUrl/i);
    }
  });

  it("diagnostik memindai HTML jadi kategori, TIDAK membocorkan isi halaman", () => {
    const html =
      `<html><body><div id="app"></div><script src="/a.js"></script>` +
      `RAHASIA-INTERNAL-JANGAN-BOCOR</body></html>`;
    const msg = diagnosePrimeRejection(403, {
      contentType: "text/html",
      html,
    });
    expect(msg).toContain("ada-mount-spa");
    expect(msg).not.toContain("RAHASIA-INTERNAL-JANGAN-BOCOR");
  });

  it("diagnosePrimeRejection tanpa info → string kosong (tak mengubah pesan lama)", () => {
    expect(diagnosePrimeRejection(403)).toBe("");
  });

  it("meneruskan kind + httpCode pada jalur non-2xx supaya UI bisa bertindak", () => {
    const r = interpretSsoPrimeResponse(403, {
      setCookies: [],
      diagnostics: {
        server: "cloudflare",
        cfMitigated: "challenge",
        contentType: "text/html",
      },
    });
    expect(r.status).toBe("ERROR");
    if (r.status === "ERROR") {
      expect(r.httpCode).toBe(403);
      expect(r.kind).toBe("waf");
    }
  });

  it("jalur ERROR tanpa diagnostik → kind terisi unknown (bukan kosong)", () => {
    const r = interpretSsoPrimeResponse(500, { setCookies: [] });
    if (r.status === "ERROR") {
      expect(r.kind).toBe("unknown");
    }
  });
});

describe("classifyPrimeRejection (murni)", () => {
  it("Cloudflare via cf-mitigated → waf", () => {
    expect(
      classifyPrimeRejection(403, { cfMitigated: "challenge" }),
    ).toBe("waf");
  });

  it("Cloudflare via header server → waf", () => {
    expect(classifyPrimeRejection(403, { server: "cloudflare" })).toBe("waf");
  });

  it("cf-ray saja sudah cukup menandai waf", () => {
    expect(classifyPrimeRejection(403, { cfRay: "8abc-DEF" })).toBe("waf");
  });

  it("403 tanpa sinyal Cloudflare tetap waf (khas penolakan gate)", () => {
    expect(
      classifyPrimeRejection(403, { server: "openresty", contentType: "text/html" }),
    ).toBe("waf");
  });

  it("429/503 juga dianggap waf (throttle/gate)", () => {
    expect(classifyPrimeRejection(429, {})).toBe("waf");
    expect(classifyPrimeRejection(503, {})).toBe("waf");
  });

  it("HTML biasa tanpa sinyal WAF → page (bentuk halaman berubah)", () => {
    expect(classifyPrimeRejection(200, { contentType: "text/html" })).toBe(
      "page",
    );
  });

  it("tanpa diagnostik → unknown", () => {
    expect(classifyPrimeRejection(403)).toBe("unknown");
  });

  it("konsisten dengan diagnosePrimeRejection: Cloudflare ⇒ waf", () => {
    const d = { server: "cloudflare", contentType: "text/html" };
    expect(classifyPrimeRejection(403, d)).toBe("waf");
    expect(diagnosePrimeRejection(403, d)).toMatch(/cloudflare/i);
  });
});

describe("summarizeLoginStep", () => {
  it("memberi ringkasan berbeda per langkah", () => {
    const steps = ["oauth-start", "sso-prime", "sso-login", "code-exchange"] as const;
    const seen = new Set(steps.map((s) => summarizeLoginStep(s)));
    expect(seen.size).toBe(4);
  });
});

describe("describeLoginErrorForUser (murni)", () => {
  it("sso-prime + waf → menegaskan bukan kredensial, arahkan tempel token", () => {
    const msg = describeLoginErrorForUser({
      step: "sso-prime",
      kind: "waf",
      httpCode: 403,
    });
    expect(msg).toMatch(/bukan karena/i);
    expect(msg).toMatch(/tempel token/i);
    // Bahasa awam: tanpa kode HTTP, jargon header, atau nama fungsi internal.
    expect(msg).not.toMatch(/HTTP \d{3}/);
    expect(msg).not.toMatch(/cf-mitigated|cloudflare|diagnose|authorizeUrl/i);
  });

  it("403 di sso-prime diperlakukan sebagai blokir anti-bot walau kind undefined", () => {
    const msg = describeLoginErrorForUser({ step: "sso-prime", httpCode: 403 });
    expect(msg).toMatch(/anti-bot|bukan karena/i);
  });

  it("sso-prime non-waf → ajakan coba lagi, tetap tanpa jargon", () => {
    const msg = describeLoginErrorForUser({
      step: "sso-prime",
      kind: "page",
      httpCode: 200,
    });
    expect(msg).not.toMatch(/HTTP \d{3}|cf-mitigated|byte/i);
    expect(msg).toMatch(/coba lagi|tempel token/i);
  });

  it("sso-login + waf → tidak menyalahkan kredensial", () => {
    const msg = describeLoginErrorForUser({ step: "sso-login", kind: "waf" });
    expect(msg).toMatch(/bukan karena/i);
    expect(msg).not.toMatch(/periksa (email|password)|password salah/i);
  });

  it("selalu mengembalikan kalimat non-kosong untuk tiap langkah", () => {
    const steps = ["oauth-start", "sso-prime", "sso-login", "code-exchange"] as const;
    for (const step of steps) {
      const msg = describeLoginErrorForUser({ step });
      expect(msg.length).toBeGreaterThan(10);
      expect(msg).not.toMatch(/undefined|null|\[object/i);
    }
  });
});

describe("runLoginFlow, GERBANG (tanpa jaringan)", () => {
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

describe("primeSsoSession, GERBANG", () => {
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

  it("menembak authorizeUrl (bila diberi) & membaca token dari HTML", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        `<html><head><meta name="csrf-token" content="CSRF-DARI-HALAMAN"></head></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    const authorizeUrl =
      "https://account.kemnaker.go.id/auth?client_id=CID&state=S1";
    const r = await primeSsoSession({
      confirmLivePortalRequest: true,
      authorizeUrl,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.csrfToken).toBe("CSRF-DARI-HALAMAN");
    // URL yang ditembak HARUS authorizeUrl ber-query, bukan /auth polos.
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe(authorizeUrl);
  });

  it("prime mengirim header navigasi browser yang sah (sec-fetch/Sec-* /Accept-Language)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(`<meta name="csrf-token" content="C1">`, { status: 200 }),
    );
    await primeSsoSession({
      confirmLivePortalRequest: true,
      authorizeUrl: "https://account.kemnaker.go.id/auth?state=S1",
    });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    // Sinyal navigasi dokumen yang WAJIB ada agar tak dibedakan dari browser.
    expect(h["sec-fetch-dest"]).toBe("document");
    expect(h["sec-fetch-mode"]).toBe("navigate");
    expect(h["sec-fetch-site"]).toBe("cross-site");
    expect(h["Accept-Language"]).toMatch(/id-ID/);
    expect(h["upgrade-insecure-requests"]).toBe("1");
    // Referer sah dari portal Monev, bukan kosong.
    expect(h.Referer).toContain("monev.maganghub.kemnaker.go.id");
    // Redirect manual (bukan follow) supaya Set-Cookie hop 302 tak hilang.
    expect(init.redirect).toBe("manual");
  });

  it("prime mengikuti 302 MANUAL dan tetap menyimpan Set-Cookie tiap hop", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://account.kemnaker.go.id/auth?state=S1&hop=2",
            "set-cookie": "kemnaker_ri_session=SESI-1; Path=/; HttpOnly",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(`<meta name="csrf-token" content="CSRF-AKHIR">`, { status: 200 }),
      );

    const r = await primeSsoSession({
      confirmLivePortalRequest: true,
      authorizeUrl: "https://account.kemnaker.go.id/auth?state=S1",
    });

    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.csrfToken).toBe("CSRF-AKHIR");
      // Cookie dari hop 302 HILANG bila redirect:"follow" — ini regresi inti.
      expect(r.cookies).toContain("kemnaker_ri_session=SESI-1");
    }
    // Hop kedua membawa Referer = URL hop pertama (perilaku browser).
    const [, secondInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect((secondInit.headers as Record<string, string>).Referer).toBe(
      "https://account.kemnaker.go.id/auth?state=S1",
    );
  });
});

describe("runLoginFlow, alur lengkap (fetch di-mock berdasarkan URL)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  /** Rakit respons JSON login SSO yang sudah terautentikasi. */
  function jsonLogin(redirectUri: string): Response {
    return new Response(
      JSON.stringify({ data: { authenticated: true, redirect_uri: redirectUri } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mengikuti authorizeUrl (permintaan otorisasi langkah 1) untuk menangkap code", async () => {
    const authorizeUrl =
      "https://account.kemnaker.go.id/auth?client_id=CID&response_type=code&state=STATE-1";
    const ssoPage = "https://account.kemnaker.go.id/auth?client_id=CID&state=STATE-2";

    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const redirect = init?.redirect ?? "follow";
      const headers = (init?.headers ?? {}) as Record<string, string>;
      // Prime (langkah 2) datang dari portal Monev; catchOAuthCode (3b) dari SSO.
      const fromMonev = (headers.Referer ?? "").includes("monev.maganghub");

      // (4a) fetchBuildId → version.json
      if (url.includes("version.json")) {
        return new Response(JSON.stringify({ build_id: "build-1" }), { status: 200 });
      }
      // (4b) exchangeCodeForSession → callback Monev (/auth/login/callback)
      if (url.includes("/callback")) {
        return new Response(
          JSON.stringify({ access_token: "ACCESS-TOKEN-1", user_id: "u1", name: "Budi" }),
          {
            status: 201,
            headers: {
              "content-type": "application/json",
              "set-cookie": "monev_refresh_token=REFRESH-1; Path=/; HttpOnly",
            },
          },
        );
      }
      // (1) startOAuthFlow → /api/v1/auth/login (body = URL SSO; cookie = state)
      if (url.endsWith("/api/v1/auth/login")) {
        return new Response(authorizeUrl, {
          status: 201,
          headers: { "set-cookie": "monev_oauth_state=STATE-1; Path=/; HttpOnly" },
        });
      }
      // (3) loginToSso → POST /auth/login (balas JSON authenticated + redirect_uri)
      if (url.endsWith("/auth/login")) {
        return jsonLogin(ssoPage);
      }
      // (2) primeSsoSession → GET authorizeUrl (redirect manual, Referer = Monev)
      if (url.includes("state=STATE-1") && redirect === "manual" && fromMonev) {
        return new Response(`<meta name="csrf-token" content="CSRF-XYZ">`, { status: 200 });
      }
      // (3b) catchOAuthCode mengikuti authorizeUrl (redirect manual, Referer = SSO)
      // → 302 ber-code. Ini jalur UTAMA: permintaan otorisasi itulah yang
      // menerbitkan `code`.
      if (url.includes("state=STATE-1") && redirect === "manual") {
        return new Response(null, {
          status: 302,
          headers: {
            location:
              "https://monev.maganghub.kemnaker.go.id/sso/callback?code=REAL-CODE&state=STATE-1",
          },
        });
      }
      throw new Error("URL tak terduga dalam tes: " + url + " (" + method + ")");
    });

    const r = await runLoginFlow({
      credentials: new SsoCredentials("a@b.c", "RAHASIA"),
      confirmLivePortalRequest: true,
    });

    expect(r.status).toBe("SUCCESS");
    if (r.status === "SUCCESS") {
      expect(r.accessToken).toBe("ACCESS-TOKEN-1");
      expect(r.refreshToken).toBe("REFRESH-1");
    }
    // Password TIDAK boleh bocor ke hasil.
    expect(JSON.stringify(r)).not.toContain("RAHASIA");
  });

  it("bila authorizeUrl & redirect_uri dua-duanya buntu, ERROR memuat kedua jejak", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const redirect = init?.redirect ?? "follow";
      const headers = (init?.headers ?? {}) as Record<string, string>;

      // (1) startOAuthFlow → body = URL SSO (STATE-1)
      if (url.endsWith("/api/v1/auth/login")) {
        return new Response(
          "https://account.kemnaker.go.id/auth?client_id=CID&state=STATE-1",
          {
            status: 201,
            headers: { "set-cookie": "monev_oauth_state=STATE-1; Path=/; HttpOnly" },
          },
        );
      }
      // (3) loginToSso → authenticated + redirect_uri = halaman SSO
      if (url.endsWith("/auth/login")) {
        return new Response(
          JSON.stringify({
            data: {
              authenticated: true,
              redirect_uri: "http://account.kemnaker.go.id/auth?client_id=CID&state=STATE-2",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // (2) primeSsoSession → HTML csrf (Referer = Monev)
      if (
        url.includes("state=STATE-1") &&
        redirect === "manual" &&
        (headers.Referer ?? "").includes("monev.maganghub")
      ) {
        return new Response(`<meta name="csrf-token" content="CSRF-XYZ">`, { status: 200 });
      }
      // (3b) authorizeUrl diikuti → 301 TANPA code (persis bukti lapangan), + cookie
      if (url.includes("state=STATE-1") && redirect === "manual") {
        return new Response(null, {
          status: 301,
          headers: {
            location: "https://account.kemnaker.go.id/dashboard",
            "set-cookie": "kemnaker_ri_session=RAHASIA-SESI; Path=/",
          },
        });
      }
      // (3b) redirect_uri (STATE-2) juga buntu: 302 lalu 200 tanpa code
      if (url.includes("state=STATE-2")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://account.kemnaker.go.id/profil" },
        });
      }
      // Hop lanjutan kedua jalur = jalan buntu: 200 tanpa code.
      if (
        url.includes("account.kemnaker.go.id/dashboard") ||
        url.includes("account.kemnaker.go.id/profil")
      ) {
        return new Response("<html>halaman sso</html>", { status: 200 });
      }
      throw new Error("URL tak terduga dalam tes: " + url + " " + (init?.method ?? "GET"));
    });

    const r = await runLoginFlow({
      credentials: new SsoCredentials("a@b.c", "RAHASIA-PW"),
      confirmLivePortalRequest: true,
    });

    expect(r.status).toBe("ERROR");
    if (r.status === "ERROR") {
      // Kedua target harus dilaporkan, dengan jejak hop asli, tanpa nilai rahasia.
      expect(r.message).toContain("authorizeUrl(langkah 1)");
      expect(r.message).toContain("redirect_uri(langkah 3)");
      // Jejak kini menyertakan host tujuan (`→host`) pada tiap redirect.
      expect(r.message).toContain("302@account.kemnaker.go.id→");
      expect(r.message).toContain("200@account.kemnaker.go.id");
      // Nilai cookie (meski ada di hop 1) TIDAK boleh bocor.
      expect(r.message).not.toContain("RAHASIA-SESI");
      expect(r.message).not.toContain("RAHASIA-PW");
    }
  });
});
