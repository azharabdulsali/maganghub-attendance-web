// src/app/docs/opengraph-image.tsx: kartu berbagi KHUSUS halaman /docs.
//
// Berkas ini otomatis menimpa opengraph-image root untuk rute /docs saja
// (Next.js mendukung opengraph-image per-segmen). Judulnya berbeda ("Panduan &
// Dokumentasi") supaya preview saat dibagikan mencerminkan isi halaman, bukan
// beranda. UKURAN dan MEKANISME sama dengan kartu root; GAYA juga sama
// (neobrutalism terang, bukan gradien) agar kartu yang berdampingan di hasil
// share terlihat satu keluarga. Warna literal harus SAMA dengan
// `WARNA` di src/app/opengraph-image.tsx.

import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

export const alt = "Panduan & Dokumentasi MagangHub";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Samakan dengan WARNA di src/app/opengraph-image.tsx.
const WARNA = {
  latar: "#f5f4ef",
  kartu: "#ffffff",
  garis: "#1a1a1a",
  teks: "#1a1a1a",
  redup: "#52525b",
  aksen: "#5294ff",
  aksenTeks: "#101828",
};

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
          background: WARNA.latar,
          color: WARNA.teks,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 26,
            fontWeight: 700,
            color: WARNA.redup,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              border: `3px solid ${WARNA.garis}`,
              backgroundColor: WARNA.aksen,
              color: WARNA.aksenTeks,
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            ?
          </div>
          {SITE_NAME}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            maxWidth: 920,
          }}
        >
          Panduan &amp; Dokumentasi
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 26,
            fontSize: 30,
            lineHeight: 1.35,
            color: WARNA.redup,
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

