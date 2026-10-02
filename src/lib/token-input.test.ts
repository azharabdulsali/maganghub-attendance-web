// src/lib/token-input.test.ts: uji pembersih & pemeriksa tempelan token.
//
// Yang diuji adalah INVARIAN yang melindungi pengguna dari kesalahan tempel
// yang paling sering, bukan kalimatnya. Tiap kasus di sini berasal dari
// kesalahan nyata yang bisa dilakukan pengguna di DevTools.

import { describe, expect, it } from "vitest";

import {
  cleanPastedToken,
  describeTokenShapeProblem,
  looksLikeRefreshToken,
  looksUrlEncoded,
} from "./token-input";

/** Token JWT tiruan (bukan rahasia): tiga bagian base64url. */
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln";

describe("cleanPastedToken", () => {
  it("nilai bersih dikembalikan apa adanya, cleaned=false", () => {
    expect(cleanPastedToken(JWT)).toEqual({ value: JWT, cleaned: false });
  });

  it("memangkas spasi & baris baru di ujung", () => {
    expect(cleanPastedToken(`  ${JWT}\n`)).toEqual({
      value: JWT,
      cleaned: false, // trim menghasilkan teks yang sama setelah dinormalkan
    });
  });

  it("membuang nama cookie 'monev_refresh_token=' yang ikut tersalin", () => {
    const r = cleanPastedToken(`monev_refresh_token=${JWT}`);
    expect(r.value).toBe(JWT);
    expect(r.cleaned).toBe(true);
  });

  it("membuang awalan 'Cookie: ' lalu nama cookie", () => {
    const r = cleanPastedToken(`Cookie: monev_refresh_token=${JWT}`);
    expect(r.value).toBe(JWT);
    expect(r.cleaned).toBe(true);
  });

  it("membuang awalan 'Set-Cookie: ' tanpa peduli huruf besar/kecil", () => {
    const r = cleanPastedToken(`set-cookie: monev_refresh_token=${JWT}`);
    expect(r.value).toBe(JWT);
  });

  it("membuang tanda kutip pembungkus", () => {
    const r = cleanPastedToken(`"${JWT}"`);
    expect(r.value).toBe(JWT);
    expect(r.cleaned).toBe(true);
  });

  it("tidak menyentuh titik di dalam nilai token", () => {
    // Nama cookie dibuang HANYA di awal; titik pemisah JWT tetap utuh.
    expect(cleanPastedToken(`monev_refresh_token=${JWT}`).value).toBe(JWT);
  });

  it("string kosong → value kosong", () => {
    expect(cleanPastedToken("   ").value).toBe("");
  });
});

describe("looksLikeRefreshToken", () => {
  it("menerima JWT tiga bagian base64url", () => {
    expect(looksLikeRefreshToken(JWT)).toBe(true);
  });

  it("menolak yang bukan tiga bagian", () => {
    expect(looksLikeRefreshToken("hanya-satu")).toBe(false);
    expect(looksLikeRefreshToken("dua.bagian")).toBe(false);
  });

  it("menolak karakter di luar base64url (mis. spasi)", () => {
    expect(looksLikeRefreshToken("aaa.bbb ccc.ddd")).toBe(false);
  });
});

describe("looksUrlEncoded", () => {
  it("mendeteksi sisa persen-hex", () => {
    expect(looksUrlEncoded("abc%2Edef")).toBe(true);
  });

  it("JWT base64url normal tidak dianggap ter-encode", () => {
    expect(looksUrlEncoded(JWT)).toBe(false);
  });
});

describe("describeTokenShapeProblem", () => {
  it("kosong → minta mengisi", () => {
    expect(describeTokenShapeProblem("  ")).toMatch(/belum diisi/i);
  });

  it("JWT sah → null (serahkan ke server)", () => {
    expect(describeTokenShapeProblem(JWT)).toBeNull();
  });

  it("satu bagian → beri tahu token punya tiga bagian", () => {
    expect(describeTokenShapeProblem("hanya-satu-bagian")).toMatch(
      /tiga bagian/i,
    );
  });

  it("dua bagian → sebut jumlah yang ditemukan", () => {
    const msg = describeTokenShapeProblem("aaa.bbb");
    expect(msg).toMatch(/2 bagian/i);
  });

  it("URL-encoded → arahkan centang Show URL-decoded", () => {
    expect(describeTokenShapeProblem("aaa.bbb%2Eccc")).toMatch(
      /URL-decoded/i,
    );
  });

  it("tiga bagian tapi ada spasi → minta salin ulang", () => {
    expect(describeTokenShapeProblem("aaa.bbb ccc.ddd")).toMatch(
      /salin ulang/i,
    );
  });
});
