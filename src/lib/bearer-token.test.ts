// src/lib/bearer-token.test.ts: uji pembaca rahasia bearer (murni).

import { describe, it, expect } from "vitest";

import { bearerTokenFrom, cronKeyFromRequest } from "./bearer-token";

describe("bearerTokenFrom", () => {
  it("membaca token dari skema Bearer standar", () => {
    expect(bearerTokenFrom("Bearer rahasia123")).toBe("rahasia123");
  });

  it("tidak peka huruf besar/kecil pada skema", () => {
    expect(bearerTokenFrom("bearer abc")).toBe("abc");
    expect(bearerTokenFrom("BEARER abc")).toBe("abc");
  });

  it("memangkas spasi berlebih di sekitar token", () => {
    expect(bearerTokenFrom("Bearer   spasi   ")).toBe("spasi");
  });

  it("mengembalikan null untuk header kosong/absen/skema lain/token kosong", () => {
    expect(bearerTokenFrom(null)).toBeNull();
    expect(bearerTokenFrom("")).toBeNull();
    expect(bearerTokenFrom("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerTokenFrom("Bearer")).toBeNull();
    expect(bearerTokenFrom("Bearer    ")).toBeNull();
    // Tidak boleh "hampir cocok": "BearerX" bukan skema Bearer.
    expect(bearerTokenFrom("BearerX abc")).toBeNull();
  });
});

describe("cronKeyFromRequest", () => {
  const url = "https://contoh.test/api/cron/submit";

  it("mendahulukan header Bearer daripada query", () => {
    expect(cronKeyFromRequest("Bearer dariheader", `${url}?key=dariquery`)).toBe(
      "dariheader",
    );
  });

  it("jatuh ke ?key= bila header tidak ada (kompatibilitas mundur)", () => {
    expect(cronKeyFromRequest(null, `${url}?key=kunci-lama`)).toBe("kunci-lama");
  });

  it("mengembalikan string kosong bila tidak ada di keduanya", () => {
    expect(cronKeyFromRequest(null, url)).toBe("");
  });

  it("mengembalikan string kosong untuk URL cacat", () => {
    expect(cronKeyFromRequest(null, "bukan-url")).toBe("");
  });
});
