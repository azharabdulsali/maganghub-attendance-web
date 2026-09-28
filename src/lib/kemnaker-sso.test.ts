// src/lib/kemnaker-sso.test.ts — uji kerangka login SSO (docs/MONEV-API.md §7).
//
// Fokus utama: menegakkan JANJI KEAMANAN — password tidak boleh bocor lewat
// `JSON.stringify`, log, atau pesan hasil. Dan membuktikan gerbang opt-in
// benar-benar mencegah panggilan jaringan.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  KEMNAKER_SSO_ORIGIN,
  SsoCredentials,
  buildSsoLoginRequest,
  interpretSsoLoginResponse,
  parseOAuthCallbackParams,
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
