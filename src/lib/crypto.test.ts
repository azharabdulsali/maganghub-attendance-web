// src/lib/crypto.test.ts
//
// Test ini sengaja TIDAK memakai .env.local sungguhan: nilainya tiruan, jadi
// bisa dijalankan di mesin/CI mana pun tanpa rahasia asli. Yang diuji adalah
// perilaku kriptografinya, bukan isi kunci tertentu.
//
// env.ts memvalidasi process.env saat diimpor, jadi variabel harus disiapkan
// SEBELUM modul crypto diimpor (karena itu import-nya dinamis di dalam
// beforeAll).

import { describe, it, expect, beforeAll } from "vitest";

type CryptoModule = typeof import("./crypto");
let crypto: CryptoModule;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.DIRECT_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.NEXTAUTH_SECRET = "a".repeat(32);
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4); // 64 hex char
  delete process.env.ADMIN_EMAIL;

  crypto = await import("./crypto");
});

describe("encrypt / decrypt", () => {
  it("mengembalikan teks yang sama (round-trip)", () => {
    const rahasia = "PasswordMonev!2026";
    const hasil = crypto.decrypt(crypto.encrypt(rahasia));
    expect(hasil).toBe(rahasia);
  });

  it("mendukung karakter non-ASCII dan teks panjang", () => {
    const rahasia = "Kata sandi — ünïcödé 🔐 ".repeat(20);
    expect(crypto.decrypt(crypto.encrypt(rahasia))).toBe(rahasia);
  });

  it("mendukung teks kosong", () => {
    expect(crypto.decrypt(crypto.encrypt(""))).toBe("");
  });

  it("memakai IV berbeda setiap kali (wajib untuk GCM)", () => {
    const a = crypto.encrypt("sama");
    const b = crypto.encrypt("sama");
    expect(a.iv).not.toBe(b.iv);
    // Karena IV berbeda, ciphertext-nya pun harus berbeda.
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("menghasilkan ciphertext yang tidak memuat teks aslinya", () => {
    const rahasia = "JanganSampaiTerlihat";
    const { ciphertext } = crypto.encrypt(rahasia);
    expect(ciphertext).not.toContain(rahasia);
    expect(Buffer.from(ciphertext, "base64").toString("utf8")).not.toContain(
      rahasia,
    );
  });

  it("TIDAK bisa didekripsi kalau ciphertext diubah (anti-tamper)", () => {
    const { ciphertext, iv, authTag } = crypto.encrypt("rahasia asli");
    const rusak = Buffer.from(ciphertext, "base64");
    rusak[0] ^= 0xff; // balik satu byte

    expect(() =>
      crypto.decrypt({
        ciphertext: rusak.toString("base64"),
        iv,
        authTag,
      }),
    ).toThrow();
  });

  it("TIDAK bisa didekripsi kalau authTag diubah (anti-tamper)", () => {
    const { ciphertext, iv, authTag } = crypto.encrypt("rahasia asli");
    const rusak = Buffer.from(authTag, "base64");
    rusak[0] ^= 0xff;

    expect(() =>
      crypto.decrypt({ ciphertext, iv, authTag: rusak.toString("base64") }),
    ).toThrow();
  });

  it("TIDAK bisa didekripsi dengan kunci yang berbeda", async () => {
    const tersandi = crypto.encrypt("rahasia asli");

    // Muat ulang modul dengan kunci lain untuk meniru "kunci salah".
    const lain = "f".repeat(64);
    const simpan = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = lain;

    // Hapus cache modul agar env dibaca ulang.
    const { vi } = await import("vitest");
    vi.resetModules();
    const cryptoLain = await import("./crypto");

    expect(() => cryptoLain.decrypt(tersandi)).toThrow();

    process.env.ENCRYPTION_KEY = simpan;
    vi.resetModules();
  });
});

describe("safeEqual", () => {
  it("true untuk teks identik", () => {
    expect(crypto.safeEqual("abc123", "abc123")).toBe(true);
  });

  it("false untuk teks berbeda dengan panjang sama", () => {
    expect(crypto.safeEqual("abc123", "abc124")).toBe(false);
  });

  it("false untuk panjang berbeda (tanpa melempar error)", () => {
    expect(crypto.safeEqual("pendek", "jauh lebih panjang")).toBe(false);
  });
});

describe("konstanta kriptografi", () => {
  it("memakai AES-256-GCM dan IV 12 byte", () => {
    expect(crypto.CRYPTO_CONSTANTS.ALGORITHM).toBe("aes-256-gcm");
    expect(crypto.CRYPTO_CONSTANTS.IV_BYTES).toBe(12);
    expect(crypto.CRYPTO_CONSTANTS.AUTH_TAG_BYTES).toBe(16);
  });

  it("IV yang dihasilkan tepat 12 byte", () => {
    const { iv } = crypto.encrypt("x");
    expect(Buffer.from(iv, "base64")).toHaveLength(12);
  });

  it("auth tag tepat 16 byte", () => {
    const { authTag } = crypto.encrypt("x");
    expect(Buffer.from(authTag, "base64")).toHaveLength(16);
  });
});
