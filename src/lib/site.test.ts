// src/lib/site.test.ts
//
// Mengunci konfigurasi SEO supaya tidak diam-diam rusak. Yang diuji di sini
// adalah INVARIAN yang kalau dilanggar akan membuat rich result Google ditolak
// atau preview WhatsApp gagal, hal yang sulit terlihat di review kode biasa.
//
// env.ts memvalidasi process.env saat diimpor, jadi variabel tiruan harus
// disiapkan SEBELUM site.ts diimpor (karena itu import dinamis di beforeAll).
// Pola ini sama dengan crypto.test.ts. Nilai tiruan, bukan rahasia asli.

import { describe, it, expect, beforeAll } from "vitest";

type SiteModule = typeof import("./site");
let site: SiteModule;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.DIRECT_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.NEXTAUTH_SECRET = "a".repeat(32);
  process.env.NEXTAUTH_URL = "https://contoh.test";
  process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4); // 64 hex char
  delete process.env.ADMIN_EMAIL;

  site = await import("./site");
});

describe("konfigurasi situs", () => {
  it("SITE_URL tanpa garis miring di akhir", () => {
    expect(site.SITE_URL).toBe("https://contoh.test");
    expect(site.SITE_URL.endsWith("/")).toBe(false);
  });

  it("absoluteUrl menghasilkan URL absolut dari path relatif", () => {
    expect(site.absoluteUrl("/")).toBe("https://contoh.test/");
    expect(site.absoluteUrl("/docs")).toBe("https://contoh.test/docs");
    expect(site.absoluteUrl()).toBe("https://contoh.test/");
  });

  it("judul dan deskripsi memenuhi panjang yang disarankan mesin pencari", () => {
    // Judul kira-kira 50-60 karakter, deskripsi 120-160 karakter. Bila salah
    // satu keluar dari rentang ini, teks di hasil pencarian akan terpotong.
    expect(site.SITE_TITLE.length).toBeGreaterThanOrEqual(30);
    expect(site.SITE_TITLE.length).toBeLessThanOrEqual(65);
    expect(site.SITE_DESCRIPTION.length).toBeGreaterThanOrEqual(100);
    expect(site.SITE_DESCRIPTION.length).toBeLessThanOrEqual(165);
  });
});

describe("FAQ", () => {
  it("setiap item punya pertanyaan dan jawaban yang tidak kosong", () => {
    expect(site.FAQ_ITEMS.length).toBeGreaterThan(0);
    for (const item of site.FAQ_ITEMS) {
      expect(item.q.trim().length).toBeGreaterThan(10);
      // Jawaban minimal 80 karakter: jawaban terlalu pendek tidak layak
      // ditampilkan sebagai cuplikan dan biasanya ditolak untuk rich result.
      expect(item.a.trim().length).toBeGreaterThan(80);
      // Pertanyaan FAQ harus diakhiri tanda tanya supaya terbaca sebagai Q&A.
      expect(item.q.trim().endsWith("?")).toBe(true);
    }
  });

  it("pertanyaan tidak duplikat", () => {
    const daftar = site.FAQ_ITEMS.map((i) => i.q.trim().toLowerCase());
    expect(new Set(daftar).size).toBe(daftar.length);
  });

  it("tidak menyebut fitur yang tidak ada di aplikasi", () => {
    // Penjaga regresi: audit menemukan situs referensi menyebut AI/GitHub yang
    // TIDAK ada di proyek ini. FAQ tidak boleh menjanjikan hal itu.
    const gabungan = site.FAQ_ITEMS.map((i) => `${i.q} ${i.a}`)
      .join(" ")
      .toLowerCase();
    expect(gabungan).not.toContain("integrasi github");
    expect(gabungan).not.toContain("model ai");
    expect(gabungan).not.toContain("byok");
  });
});

describe("kontak publik", () => {
  it("CONTACT_EMAIL dan penanda placeholder konsisten", () => {
    // Penanda ini mengendalikan apakah alamat asli ditampilkan di /privacy dan
    // /terms. Kalau penanda meleset, alamat "masih placeholder" bisa tampil
    // seolah bisa dihubungi. Jadi keduanya harus selalu sinkron.
    expect(site.CONTACT_EMAIL_IS_PLACEHOLDER).toBe(
      site.CONTACT_EMAIL.startsWith("["),
    );
  });

  it("CONTACT_EMAIL terisi alamat email yang masuk akal", () => {
    // Email sudah diisi asli, jadi penanda placeholder harus false; kalau tidak,
    // halaman legal akan menyembunyikan alamat betulan di balik teks pengganti.
    expect(site.CONTACT_EMAIL_IS_PLACEHOLDER).toBe(false);
    expect(site.CONTACT_EMAIL).toMatch(/^[^\s@[\]]+@[^\s@[\]]+\.[^\s@[\]]+$/);
  });
});
