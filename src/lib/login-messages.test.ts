// src/lib/login-messages.test.ts: uji peta pesan login & pembaca kode error (murni).

import { describe, it, expect } from "vitest";

import {
  PESAN_CADANGAN,
  kodeErrorDari,
  pesanUntukKode,
} from "./login-messages";

describe("kodeErrorDari", () => {
  it("membaca kode dari query `?error=`", () => {
    expect(kodeErrorDari("https://app.test/login?error=CredentialsSignin")).toBe(
      "CredentialsSignin",
    );
  });

  it("membaca kode di posisi mana pun dalam query", () => {
    expect(
      kodeErrorDari("https://app.test/login?callbackUrl=%2Fdashboard&error=MissingCSRF"),
    ).toBe("MissingCSRF");
  });

  it("mendekode persen-encoding pada kode", () => {
    expect(kodeErrorDari("https://app.test/login?error=Verifikasi%20Gagal")).toBe(
      "Verifikasi Gagal",
    );
  });

  it("mengembalikan null bila tidak ada penanda error", () => {
    expect(kodeErrorDari("https://app.test/login")).toBeNull();
    expect(kodeErrorDari("https://app.test/login?registered=1")).toBeNull();
    // `error` tanpa nilai tidak dianggap penanda.
    expect(kodeErrorDari("https://app.test/login?error=")).toBeNull();
  });

  it("mengembalikan null untuk encoding cacat, bukan melempar", () => {
    expect(kodeErrorDari("https://app.test/login?error=%")).toBeNull();
  });

  it("tidak salah tangkap parameter yang mengandung 'error'", () => {
    // `?myerror=` bukan `error=`; regex memerlukan batas '?' atau '&'.
    expect(kodeErrorDari("https://app.test/login?myerror=CredentialsSignin")).toBeNull();
  });
});

describe("pesanUntukKode", () => {
  it("memetakan kode yang dikenal ke pesan spesifik", () => {
    expect(pesanUntukKode("CredentialsSignin").judul).toBe(
      "Email atau password salah",
    );
    // Kasus non-pengguna punya pesan sendiri (bukan "salah password").
    expect(pesanUntukKode("MissingCSRF").judul).toBe("Sesi login kedaluwarsa");
    expect(pesanUntukKode("Configuration").judul).toBe("Masalah konfigurasi server");
  });

  it("jatuh ke pesan cadangan untuk kode tak dikenal", () => {
    expect(pesanUntukKode("KodeAneh")).toEqual(PESAN_CADANGAN);
  });

  it("jatuh ke pesan cadangan untuk null", () => {
    expect(pesanUntukKode(null)).toEqual(PESAN_CADANGAN);
  });

  it("setiap pesan punya judul & detail tidak-kosong", () => {
    for (const kode of [
      "CredentialsSignin",
      "MissingCSRF",
      "Configuration",
      "AccessDenied",
      "Verification",
      null,
    ]) {
      const p = pesanUntukKode(kode);
      expect(p.judul.length).toBeGreaterThan(0);
      expect(p.detail.length).toBeGreaterThan(0);
    }
  });
});
