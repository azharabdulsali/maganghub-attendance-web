// src/lib/guides.test.ts: uji data artikel panduan (audit C-1).
//
// Yang diuji di sini adalah INVARIAN yang menjaga SEO tetap benar, bukan
// isi kalimatnya. Alasannya: isi bisa berubah kapan saja, tetapi aturan
// berikut tidak boleh pernah dilanggar, karena kalau dilanggar halaman bisa
// gagal diindeks atau schema jadi tidak valid.

import { describe, expect, it } from "vitest";

import {
  GUIDES,
  GUIDE_SLUGS,
  formatTanggalIndo,
  getGuide,
  guideJsonLd,
  guideLain,
} from "./guides";

/** Origin tiruan; fungsinya murni jadi tidak perlu env aplikasi. */
const SITUS = "https://contoh.test";
const NAMA = "MagangHub";

describe("GUIDES, data artikel panduan", () => {
  it("memuat minimal tiga artikel", () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(3);
  });

  it("slug unik, huruf kecil, dan ramah URL", () => {
    const slug = GUIDES.map((g) => g.slug);
    expect(new Set(slug).size).toBe(slug.length);
    for (const s of slug) {
      expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("ringkas cukup pendek untuk meta description (<= 155 karakter)", () => {
    for (const g of GUIDES) {
      expect(g.ringkas.length).toBeLessThanOrEqual(155);
    }
  });

  it("tanggal terbit berbentuk ISO YYYY-MM-DD dan valid", () => {
    for (const g of GUIDES) {
      expect(g.terbit).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(g.terbit).getTime())).toBe(false);
    }
  });

  it("setiap artikel punya id section yang unik", () => {
    for (const g of GUIDES) {
      const id = g.section.map((s) => s.id);
      expect(new Set(id).size).toBe(id.length);
      expect(g.section.length).toBeGreaterThan(0);
    }
  });

  it("setiap artikel menyebut minimal satu kata kunci pencarian", () => {
    for (const g of GUIDES) {
      expect(g.kataKunci.length).toBeGreaterThan(0);
    }
  });

  it("setiap blok gambar punya alt, dimensi positif, dan path /panduan/", () => {
    let jumlahGambar = 0;
    for (const g of GUIDES) {
      for (const s of g.section) {
        for (const b of s.blok) {
          if (b.jenis !== "gambar") continue;
          jumlahGambar += 1;
          // alt wajib: tanpa itu pembaca layar dan mesin pencari tidak tahu isi.
          expect(b.alt.trim().length).toBeGreaterThan(0);
          // Hanya aset lokal di /public; URL luar akan bocor & tak terverifikasi.
          expect(b.src).toMatch(/^\/panduan\/[a-z0-9-]+\.(?:png|webp)$/);
          // Dimensi positif menjamin next/image menahan tata letak.
          expect(b.lebar).toBeGreaterThan(0);
          expect(b.tinggi).toBeGreaterThan(0);
        }
      }
    }
    expect(jumlahGambar).toBeGreaterThan(0);
  });
});

describe("getGuide / guideLain", () => {
  it("getGuide menemukan artikel berdasarkan slug", () => {
    expect(getGuide(GUIDE_SLUGS[0])?.slug).toBe(GUIDE_SLUGS[0]);
  });

  it("getGuide mengembalikan undefined untuk slug tak dikenal", () => {
    expect(getGuide("tidak-ada")).toBeUndefined();
  });

  it("guideLain tidak pernah menyertakan artikel yang sedang dibuka", () => {
    for (const g of GUIDES) {
      const lain = guideLain(g.slug);
      expect(lain.some((x) => x.slug === g.slug)).toBe(false);
      expect(lain.length).toBe(GUIDES.length - 1);
    }
  });
});

describe("guideJsonLd", () => {
  it("selalu menghasilkan Article dengan URL kanonik yang benar", () => {
    for (const g of GUIDES) {
      const ld = guideJsonLd(g, SITUS, NAMA);
      expect(ld["@type"]).toBeDefined();
      expect(String(ld.mainEntityOfPage)).toBe(`${SITUS}/panduan/${g.slug}`);
      expect(ld.datePublished).toBe(g.terbit);
      expect(ld.inLanguage).toBe("id-ID");
    }
  });

  it("artikel ber-howTo menghasilkan langkah HowTo yang berurutan", () => {
    const withHowTo = GUIDES.filter((g) => g.howTo);
    expect(withHowTo.length).toBeGreaterThan(0);
    for (const g of withHowTo) {
      const ld = guideJsonLd(g, SITUS, NAMA);
      expect(Array.isArray(ld["@type"])).toBe(true);
      const step = ld.step as Array<Record<string, unknown>>;
      expect(step.length).toBeGreaterThanOrEqual(2);
      // Posisi harus 1..N berurutan tanpa lompatan.
      expect(step.map((s) => s.position)).toEqual(
        step.map((_, i) => i + 1),
      );
    }
  });

  it("artikel tanpa howTo dirender sebagai Article biasa", () => {
    const tanpa = GUIDES.filter((g) => !g.howTo);
    for (const g of tanpa) {
      const ld = guideJsonLd(g, SITUS, NAMA);
      expect(ld["@type"]).toBe("Article");
      expect(ld.step).toBeUndefined();
    }
  });
});

describe("formatTanggalIndo", () => {
  it("mengubah ISO menjadi tanggal Indonesia tanpa menggeser hari", () => {
    expect(formatTanggalIndo("2026-02-05")).toBe("5 Februari 2026");
    expect(formatTanggalIndo("2026-12-31")).toBe("31 Desember 2026");
  });
});
