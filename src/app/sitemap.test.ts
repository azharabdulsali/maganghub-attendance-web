// src/app/sitemap.test.ts: mengunci agar setiap artikel panduan muncul di peta
// situs. Kesalahan yang paling mudah terjadi adalah menambah artikel baru lalu
// lupa mendaftarkannya, sehingga tulisan yang sudah susah payah dibuat tidak
// pernah ditemukan mesin pencari. Tes ini menangkap kelalaian itu.
//
// sitemap.ts mengimpor site.ts, yang memvalidasi env saat diimpor, jadi
// variabel tiruan disiapkan sebelum impor dinamis (pola sama site.test.ts).

import { describe, it, expect, beforeAll } from "vitest";

type SitemapModule = typeof import("./sitemap");

let sitemap: SitemapModule;
let guideSlugs: readonly string[];

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.DIRECT_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.NEXTAUTH_SECRET = "a".repeat(32);
  process.env.NEXTAUTH_URL = "https://contoh.test";
  process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
  delete process.env.ADMIN_EMAIL;

  sitemap = await import("./sitemap");
  guideSlugs = (await import("@/lib/guides")).GUIDE_SLUGS;
});

describe("sitemap", () => {
  it("memuat halaman publik utama", () => {
    const url = sitemap.default().map((e) => e.url);
    for (const path of ["/", "/docs", "/panduan", "/privacy", "/terms"]) {
      expect(url).toContain(`https://contoh.test${path}`);
    }
  });

  it("mendaftarkan setiap artikel panduan, tanpa terkecuali", () => {
    const url = sitemap.default().map((e) => e.url);
    expect(guideSlugs.length).toBeGreaterThanOrEqual(3);
    for (const slug of guideSlugs) {
      expect(url).toContain(`https://contoh.test/panduan/${slug}`);
    }
  });

  it("memakai URL absolut dan tidak pernah duplikat", () => {
    const url = sitemap.default().map((e) => e.url);
    for (const u of url) expect(u.startsWith("https://")).toBe(true);
    expect(new Set(url).size).toBe(url.length);
  });
});
