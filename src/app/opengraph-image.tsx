// src/app/opengraph-image.tsx: kartu berbagi yang dibuat otomatis saat build.
//
// Next.js memanggil ini lewat ImageResponse (edge-safe) dan menyisipkan
// og:image + twitter:image ke <head> setiap halaman yang tidak menimpanya.
// Hanya dipakai beranda dan /docs; rute terlindungi `noindex` jadi tidak
// relevan di sana.

import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME} — otomatisasi presensi & laporan magang`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
            "linear-gradient(135deg, #5294ff 0%, #2563eb 55%, #0a0a0a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, opacity: 0.9 }}>
          {SITE_NAME}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Otomatisasi presensi &amp; laporan magang
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            opacity: 0.9,
            maxWidth: 900,
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    size,
  );
}
