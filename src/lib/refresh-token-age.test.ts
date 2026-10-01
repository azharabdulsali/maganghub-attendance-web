// src/lib/refresh-token-age.test.ts: uji MURNI pembacaan umur refresh token.
//
// Tidak menyentuh Prisma/env: seluruh fungsi di sini murni (hanya baca string
// JWT yang sudah tersedia). Token uji dibangun dari base64url polos supaya
// tidak bergantung pada library JWT mana pun.

import { describe, it, expect } from "vitest";

import {
  REFRESH_EXPIRY_WARNING_MS,
  refreshTokenExpiresAt,
  isRefreshTokenNearingExpiry,
  daysUntilRefreshExpiry,
} from "./refresh-token-age";

/** Bangun JWT tiruan (header.payload.signature) dari objek klaim. */
function makeJwt(claims: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.sig`;
}

describe("refreshTokenExpiresAt", () => {
  it("membaca klaim exp (detik Unix) menjadi Date", () => {
    const exp = 1_800_000_000; // detik
    const token = makeJwt({ exp, iat: exp - 2592000 });
    const at = refreshTokenExpiresAt(token);
    expect(at).not.toBeNull();
    expect(at!.getTime()).toBe(exp * 1000);
  });

  it("tanpa klaim exp → null (jangan menebak)", () => {
    expect(refreshTokenExpiresAt(makeJwt({ sub: "x" }))).toBeNull();
  });

  it("exp bukan angka → null", () => {
    expect(refreshTokenExpiresAt(makeJwt({ exp: "123" }))).toBeNull();
  });

  it("bukan JWT (2 bagian) → null", () => {
    expect(refreshTokenExpiresAt("bukan.jwt")).toBeNull();
  });

  it("payload bukan JSON objek → null", () => {
    const bad = `a.${Buffer.from("[1,2,3]").toString("base64url")}.c`;
    expect(refreshTokenExpiresAt(bad)).toBeNull();
  });

  it("string kosong → null", () => {
    expect(refreshTokenExpiresAt("")).toBeNull();
    expect(refreshTokenExpiresAt("   ")).toBeNull();
  });

  it("NaN/Infinity tidak lolos (exp tak terbatas) → null", () => {
    // JSON tidak bisa memuat Infinity secara langsung; uji nilai besar tak wajar
    // yang tetap numerik adalah sah, jadi hanya pastikan non-numerik tertolak.
    expect(refreshTokenExpiresAt(makeJwt({ exp: null }))).toBeNull();
  });
});

describe("isRefreshTokenNearingExpiry", () => {
  const now = 1_800_000_000_000; // ms

  it("token tersisa 3 hari → true (di bawah ambang 7 hari)", () => {
    const at = new Date(now + 3 * 24 * 60 * 60 * 1000);
    expect(isRefreshTokenNearingExpiry(at, now)).toBe(true);
  });

  it("token tersisa 20 hari → false (masih jauh)", () => {
    const at = new Date(now + 20 * 24 * 60 * 60 * 1000);
    expect(isRefreshTokenNearingExpiry(at, now)).toBe(false);
  });

  it("token sudah lewat → false (itu ranah SESSION_DEAD, bukan pengingat)", () => {
    const at = new Date(now - 1000);
    expect(isRefreshTokenNearingExpiry(at, now)).toBe(false);
  });

  it("null → false, tidak ada peringatan palsu", () => {
    expect(isRefreshTokenNearingExpiry(null, now)).toBe(false);
    expect(isRefreshTokenNearingExpiry(undefined, now)).toBe(false);
  });

  it("tepat di ambang 7 hari → true (<=)", () => {
    const at = new Date(now + REFRESH_EXPIRY_WARNING_MS);
    expect(isRefreshTokenNearingExpiry(at, now)).toBe(true);
  });
});

describe("daysUntilRefreshExpiry", () => {
  const now = 1_800_000_000_000;

  it("membulatkan ke atas (sisa 1,5 hari → 2)", () => {
    const at = new Date(now + 1.5 * 24 * 60 * 60 * 1000);
    expect(daysUntilRefreshExpiry(at, now)).toBe(2);
  });

  it("sudah lewat → 0", () => {
    expect(daysUntilRefreshExpiry(new Date(now - 5000), now)).toBe(0);
  });

  it("null → null", () => {
    expect(daysUntilRefreshExpiry(null, now)).toBeNull();
  });
});
