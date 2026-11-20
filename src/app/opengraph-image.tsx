// src/app/opengraph-image.tsx: kartu berbagi yang dibuat otomatis saat build.
//
// Next.js memanggil ini lewat ImageResponse (edge-safe) dan menyisipkan
// og:image + twitter:image ke <head> setiap halaman yang tidak menimpanya.
// Hanya dipakai beranda dan /docs; rute terlindungi `noindex` jadi tidak
// relevan di sana.
//
// Desain mengikuti landing TERKINI (2026-11): bukan lagi gradien biru gelap,
// melainkan gaya neobrutalism halaman â€” latar terang datar, garis tebal,
// bayangan offset solid, dan ELEMEN UTAMANYA lembar laporan ber-cap "Terkirim"
// yang sama dengan hero. Headline-nya persis H1 landing ("Lupa absen? Tenang,
// tetap terkirim.") supaya yang dilihat orang di chat/DM sama dengan yang
// diterima setelah klik. Warna ditulis literal (bukan token Tailwind) karena
// ImageResponse dirender di luar rangkaian CSS aplikasi.

import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME}: lupa absen? laporan magang tetap terkirim`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Warna yang sama dengan tema terang aplikasi (globals.css), ditulis literal
// karena kartu ini dirender tanpa Tailwind.
const WARNA = {
  latar: "#f5f4ef",
  kartu: "#ffffff",
  garis: "#1a1a1a",
  teks: "#1a1a1a",
  redup: "#52525b",
  aksen: "#5294ff",
  aksenTeks: "#101828",
  hijau: "#22c55e",
  hijauTeks: "#052e16",
};

/** Baris miniatur lembar: pasangan [label, isi], sama tema dengan CONTOH_LEMBAR. */
const BARIS_LEMBAR: [string, string][] = [
  ["Uraian aktivitas", "Merapikan modul presensi dan menambah validasi."],
  ["Pembelajaran", "Memahami alur data dari form sampai database."],
  ["Kendala", "Server uji mati, diganti ke lingkungan lokal."],
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: WARNA.latar,
          color: WARNA.teks,
          fontFamily: "sans-serif",
        }}
      >
        {/* Kolom teks kiri: identik dengan kolom hero landing. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "72px",
            width: "58%",
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
              }}
            >
              {/* Tanda centang CSS murni: karakter "✓" tidak punya glyph di
                  font bawaan ImageResponse (tampil kotak rusak), jadi digambar
                  dari dua sisi kotak yang diputar -45°. */}
              <div
                style={{
                  display: "flex",
                  width: 22,
                  height: 12,
                  borderLeft: `5px solid ${WARNA.aksenTeks}`,
                  borderBottom: `5px solid ${WARNA.aksenTeks}`,
                  transform: "rotate(-45deg) translateY(-2px)",
                }}
              />
            </div>
            {SITE_NAME}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.02,
              maxWidth: 640,
            }}
          >
            Lupa absen? Tenang, tetap terkirim.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 28,
              lineHeight: 1.35,
              color: WARNA.redup,
              maxWidth: 600,
            }}
          >
            Template yang Anda simpan sekali tetap dikirim saat jadwal otomatis
            menyala.
          </div>
        </div>

        {/* Miniatur lembar laporan: sama dengan lembar di hero (kepala +
            cap "Terkirim", tiga kolom, garis pemisah tebal, bayangan offset). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "42%",
            paddingRight: 64,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              backgroundColor: WARNA.kartu,
              border: `4px solid ${WARNA.garis}`,
              boxShadow: `14px 14px 0 ${WARNA.garis}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 24px",
                borderBottom: `3px solid ${WARNA.garis}`,
              }}
            >
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>
                Lembar laporan harian
              </div>
              <div
                style={{
                  display: "flex",
                  padding: "6px 14px",
                  border: `3px solid ${WARNA.garis}`,
                  backgroundColor: WARNA.hijau,
                  color: WARNA.hijauTeks,
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                TERKIRIM
              </div>
            </div>
            {BARIS_LEMBAR.map(([label, isi]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "16px 24px",
                  borderBottom: `3px solid ${WARNA.garis}`,
                }}
              >
                <div style={{ display: "flex", fontSize: 16, color: WARNA.redup }}>
                  {label}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 6,
                    fontSize: 21,
                    fontWeight: 600,
                  }}
                >
                  {isi}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
