// src/lib/monev-client.test.ts — uji klien Monev tanpa jaringan nyata.
//
// Yang diuji adalah KONTRAK, bukan portal: apakah kita mengirim header yang
// benar dan menafsirkan 200/401 sebagaimana docs/MONEV-API.md. Uji ini TIDAK
// menyentuh internet maupun token asli.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchBuildId,
  verifySession,
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

describe("fetchBuildId — §3", () => {
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

describe("verifySession — §4.1 & §6", () => {
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
