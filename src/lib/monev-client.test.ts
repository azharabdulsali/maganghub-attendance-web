// src/lib/monev-client.test.ts: uji klien Monev tanpa jaringan nyata.
//
// Yang diuji adalah KONTRAK, bukan portal: apakah kita mengirim header yang
// benar dan menafsirkan 200/401 sebagaimana docs/MONEV-API.md. Uji ini TIDAK
// menyentuh internet maupun token asli.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchBuildId,
  verifySession,
  buildCodeExchangeUrl,
  interpretCallbackResponse,
  extractRefreshTokenFromSetCookies,
  startOAuthFlow,
  exchangeCodeForSession,
  OAUTH_CALLBACK_PATH,
  KEMNAKER_OAUTH,
  MONEV_API_BASE,
  MONEV_FRONTEND_ORIGIN,
} from "./monev-client";

const BUILD_ID = "abc123def456-production";

/** Bangun Response palsu sederhana. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchBuildId, §3", () => {
  it("mengembalikan build_id dari version.json", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID }));
    await expect(fetchBuildId()).resolves.toBe(BUILD_ID);
  });

  it("menyertakan ?t=<epoch-ms> untuk menembus cache", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID }));
    await fetchBuildId();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith(`${MONEV_FRONTEND_ORIGIN}/version.json?t=`)).toBe(true);
  });

  it("melempar bila HTTP bukan 2xx", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(fetchBuildId()).rejects.toThrow(/version\.json/);
  });

  it("melempar bila build_id tidak ada", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ something: "else" }));
    await expect(fetchBuildId()).rejects.toThrow(/build_id/);
  });
});

describe("verifySession, §4.1 & §6", () => {
  it("menolak token kosong tanpa memanggil jaringan", async () => {
    const res = await verifySession("");
    expect(res.status).toBe("INVALID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("200 → ACTIVE", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    const res = await verifySession("a.b.c");
    expect(res.status).toBe("ACTIVE");
  });

  it("401 AUTHORIZATION_ERROR → INVALID", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: 401,
            error_code: "AUTHORIZATION_ERROR",
            status: "error",
            message: "Sesi masuk tidak tersedia atau tidak valid.",
          },
          401,
        ),
      );

    const res = await verifySession("a.b.c");
    expect(res.status).toBe("INVALID");
    if (res.status === "INVALID") {
      expect(res.httpCode).toBe(401);
      expect(res.errorCode).toBe("AUTHORIZATION_ERROR");
    }
  });

  it("403 Cloudflare → ERROR, bukan INVALID (jangan buang token bagus)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID }))
      .mockResolvedValueOnce(new Response("<html>challenge</html>", { status: 403 }));

    const res = await verifySession("a.b.c");
    expect(res.status).toBe("ERROR");
  });

  it("mengirim Origin, User-Agent, x-frontend-build-id, dan cookie token", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    await verifySession("JWT.PART.SIG");

    // panggilan ke-2 adalah POST /auth/refresh
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`${MONEV_API_BASE}/api/v1/auth/refresh`);
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Origin).toBe(MONEV_FRONTEND_ORIGIN);
    expect(headers["x-frontend-build-id"]).toBe(BUILD_ID);
    expect(headers.cookie).toBe("monev_refresh_token=JWT.PART.SIG");
    expect(headers["User-Agent"]).toBeTruthy();
  });

  it("buildId dari opsi dipakai tanpa memanggil version.json", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    await verifySession("a.b.c", { buildId: BUILD_ID });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["x-frontend-build-id"]).toBe(BUILD_ID);
  });

  it("error jaringan → ERROR dengan pesan, bukan lemparan", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID }))
      .mockRejectedValueOnce(new Error("ECONNRESET"));

    const res = await verifySession("a.b.c");
    expect(res.status).toBe("ERROR");
  });
});

describe("extractRefreshTokenFromSetCookies, §4.0 langkah 4", () => {
  it("mengambil nilai monev_refresh_token dari Set-Cookie", () => {
    const cookies = [
      "acw_tc=abc; Path=/",
      "monev_refresh_token=eyJhbGciOi.INITOKEN.zzz; Path=/; HttpOnly; Secure",
    ];
    expect(extractRefreshTokenFromSetCookies(cookies)).toBe(
      "eyJhbGciOi.INITOKEN.zzz",
    );
  });

  it("mengabaikan penghapusan cookie (nilai kosong)", () => {
    const cookies = ["monev_refresh_token=; Path=/; Max-Age=0"];
    expect(extractRefreshTokenFromSetCookies(cookies)).toBeUndefined();
  });

  it("mengembalikan undefined bila token tidak ada", () => {
    expect(extractRefreshTokenFromSetCookies(["acw_tc=1"])).toBeUndefined();
    expect(extractRefreshTokenFromSetCookies([])).toBeUndefined();
  });
});

describe("interpretCallbackResponse, refresh token dari Set-Cookie", () => {
  const okBody = JSON.stringify({
    access_token: "ACCESS",
    user_id: "u-1",
    name: "Budi",
  });

  it("menyertakan refreshToken bila Set-Cookie memuatnya", () => {
    const res = interpretCallbackResponse(200, okBody, [
      "monev_refresh_token=REFRESH.JWT.VAL; Path=/",
    ]);
    expect(res.status).toBe("OK");
    if (res.status === "OK") {
      expect(res.accessToken).toBe("ACCESS");
      expect(res.refreshToken).toBe("REFRESH.JWT.VAL");
    }
  });

  it("refreshToken undefined bila Set-Cookie tidak memuatnya", () => {
    const res = interpretCallbackResponse(200, okBody, ["acw_tc=1"]);
    expect(res.status).toBe("OK");
    if (res.status === "OK") {
      expect(res.refreshToken).toBeUndefined();
    }
  });
});

describe("alur OAuth code-exchange, §4.0", () => {
  it("buildCodeExchangeUrl menyusun GET callback?code=&state=", () => {
    const url = buildCodeExchangeUrl(MONEV_API_BASE, "CODE-1", "STATE-1");
    expect(url).toContain(OAUTH_CALLBACK_PATH);
    const u = new URL(url);
    expect(u.searchParams.get("code")).toBe("CODE-1");
    expect(u.searchParams.get("state")).toBe("STATE-1");
  });

  it("interpretCallbackResponse: 200 + access_token → OK (dengan user_id/name)", () => {
    const r = interpretCallbackResponse(
      200,
      JSON.stringify({ access_token: "eyJ.stub", user_id: "u-1", name: "Budi" }),
    );
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.accessToken).toBe("eyJ.stub");
      expect(r.userId).toBe("u-1");
      expect(r.name).toBe("Budi");
    }
  });

  it("interpretCallbackResponse: 200 tanpa access_token → ERROR (bukan OK palsu)", () => {
    expect(interpretCallbackResponse(200, JSON.stringify({ user_id: "u" })).status).toBe(
      "ERROR",
    );
  });

  it("interpretCallbackResponse: non-2xx → REJECTED", () => {
    const r = interpretCallbackResponse(403, "forbidden");
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.httpCode).toBe(403);
  });

  it("startOAuthFlow tanpa izin → ERROR, fetch tidak dipanggil", async () => {
    const r = await startOAuthFlow({ confirmLivePortalRequest: false });
    expect(r.status).toBe("ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("startOAuthFlow: GET /auth/login & baca state + authorizeUrl dari body (fetch di-mock)", async () => {
    const ssoUrl =
      "https://account.kemnaker.go.id/auth?client_id=79230891-cc02-43c8-964c-b525bce27857" +
      "&redirect_uri=https%3A%2F%2Fmonev.maganghub.kemnaker.go.id%2Fsso%2Fcallback" +
      "&response_type=code&scope=basic+email&state=STATE-URL";
    fetchMock.mockResolvedValueOnce(
      new Response(ssoUrl, {
        status: 200,
        headers: { "set-cookie": "monev_oauth_state=STATE-COOKIE; Path=/; HttpOnly" },
      }),
    );

    const r = await startOAuthFlow({ confirmLivePortalRequest: true });
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      // state diutamakan dari cookie
      expect(r.state).toBe("STATE-COOKIE");
      // ✅ §4.0: URL authorize ada di BODY, bukan header Location
      expect(r.authorizeUrl).toBe(ssoUrl);
    }

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${MONEV_API_BASE}/api/v1/auth/login`);
    expect((init as RequestInit).method).toBe("GET");
  });

  it("startOAuthFlow: state diambil dari URL bila cookie tidak ada", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        "https://account.kemnaker.go.id/auth?response_type=code&state=STATE-FROM-URL",
        { status: 200 },
      ),
    );
    const r = await startOAuthFlow({ confirmLivePortalRequest: true });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.state).toBe("STATE-FROM-URL");
  });

  it("KEMNAKER_OAUTH menyimpan parameter publik terverifikasi", () => {
    expect(KEMNAKER_OAUTH.responseType).toBe("code");
    expect(KEMNAKER_OAUTH.redirectUri).toContain("/sso/callback");
    expect(KEMNAKER_OAUTH.clientId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("exchangeCodeForSession tanpa izin → ERROR, fetch tidak dipanggil", async () => {
    const r = await exchangeCodeForSession("C", "S", {
      confirmLivePortalRequest: false,
    });
    expect(r.status).toBe("ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchangeCodeForSession: GET callback?code=&state= → access_token (fetch di-mock)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID })); // fetchBuildId
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "eyJ.tok", user_id: "u-1", name: "Budi" }),
    );

    const r = await exchangeCodeForSession("CODE-9", "STATE-9", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.accessToken).toBe("eyJ.tok");

    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toContain(`${MONEV_API_BASE}${OAUTH_CALLBACK_PATH}`);
    const u = new URL(String(url));
    expect(u.searchParams.get("code")).toBe("CODE-9");
    expect(u.searchParams.get("state")).toBe("STATE-9");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("exchangeCodeForSession 401 → REJECTED", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID })); // fetchBuildId
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const r = await exchangeCodeForSession("C", "S", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("REJECTED");
  });

  it("exchangeCodeForSession error jaringan → ERROR (tidak crash)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ build_id: BUILD_ID })); // fetchBuildId
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const r = await exchangeCodeForSession("C", "S", {
      confirmLivePortalRequest: true,
    });
    expect(r.status).toBe("ERROR");
  });
});
