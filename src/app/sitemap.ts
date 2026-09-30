// src/app/sitemap.ts: peta situs XML.
//
// Hanya URL publik yang boleh diindeks dan kanonik (audit T-2). Halaman
// terlindungi tidak pernah masuk sini: isinya berupa cangkang yang memantul
// ke /login, jadi tidak layak diindeks.
//
// Artikel panduan (/panduan dan tiap /panduan/<slug>) didaftarkan dari sumber
// yang sama dengan halaman itu sendiri (lib/guides.ts), supaya artikel baru
// otomatis muncul di peta tanpa disentuh dua kali. Karena jumlahnya tetap
// diketahui saat build, peta ini masih sengaja statis, bukan hasil query DB.

import type { MetadataRoute } from "next";

import { GUIDES } from "@/lib/guides";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/docs`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/panduan`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...GUIDES.map((g) => ({
      url: `${SITE_URL}/panduan/${g.slug}`,
      lastModified: new Date(g.terbit),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
