// src/app/register/layout.tsx: pembungkus metadata untuk halaman pendaftaran.
//
// page.tsx di folder ini adalah komponen klien ("use client"), sehingga TIDAK
// bisa mengekspor `metadata`. Layout server tipis ini menyisipkan `noindex`
// (audit T-4) tanpa mengubah perilaku halaman. Register adalah halaman
// utilitas, bukan halaman yang layak muncul di hasil pencarian.
//
// Layout ini juga penjaga sesi: pengguna yang SUDAH masuk tidak boleh membuka
// form pendaftaran (bisa berakhir dengan akun kedua yang tidak disadari).
// Pemeriksaan harus di server, komponen klien tidak bisa dipercaya.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Daftar",
  robots: { index: false, follow: false },
};

export default async function RegisterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if ((await auth())?.user) redirect("/dashboard");

  return children;
}
