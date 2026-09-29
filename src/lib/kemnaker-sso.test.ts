// src/lib/kemnaker-sso.test.ts — uji kerangka login SSO (docs/MONEV-API.md §7).
//
// Fokus utama: menegakkan JANJI KEAMANAN — password tidak boleh bocor lewat
// `JSON.stringify`, log, atau pesan hasil. Dan membuktikan gerbang opt-in
// benar-benar mencegah panggilan jaringan.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  KEMNAKER_SSO_ORIGIN,
  SsoCredentials,
  buildSsoLoginRequest,
  interpretSsoLoginResponse,
  parseOAuthCallbackParams,
  extractCallbackUrl,
  isSsoAuthPageUrl,
  extractCallbackUrlFromHtml,
  describeSsoRedirectResponse,
  describeHtmlHint,
  extractCookieNames,
  catchOAuthCode,
  loginToSso,
} from "./kemnaker-sso";

const SECRET = "P@ssw0rd-rahasia-sekali";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildSsoLoginRequest (murni)", () => {
  it("menyusun POST JSON ke endpoint login SSO", () => {
    const req = buildSsoLoginRequest(new SsoCredentials("a@b.com", SECRET));
    expect(req.url).toBe(`${KEMNAKER_SSO_ORIGIN}/auth/login`);
    expect(req.method).toBe("POST");
    expect(req.contentType).toBe("application/json;charset=UTF-8");
  });

  it("body memuat username & password (memang harus dikirim)", () => {
    const req = buildSsoLoginRequest(new SsoCredentials("a@b.com", SECRET));
    const parsed = JSON.parse(req.body);
    expect(parsed.username).toBe("a@b.com");
    expect(parsed.password).toBe(SECRET);
  });
});

describe("SsoCredentials — pengaman anti-bocor", () => {
  it("JSON.stringify membuang password", () => {
    const creds = new SsoCredentials("a@b.com", SECRET);
    const json = JSON.stringify(creds);
    expect(json).not.toContain(SECRET);
    expect(json).toContain("<disembunyikan>");
    // Username boleh tampil (dipakai untuk pesan/diagnostik).
    expect(json).toContain("a@b.com");
  });

  it("template string pada objek tidak pernah memuat password", () => {
    const creds = new SsoCredentials("a@b.com", SECRET);
    const s = `creds=${JSON.stringify(creds)}`;
    expect(s.includes(SECRET)).toBe(false);
  });
});

describe("loginToSso — gerbang opt-in (TIDAK menyentuh jaringan)", () => {
  it("tanpa izin eksplisit → ERROR & fetch tidak dipanggil", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);

    const r = await loginToSso(new SsoCredentials("a@b.com", SECRET), {
      csrfToken: "csrf",
      cookies: "x=1",
      confirmLivePortalRequest: false,
    });

    expect(r.status).toBe("ERROR");
    expect(spy).not.toHaveBeenCalled();
  });

  it("izin eksplisit → mengirim POST JSON dgn csrf & tanpa log password", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            data: {
              authenticated: true,
              redirect_uri:
                "http://account.kemnaker.go.id/auth?response_type=code&state=S1",
            },
          }),
          { status: 200 },
        );
      }),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const r = await loginToSso(new SsoCredentials("a@b.com", SECRET), {
      csrfToken: "csrf-123",
      cookies: "kemnaker_ri_session=abc",
      confirmLivePortalRequest: true,
    });

    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.redirectUri).toContain("account.kemnaker.go.id/auth");
    }
    const [call] = calls;
    expect(call.url).toBe(`${KEMNAKER_SSO_ORIGIN}/auth/login`);
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-csrf-token"]).toBe("csrf-123");
    expect(headers["content-type"]).toBe("application/json;charset=UTF-8");
    // Password memang dikirim di body (harus), tapi tidak di log:
    expect(JSON.parse(call.init.body as string).password).toBe(SECRET);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("respons authenticated:true (bentuk §4.6) → OK + redirect_uri", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                authenticated: true,
                redirect_uri:
                  "http://account.kemnaker.go.id/auth?client_id=CID&response_type=code&state=S2",
              },
              meta: { hostname: "x", client_ip: "1.2.3.4" },
            }),
            { status: 200 },
          ),
      ),
    );
    const r = await loginToSso(new SsoCredentials("a@b.com", SECRET), {
      csrfToken: "c",
      cookies: "",
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.redirectUri).toContain("state=S2");
  });

  it("respons authenticated:true + set-cookie → OK menyertakan setCookies (sesi login)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { authenticated: true } }), {
            status: 200,
            headers: {
              "set-cookie": "kemnaker_ri_session=SESI-LOGIN; Path=/; HttpOnly",
            },
          }),
      ),
    );
    const r = await loginToSso(new SsoCredentials("a@b.com", SECRET), {
      csrfToken: "c",
      cookies: "kemnaker_ri_session=anon",
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.setCookies).toBeDefined();
      expect(r.setCookies?.join(";")).toContain("kemnaker_ri_session=SESI-LOGIN");
    }
  });

  it("200 tanpa authenticated:true → REJECTED (bukan OK palsu)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 })),
    );
    const r = await loginToSso(new SsoCredentials("a@b.com", SECRET), {
      csrfToken: "c",
      cookies: "",
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("REJECTED");
  });

  it("respons non-2xx → REJECTED (tidak membaca body)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 401 })),
    );
    const r = await loginToSso(new SsoCredentials("a@b.com", SECRET), {
      csrfToken: "c",
      cookies: "",
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.httpCode).toBe(401);
  });

  it("hasil ERROR tidak pernah memuat password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const r = await loginToSso(new SsoCredentials("a@b.com", SECRET), {
      csrfToken: "c",
      cookies: "",
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("ERROR");
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });
});

describe("interpretSsoLoginResponse (murni) — §4.6", () => {
  it("authenticated:true → OK dengan redirect_uri (http polos tetap diikuti)", () => {
    const r = interpretSsoLoginResponse(
      200,
      JSON.stringify({
        data: {
          authenticated: true,
          redirect_uri: "http://account.kemnaker.go.id/auth?state=S",
        },
        meta: { client_ip: "1.2.3.4" },
      }),
    );
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.redirectUri).toBe("http://account.kemnaker.go.id/auth?state=S");
    }
  });

  it("200 tanpa authenticated:true → REJECTED", () => {
    expect(interpretSsoLoginResponse(200, JSON.stringify({ data: {} })).status).toBe(
      "REJECTED",
    );
  });

  it("401 → REJECTED", () => {
    const r = interpretSsoLoginResponse(401, "bad");
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.httpCode).toBe(401);
  });

  it("body bukan JSON → REJECTED (tidak crash)", () => {
    expect(interpretSsoLoginResponse(200, "<html>").status).toBe("REJECTED");
  });
});

describe("parseOAuthCallbackParams (murni)", () => {
  it("mengambil code & state dari URL callback", () => {
    const p = parseOAuthCallbackParams(
      "https://monev.maganghub.kemnaker.go.id/sso/callback?code=ABC%201&state=XYZ",
    );
    expect(p.code).toBe("ABC 1");
    expect(p.state).toBe("XYZ");
  });

  it("URL tanpa code/state → objek kosong", () => {
    expect(parseOAuthCallbackParams("https://x/y")).toEqual({});
  });
});

describe("extractCallbackUrl & isSsoAuthPageUrl (murni)", () => {
  it("URL dengan code= → dianggap callback", () => {
    const u = "https://monev.maganghub.kemnaker.go.id/sso/callback?code=ABC&state=X";
    expect(extractCallbackUrl(u)).toBe(u);
  });

  it("URL /sso/callback → dianggap callback", () => {
    const u = "https://monev.maganghub.kemnaker.go.id/sso/callback";
    expect(extractCallbackUrl(u)).toBe(u);
  });

  it("halaman SSO /auth?... → BUKAN callback (harus diikuti dulu)", () => {
    const u =
      "http://account.kemnaker.go.id/auth?client_id=CID&response_type=code&state=X";
    expect(extractCallbackUrl(u)).toBeUndefined();
    expect(isSsoAuthPageUrl(u)).toBe(true);
  });

  it("undefined / host lain → bukan halaman SSO", () => {
    expect(isSsoAuthPageUrl(undefined)).toBe(false);
    expect(isSsoAuthPageUrl("https://example.com/auth")).toBe(false);
  });
});

describe("catchOAuthCode — GERBANG & penangkapan code (fetch di-mock)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tanpa izin → ERROR, fetch TIDAK dipanggil", async () => {
    const r = await catchOAuthCode("http://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: false,
    });
    expect(r.status).toBe("ERROR");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mengikuti halaman SSO → menangkap code dari header Location hop pertama", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location:
            "https://monev.maganghub.kemnaker.go.id/sso/callback?code=CODE-123&state=S9",
        },
      }),
    );
    const r = await catchOAuthCode("http://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.code).toBe("CODE-123");
      expect(r.state).toBe("S9");
    }
  });

  it("mengikuti RANTAI redirect (301 → 302) sampai code ditemukan", async () => {
    // Hop 1: 301 ke halaman SSO lain TANPA code (persis bukti lapangan).
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: { location: "https://account.kemnaker.go.id/dashboard" },
      }),
    );
    // Hop 2: 302 ke callback ber-code.
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location:
            "https://monev.maganghub.kemnaker.go.id/sso/callback?code=CHAIN-9&state=S2",
        },
      }),
    );
    const r = await catchOAuthCode("http://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.code).toBe("CHAIN-9");
    // Dua hop berarti fetch dipanggil dua kali.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("Location relatif di-resolve terhadap URL hop saat ini", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "/sso/callback?code=REL-1&state=S" },
      }),
    );
    const r = await catchOAuthCode("https://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.code).toBe("REL-1");
      expect(r.callbackUrl).toBe(
        "https://account.kemnaker.go.id/sso/callback?code=REL-1&state=S",
      );
    }
  });

  it("menghormati batas hop (tidak loop selamanya)", async () => {
    // Selalu 301 ke dirinya sendiri → harus berhenti di maxHops.
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 301,
        headers: { location: "https://account.kemnaker.go.id/loop" },
      }),
    );
    const r = await catchOAuthCode("http://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: true,
      maxHops: 3,
    });
    expect(r.status).toBe("ERROR");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("halaman SSO tanpa redirect code → ERROR jujur", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("<html>login</html>", { status: 200 }));
    const r = await catchOAuthCode("http://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("ERROR");
  });

  it("code di body HTML (meta refresh) saat 200 → tertangkap", async () => {
    const html =
      `<html><head><meta http-equiv="refresh" ` +
      `content="0;url=https://monev.maganghub.kemnaker.go.id/sso/callback?code=BODY-1&state=S1">` +
      `</head></html>`;
    fetchSpy.mockResolvedValueOnce(new Response(html, { status: 200 }));
    const r = await catchOAuthCode("http://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.code).toBe("BODY-1");
      expect(r.state).toBe("S1");
    }
  });

  it("meneruskan cookie yang di-set hop sebelumnya ke hop berikutnya (jar)", async () => {
    // Hop 1: 302 men-set sesi SSO + mengarah ke halaman internal.
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://account.kemnaker.go.id/authorize/step2",
          "set-cookie": "kemnaker_ri_session=SESI-ABC; Path=/; HttpOnly",
        },
      }),
    );
    // Hop 2: HANYA bila cookie diteruskan, ia mengeluarkan code di callback.
    fetchSpy.mockImplementationOnce((_url: string, init?: RequestInit) => {
      const sentCookie = (init?.headers as Record<string, string> | undefined)?.cookie;
      if (sentCookie && sentCookie.includes("kemnaker_ri_session=SESI-ABC")) {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: {
              location:
                "https://monev.maganghub.kemnaker.go.id/auth/login/callback?code=JAR-1&state=S",
            },
          }),
        );
      }
      // Tanpa cookie → SSO menganggap belum login → halaman 200 tanpa code.
      return Promise.resolve(new Response("<html>login</html>", { status: 200 }));
    });

    const r = await catchOAuthCode("http://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.code).toBe("JAR-1");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("tanpa cookie jar, hop berikutnya tak membawa cookie → tak ada code", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://account.kemnaker.go.id/authorize/step2",
          "set-cookie": "kemnaker_ri_session=SESI-ABC; Path=/",
        },
      }),
    );
    // Hop 2 selalu 200 tanpa code (persis bukti lapangan).
    fetchSpy.mockResolvedValueOnce(new Response("<html>halaman sso</html>", { status: 200 }));
    const r = await catchOAuthCode("http://account.kemnaker.go.id/auth?x=1", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("ERROR");
    if (r.status === "ERROR") {
      // Diagnostic memuat jejak dengan host tujuan + petunjuk halaman akhir.
      expect(r.message).toContain("302@account.kemnaker.go.id→account.kemnaker.go.id");
      expect(r.message).toContain("halaman akhir: body");
      expect(r.message).not.toContain("SESI-ABC");
    }
  });
});

describe("describeHtmlHint (murni, aman)", () => {
  it("mengenali form login/password tanpa membocorkan isi", () => {
    const html = `<form><input type="email" name="email"><input type="password" name="password">Rahasia!</form>`;
    const hint = describeHtmlHint(html);
    expect(hint).toContain("ada-form-password");
    expect(hint).toContain("ada-field-user");
    expect(hint).toContain("ada-<form>");
    expect(hint).toContain("byte");
    expect(hint).not.toContain("Rahasia!");
  });

  it("mengenali nuansa dashboard", () => {
    const hint = describeHtmlHint(`<html><body>Selamat datang di dashboard</body></html>`);
    expect(hint).toContain("nuansa-dashboard");
  });

  it("mengenali shell SPA (code dirakit JS, bukan redirect)", () => {
    const html =
      `<html><head><script src="/static/js/app.js"></script></head>` +
      `<body><div id="app"></div><div id="root"></div></body></html>`;
    const hint = describeHtmlHint(html);
    expect(hint).toContain("ada-<script src>");
    expect(hint).toContain("ada-mount-spa");
  });

  it("halaman tanpa penanda → label netral + panjang", () => {
    const hint = describeHtmlHint(`<html><body>...</body></html>`);
    expect(hint).toContain("tanpa-penanda-khusus");
    expect(hint).toMatch(/body \d+ byte/);
  });
});

describe("helper diagnostik & body HTML (murni)", () => {
  it("extractCallbackUrlFromHtml: meta refresh", () => {
    const html = `<meta http-equiv="refresh" content="0;url=https://x/sso/callback?code=C1&state=S">`;
    expect(extractCallbackUrlFromHtml(html)).toBe(
      "https://x/sso/callback?code=C1&state=S",
    );
  });

  it("extractCallbackUrlFromHtml: window.location di script", () => {
    const html = `<script>window.location = "https://x/sso/callback?code=C2&state=S"</script>`;
    expect(extractCallbackUrlFromHtml(html)).toBe(
      "https://x/sso/callback?code=C2&state=S",
    );
  });

  it("extractCallbackUrlFromHtml: &amp; dinormalkan", () => {
    const html = `<a href="/sso/callback?code=C3&amp;state=S">lanjut</a>`;
    expect(extractCallbackUrlFromHtml(html)).toBe("/sso/callback?code=C3&state=S");
  });

  it("extractCallbackUrlFromHtml: tanpa code → undefined", () => {
    expect(extractCallbackUrlFromHtml("<html>halaman login</html>")).toBeUndefined();
    expect(extractCallbackUrlFromHtml("")).toBeUndefined();
  });

  it("extractCookieNames: hanya nama, nilai dibuang", () => {
    expect(
      extractCookieNames([
        "acw_tc=abc; Path=/",
        "monev_refresh_token=RAHASIA; HttpOnly",
      ]),
    ).toEqual(["acw_tc", "monev_refresh_token"]);
  });

  it("describeSsoRedirectResponse: ringkas status, host, ada/tidak code", () => {
    const s = describeSsoRedirectResponse({
      status: 302,
      location: "https://monev.maganghub.kemnaker.go.id/sso/callback?code=X",
      cookieNames: ["acw_tc"],
    });
    expect(s).toContain("HTTP 302");
    expect(s).toContain("monev.maganghub.kemnaker.go.id");
    expect(s).toContain("mengandung 'code'");
    expect(s).toContain("acw_tc");

    const noLoc = describeSsoRedirectResponse({ status: 200, cookieNames: [] });
    expect(noLoc).toContain("Location: (tidak ada)");
    expect(noLoc).toContain("set-cookie: (tidak ada)");
  });
});
