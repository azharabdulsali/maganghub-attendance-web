// src/app/register/layout.tsx: pembungkus metadata untuk halaman pendaftaran.
//
// page.tsx di folder ini adalah komponen klien ("use client"), sehingga TIDAK
// bisa mengekspor `metadata`. Layout server tipis ini menyisipkan `noindex`
// (audit T-4) tanpa mengubah perilaku halaman. Register adalah halaman
// utilitas, bukan halaman yang layak muncul di hasil pencarian.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daftar",
  robots: { index: false, follow: false },
};

export default function RegisterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
