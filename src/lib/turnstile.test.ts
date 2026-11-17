// src/lib/turnstile.test.ts: uji verifikasi CAPTCHA tanpa jaringan sungguhan.

import { describe, expect, it, vi } from "vitest";

import {
  PESAN_CAPTCHA,
  TURNSTILE_TOKEN_MAX_LENGTH,
  TURNSTILE_VERIFY_URL,
  verifyTurnstileToken,
} from "./turnstile";

const SECRET = "rahasia-uji";

function jawab(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

describe("verifyTurnstileToken", () => {
  it("menolak token kosong tanpa memanggil jaringan", async () => {
    const fetchImpl = vi.fn();
    for (const token of ["", "   ", undefined, null, 123]) {
      const hasil = await verifyTurnstileToken({
        token,
        secretKey: SECRET,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(hasil).toEqual({ ok: false, kind: "missing" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("menolak token kepanjangan (batas wajar) tanpa memanggil jaringan", async () => {
    const fetchImpl = vi.fn();
    const hasil = await verifyTurnstileToken({
      token: "a".repeat(TURNSTILE_TOKEN_MAX_LENGTH + 1),
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(hasil).toEqual({ ok: false, kind: "missing" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lolos saat Cloudflare menjawab success: true", async () => {
    const fetchImpl = vi.fn(async () => jawab({ success: true }));
    const hasil = await verifyTurnstileToken({
      token: "token-sah",
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(hasil).toEqual({ ok: true });
  });

  it("mengirim secret, token, dan IP ke endpoint yang benar", async () => {
    const fetchImpl = vi.fn(async () => jawab({ success: true }));
    await verifyTurnstileToken({
      token: "token-abc",
      secretKey: SECRET,
      remoteIp: "203.0.113.9",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("token-abc");
    expect(body.get("remoteip")).toBe("203.0.113.9");
  });

  it("tidak mengirim remoteip bila tidak diketahui", async () => {
    const fetchImpl = vi.fn(async () => jawab({ success: true }));
    await verifyTurnstileToken({
      token: "token-abc",
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.body as URLSearchParams).has("remoteip")).toBe(false);
  });

  it("menolak saat Cloudflare menjawab success: false", async () => {
    const fetchImpl = vi.fn(async () => jawab({ success: false }));
    const hasil = await verifyTurnstileToken({
      token: "token-palsu",
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(hasil).toEqual({ ok: false, kind: "rejected" });
  });

  it("menolak saat jawaban bukan success: true (mis. bentuk lain)", async () => {
    const fetchImpl = vi.fn(async () => jawab({ success: "true" }));
    const hasil = await verifyTurnstileToken({
      token: "token",
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(hasil).toEqual({ ok: false, kind: "rejected" });
  });

  it("menganggap gangguan server (5xx) sebagai belum bisa diperiksa", async () => {
    const fetchImpl = vi.fn(async () => jawab({}, { ok: false, status: 503 }));
    const hasil = await verifyTurnstileToken({
      token: "token",
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(hasil).toEqual({ ok: false, kind: "unavailable" });
  });

  it("menganggap kegagalan jaringan sebagai belum bisa diperiksa, bukan lolos", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const hasil = await verifyTurnstileToken({
      token: "token",
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(hasil).toEqual({ ok: false, kind: "unavailable" });
  });

  it("menganggap body jawaban yang rusak sebagai penolakan, bukan lolos", async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("bukan JSON");
          },
        }) as unknown as Response,
    );
    const hasil = await verifyTurnstileToken({
      token: "token",
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(hasil).toEqual({ ok: false, kind: "rejected" });
  });

  it("setiap pesan kegagalan punya teks yang memberi langkah berikutnya", () => {
    for (const pesan of Object.values(PESAN_CAPTCHA)) {
      expect(pesan.length).toBeGreaterThan(20);
      expect(pesan.toLowerCase()).not.toContain("token");
      expect(pesan.toLowerCase()).not.toContain("http");
    }
  });
});
