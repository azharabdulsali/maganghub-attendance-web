// src/lib/email-change-policy.test.ts — uji aturan ubah email (MURNI).
//
// Yang diuji di sini adalah bagian yang, kalau salah, langsung jadi celah
// keamanan atau data rusak:
//   - Normalisasi: satu email = satu bentuk (cegah "Budi@X.com" vs "budi@x.com").
//   - Guard eskalasi: non-admin tidak boleh mengklaim email admin.

import { describe, it, expect } from "vitest";
import { bolehUbahKeEmail, normalisasiEmail } from "./email-change-policy";

describe("normalisasiEmail", () => {
  it("memangkas spasi dan menurunkan ke huruf kecil", () => {
    expect(normalisasiEmail("  Budi.Santoso@Contoh.COM  ")).toBe(
      "budi.santoso@contoh.com",
    );
  });

  it("tidak mengubah email yang sudah bersih", () => {
    expect(normalisasiEmail("budi@contoh.com")).toBe("budi@contoh.com");
  });

  it("menghasilkan bentuk sama untuk ejaan berbeda", () => {
    expect(normalisasiEmail("BUDI@CONTOH.COM")).toBe(
      normalisasiEmail(" budi@contoh.com "),
    );
  });
});

describe("bolehUbahKeEmail — guard eskalasi peran", () => {
  it("mengizinkan USER ke email non-admin", () => {
    expect(bolehUbahKeEmail("USER", false)).toBe(true);
  });

  it("MENOLAK USER yang mencoba mengklaim email admin", () => {
    // Ini inti pencegahan eskalasi: ganti email ≠ naik jadi admin.
    expect(bolehUbahKeEmail("USER", true)).toBe(false);
  });

  it("mengizinkan ADMIN ke email admin (bisa jadi dirinya sendiri)", () => {
    expect(bolehUbahKeEmail("ADMIN", true)).toBe(true);
  });

  it("mengizinkan ADMIN ke email non-admin", () => {
    expect(bolehUbahKeEmail("ADMIN", false)).toBe(true);
  });

  it("memperlakukan peran tak dikenal sebagai non-admin (aman secara default)", () => {
    expect(bolehUbahKeEmail("SESUATU", true)).toBe(false);
  });
});