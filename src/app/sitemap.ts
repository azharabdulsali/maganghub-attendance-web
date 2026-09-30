// src/app/sitemap.ts: peta situs XML.
//
// Hanya URL publik yang boleh diindeks dan kanonik (audit T-2). Halaman
// terlindungi tidak pernah masuk sini: isinya berupa cangkang yang memantul
// ke /login, jadi tidak layak diindeks. Karena situs ini baru punya dua
// halaman publik, peta ini sengaja statis, bukan hasil query database.

import type { MetadataRoute } from "next";

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
