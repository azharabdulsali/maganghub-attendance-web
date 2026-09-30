// src/app/robots.ts: aturan perayapan untuk crawler.
//
// Strategi: HANYA halaman publik (/, /docs) yang boleh diindeks. Seluruh rute
// terlindungi di grup (app) sudah di-redirect ke /login oleh auth(), tetapi
// redirect itu adalah penjaga keamanan, bukan sinyal SEO. Karena itu rute
// terlindungi juga DILARANG di sini (audit T-1, T-4) supaya crawler tidak
// membuang anggaran di halaman yang selalu memantul ke login.
//
// Halaman utilitas (login/register) tidak memberi nilai pencarian, jadi
// dilarang juga. API tidak boleh dirayapi sama sekali.

import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/docs"],
      disallow: [
        "/api/",
        "/login",
        "/register",
        // Rute terlindungi (grup (app)), semuanya butuh sesi.
        "/dashboard",
        "/credentials",
        "/history",
        "/automation",
        "/calendar",
        "/report-templates",
        "/profile",
        "/settings",
        "/admin",
        "/dev-tools",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
