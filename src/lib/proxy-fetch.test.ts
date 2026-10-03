// src/lib/proxy-fetch.test.ts: uji `fetchPortal` (proxy residensial opsional).
//
// Yang ditegakkan:
//   1. Tanpa `MAGANGHUB_PROXY_URL` → `fetch` biasa, TANPA `dispatcher`
//      (perilaku lama tidak boleh berubah).
//   2. Dengan env di-set → `dispatcher` diisi (objek ProxyAgent) dan URL jadi.
//   3. Nilai env tidak valid → diabaikan diam-diam (fetch biasa), jangan sampai
//      fitur inti mati karena salah ketik.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { fetchPortal, getProxyUrl, isProxyEnabled } from "./proxy-fetch";

const PROXY = "http://user:pass@proxy.example.com:8000";

describe("proxy-fetch", () => {
  const original = process.env.MAGANGHUB_PROXY_URL;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env.MAGANGHUB_PROXY_URL;
    fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original === undefined) delete process.env.MAGANGHUB_PROXY_URL;
    else process.env.MAGANGHUB_PROXY_URL = original;
  });

  it("tanpa env: fetch biasa tanpa dispatcher", async () => {
    expect(isProxyEnabled()).toBe(false);
    expect(getProxyUrl()).toBeUndefined();

    await fetchPortal("https://account.kemnaker.go.id/auth");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init).not.toHaveProperty("dispatcher");
  });

  it("dengan env: dispatcher diisi dan request diteruskan", async () => {
    process.env.MAGANGHUB_PROXY_URL = PROXY;
    expect(isProxyEnabled()).toBe(true);

    await fetchPortal("https://account.kemnaker.go.id/auth", {
      method: "POST",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit & { dispatcher?: unknown },
    ];
    expect(url).toBe("https://account.kemnaker.go.id/auth");
    expect(init).toHaveProperty("dispatcher");
    expect(init.method).toBe("POST");
  });

  it("env tidak valid: diabaikan diam-diam (fetch biasa)", async () => {
    process.env.MAGANGHUB_PROXY_URL = "bukan-url";

    expect(getProxyUrl()).toBeUndefined();
    await fetchPortal("https://account.kemnaker.go.id/auth");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init).not.toHaveProperty("dispatcher");
  });
});
