// src/lib/holidays.test.ts — uji daftar libur nasional (data murni, offline).
//
// Sengaja TIDAK menguji "tanggal X pasti libur menurut SKB" (itu data yang bisa
// berubah); yang diuji adalah INVARIAN: format tanggal sah, tak ada duplikat,
// dan fungsi pencarian bekerja seperti yang dijanjikan.

import { describe, it, expect } from "vitest";
import { LIBUR_NASIONAL, isNationalHoliday } from "./holidays";
import { isPlainDate } from "./report-policy";

describe("LIBUR_NASIONAL", () => {
  it("semua isian memakai format tanggal sah (YYYY-MM-DD)", () => {
    for (const tanggal of LIBUR_NASIONAL) {
      expect(isPlainDate(tanggal), `format salah: ${tanggal}`).toBe(true);
    }
  });

  it("tidak ada tanggal ganda", () => {
    const daftar = [...LIBUR_NASIONAL];
    expect(new Set(daftar).size).toBe(daftar.length);
  });

  it("hanya memuat tanggal yang masih relevan (>= 2026-09-30)", () => {
    // Tanggal lewat tak akan pernah dicek; menyimpannya hanya membingungkan.
    for (const tanggal of LIBUR_NASIONAL) {
      expect(
        tanggal >= "2026-09-30",
        `tanggal sudah lewat: ${tanggal}`,
      ).toBe(true);
    }
  });
});

describe("isNationalHoliday", () => {
  it("true untuk tanggal yang terdaftar", () => {
    expect(isNationalHoliday("2026-12-24")).toBe(true); // Cuti Bersama Natal
    expect(isNationalHoliday("2026-12-25")).toBe(true); // Hari Raya Natal
  });

  it("false untuk tanggal di luar daftar", () => {
    expect(isNationalHoliday("2026-09-22")).toBe(false);
    expect(isNationalHoliday("bukan-tanggal")).toBe(false);
  });

  it("false untuk libur yang sudah lewat (sudah dibuang dari daftar)", () => {
    expect(isNationalHoliday("2026-05-01")).toBe(false); // Hari Buruh 2026
  });
});

