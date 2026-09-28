// src/lib/validate.test.ts — uji skema kredensial Monev.
//
// Ini bukan test "formalitas": aturan di sini menentukan data apa yang masuk
// ke database. Terutama normalisasi email — kalau gagal, kredensial bisa
// tersimpan dengan huruf besar/kecil berbeda dan tidak cocok saat login.

import { describe, it, expect } from "vitest";
import { credentialsSchema } from "./validate";

describe("credentialsSchema — email Monev", () => {
  it("menerima email yang wajar", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(true);
  });

  it("menormalkan email ke huruf kecil", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "Budi.Santoso@Contoh.COM",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.emailMonev).toBe("budi.santoso@contoh.com");
  });

  it("memangkas spasi di awal/akhir email", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "  budi@contoh.com  ",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.emailMonev).toBe("budi@contoh.com");
  });

  it("menolak email tanpa @", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "bukan-email",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(false);
  });

  it("menolak email kosong", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(false);
  });

  it("menolak email yang terlalu panjang (>200)", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: `${"a".repeat(200)}@contoh.com`,
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(false);
  });
});

describe("credentialsSchema — password Monev", () => {
  it("menerima password 1 karakter (tidak ada aturan minimal)", () => {
    // Password Monev milik portal orang lain — kita tidak berhak memaksa
    // aturan panjang. Yang salah di sini akan ditolak saat login ke portal.
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "x",
    });
    expect(r.success).toBe(true);
  });

  it("TIDAK memangkas spasi password (spasi bisa sah)", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: " ada spasi ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.passwordMonev).toBe(" ada spasi ");
  });

  it("menerima password dengan karakter khusus & unicode", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "P@ssw0rd!#äöü🔐",
    });
    expect(r.success).toBe(true);
  });

  it("menolak password kosong", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "",
    });
    expect(r.success).toBe(false);
  });

  it("menolak password >200 karakter", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("menolak password yang bukan string (mis. angka)", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: 12345,
    });
    expect(r.success).toBe(false);
  });
});
