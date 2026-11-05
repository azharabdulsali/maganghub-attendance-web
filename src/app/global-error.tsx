"use client";

// src/app/global-error.tsx: BATAS TERAKHIR bila root layout sendiri gagal.
//
// Kenapa perlu padahal sudah ada `error.tsx` (dua buah): `error.tsx` tidak
// menangkap galat yang terjadi DI root layout (`src/app/layout.tsx`), karena
// batas galat tidak membungkus segmen tempat ia berada. Bila `layout.tsx`
// melempar galat, hanya `global-error.tsx` yang dipakai.
//
// TIGA BATASAN KHUSUS berkas ini (dari dokumentasi Next.js), yang membuatnya
// harus ditulis berbeda dari `error.tsx` biasa:
//   1. Ia MENGGANTIKAN root layout, jadi tag `<html>` dan `<body>` WAJIB
//      ditulis sendiri di sini. Tanpa itu halaman gagal total (Next.js
//      melempar galat "missing <html> and <body> tags").
//   2. `globals.css` TIDAK otomatis ikut termuat lewat layout yang gagal,
//      jadi kelas Tailwind bisa tidak berefek. Karena itu gaya di sini
//      sengaja MEMAKAI ATRIBUT INLINE (`style`), bukan kelas, agar tetap
//      terbaca dalam keadaan paling buruk — inilah satu-satunya berkas di
//      proyek ini yang boleh melakukannya (pengecualian DESIGN.md: "jangan
//      warna hard-code" hanya berlaku untuk UI normal yang punya tema).
//   3. `metadata` TIDAK boleh diekspor dari Client Component; abaikan.
//
// Tidak mengimpor komponen UI mana pun: saat root layout gagal, kita tidak
// mau bergantung pada apa pun yang mungkin ikut rusak atau belum ter-hidrasi.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[batas galat (global)]", error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#eaf2ff",
          color: "#0a0a0a",
        }}
      >
        <main
          style={{
            maxWidth: "32rem",
            width: "100%",
            background: "#ffffff",
            border: "2px solid #0a0a0a",
            borderRadius: "5px",
            boxShadow: "4px 4px 0 0 #000000",
            padding: "1.5rem",
          }}
        >
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>
            Aplikasi gagal dimuat
          </h1>
          <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Terjadi kesalahan saat memuat kerangka aplikasi. Muat ulang halaman
            ini; bila tetap gagal, hubungi admin dan sebutkan kode di bawah.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                cursor: "pointer",
                background: "#5294ff",
                color: "#ffffff",
                border: "2px solid #0a0a0a",
                borderRadius: "5px",
                boxShadow: "4px 4px 0 0 #000000",
                padding: "0.5rem 1rem",
                fontSize: "0.9rem",
                fontWeight: 600,
              }}
            >
              Coba lagi
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                SENGAJA memakai <a>, bukan <Link>. Berkas ini menggantikan root
                layout saat layout itu sendiri gagal; `next/link` bergantung
                pada router React yang justru bagian dari kerangka yang sedang
                rusak. Navigasi keras (full page load) adalah satu-satunya yang
                pasti berfungsi di keadaan ini. */}
            <a
              href="/"
              style={{
                cursor: "pointer",
                display: "inline-block",
                background: "#ffffff",
                color: "#0a0a0a",
                border: "2px solid #0a0a0a",
                borderRadius: "5px",
                boxShadow: "4px 4px 0 0 #000000",
                padding: "0.5rem 1rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Ke beranda
            </a>
          </div>
          {error.digest && (
            <p style={{ margin: "1rem 0 0", fontSize: "0.75rem", opacity: 0.7 }}>
              Kode galat: <code>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
