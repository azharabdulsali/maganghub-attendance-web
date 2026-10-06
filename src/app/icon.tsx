// src/app/icon.tsx: favicon (ikon di tab browser).
//
// Mengapa berkas ini ada: `favicon.ico` bawaan Vercel (aset biner dari template
// awal) masih muncul di tab browser. Ikon itu diganti di sini memakai
// ImageResponse — sama seperti apple-icon.tsx — supaya (a) tidak ada aset biner
// di repo, dan (b) ikon ikut berubah otomatis bila warna merek diubah.
//
// Motif: KALENDER, karena aplikasi ini soal absensi/presensi harian. Digambar
// dari elemen dasar (kotak + dua "cincin" jepitan + baris tanggal), bukan emoji,
// supaya tetap tajam di ukuran kecil dan warnanya konsisten dengan merek.
//
// Ukuran 32x32 adalah ikon tab standar; Next.js juga memakai berkas ini untuk
// <link rel="icon">.

import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #5294ff 0%, #2563eb 100%)",
          borderRadius: 7,
        }}
      >
        {/* Badan kalender: kotak putih dengan header biru tua. */}
        <div
          style={{
            width: 22,
            height: 22,
            display: "flex",
            flexDirection: "column",
            background: "#ffffff",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {/* Header (bagian "bulan") berwarna lebih tua + 2 jepitan di atas. */}
          <div
            style={{
              height: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#1e40af",
              padding: "0 3px",
            }}
          >
            <div style={{ width: 2, height: 7, background: "#ffffff" }} />
            <div style={{ width: 2, height: 7, background: "#ffffff" }} />
          </div>
          {/* Kisi tanggal: 2 baris titik. */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
            }}
          >
            <div style={{ display: "flex", gap: 3 }}>
              <div
                style={{ width: 4, height: 4, background: "#5294ff", borderRadius: 1 }}
              />
              <div
                style={{ width: 4, height: 4, background: "#5294ff", borderRadius: 1 }}
              />
              <div
                style={{ width: 4, height: 4, background: "#5294ff", borderRadius: 1 }}
              />
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <div
                style={{ width: 4, height: 4, background: "#bfdbfe", borderRadius: 1 }}
              />
              <div
                style={{ width: 4, height: 4, background: "#bfdbfe", borderRadius: 1 }}
              />
              <div
                style={{ width: 4, height: 4, background: "#bfdbfe", borderRadius: 1 }}
              />
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}