// src/app/docs/opengraph-image.tsx: kartu berbagi KHUSUS halaman /docs.
//
// Berkas ini otomatis menimpa opengraph-image root untuk rute /docs saja
// (Next.js mendukung opengraph-image per-segmen). Judulnya berbeda ("Panduan &
// Dokumentasi") supaya preview saat dibagikan mencerminkan isi halaman, bukan
// beranda. Ukuran dan mekanisme sama dengan kartu root.

import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

export const alt = "Panduan & Dokumentasi MagangHub";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function DocsOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0a0a0a 0%, #2563eb 60%, #5294ff 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700, opacity: 0.9 }}>
          {SITE_NAME}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: 920,
          }}
        >
          Panduan &amp; Dokumentasi
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 30,
            opacity: 0.9,
            maxWidth: 900,
          }}
        >
          Kredensial Monev, template laporan, jadwal otomatis, dan keamanan.
        </div>
      </div>
    ),
    size,
  );
}
