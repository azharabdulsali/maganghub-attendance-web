// src/lib/credential-session-policy.test.ts: uji aturan MURNI sesi login.
//
// Sengaja tidak menyentuh Prisma/env: bagian yang berinteraksi DB diuji lewat
// integrasi/manual, bukan di unit test tanpa database.

import { describe, it, expect } from "vitest";

import {
  ACCESS_TTL_MS,
  isAccessTokenFresh,
} from "./credential-session-policy";

describe("ACCESS_TTL_MS", () => {
  it("bernilai 6 jam sesuai dokumentasi §4.0", () => {
    expect(ACCESS_TTL_MS).toBe(6 * 60 * 60 * 1000);
  });
});

describe("isAccessTokenFresh", () => {
  it("token yang baru disimpan (6 jam) masih segar", () => {
    const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
    expect(isAccessTokenFresh(expiresAt)).toBe(true);
  });

  it("token yang sudah kedaluwarsa TIDAK segar", () => {
    const expiresAt = new Date(Date.now() - 1000);
    expect(isAccessTokenFresh(expiresAt)).toBe(false);
  });

  it("token yang tinggal < 1 menit dianggap tidak segar (margin aman)", () => {
    const expiresAt = new Date(Date.now() + 30_000);
    expect(isAccessTokenFresh(expiresAt)).toBe(false);
  });

  it("null/undefined → tidak segar", () => {
    expect(isAccessTokenFresh(null)).toBe(false);
    expect(isAccessTokenFresh(undefined)).toBe(false);
  });
});
