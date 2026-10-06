// src/app/apple-icon.tsx: ikon untuk "Add to Home Screen" (iOS/macOS).
//
// Next.js menyisipkan <link rel="apple-touch-icon"> ke <head> dari berkas ini.
// Dibuat lewat ImageResponse (bukan aset PNG biner) supaya ikon ikut berubah
// otomatis kalau warna merek diubah, dan tidak perlu menambahkan berkas gambar
// ke repo. Ukuran 180x180 adalah yang direkomendasikan Apple untuk iPhone
// modern. Latar WAJIB penuh (tidak transparan): iOS memberi latar putih pada
// area transparan, jadi gradien penuh lebih rapi.
//
// Motif: KALENDER, disamakan dengan favicon tab (src/app/icon.tsx) supaya ikon
// situs konsisten di semua tempat (tab, Add to Home Screen, manifest).

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        }}
      >
        {/* Badan kalender (putih) dengan header biru tua + kisi tanggal. */}
        <div
          style={{
            width: 120,
            height: 120,
            display: "flex",
            flexDirection: "column",
            background: "#ffffff",
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#1e40af",
              padding: "0 16px",
            }}
          >
            <div style={{ width: 10, height: 38, background: "#ffffff" }} />
            <div style={{ width: 10, height: 38, background: "#ffffff" }} />
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", gap: 12 }}>
              <div
                style={{ width: 20, height: 20, background: "#5294ff", borderRadius: 4 }}
              />
              <div
                style={{ width: 20, height: 20, background: "#5294ff", borderRadius: 4 }}
              />
              <div
                style={{ width: 20, height: 20, background: "#5294ff", borderRadius: 4 }}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div
                style={{ width: 20, height: 20, background: "#bfdbfe", borderRadius: 4 }}
              />
              <div
                style={{ width: 20, height: 20, background: "#bfdbfe", borderRadius: 4 }}
              />
              <div
                style={{ width: 20, height: 20, background: "#bfdbfe", borderRadius: 4 }}
              />
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
