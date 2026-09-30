// src/app/apple-icon.tsx: ikon untuk "Add to Home Screen" (iOS/macOS).
//
// Next.js menyisipkan <link rel="apple-touch-icon"> ke <head> dari berkas ini.
// Dibuat lewat ImageResponse (bukan aset PNG biner) supaya ikon ikut berubah
// otomatis kalau warna merek diubah, dan tidak perlu menambahkan berkas gambar
// ke repo. Ukuran 180x180 adalah yang direkomendasikan Apple untuk iPhone
// modern. Latar WAJIB penuh (tidak transparan): iOS memberi latar putih pada
// area transparan, jadi gradien penuh lebih rapi.

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
          background: "linear-gradient(135deg, #5294ff 0%, #2563eb 60%, #0a0a0a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          fontSize: 104,
          fontWeight: 800,
        }}
      >
        M
      </div>
    ),
    size,
  );
}
