// src/app/not-found.tsx: halaman 404 global.
//
// Kenapa ada: sebelumnya TIDAK ADA `not-found.tsx` sama sekali, sehingga URL
// salah ketik jatuh ke halaman 404 bawaan Next.js — hitam-putih, bahasa
// Inggris, tanpa navigasi. Untuk aplikasi berbahasa Indonesia yang menyimpan
// kredensial orang, halaman default itu meyakinkan pengguna bahwa situsnya
// rusak. Berkas ini menampilkan 404 dengan gaya aplikasi + jalan keluar.
//
// PENTING: `not-found.tsx` di root TIDAK bisa memakai `auth()` untuk memutuskan
// menu (ia juga melayani pengunjung belum login). Karena itu tawaran jalan
// keluarnya sengaja netral: Beranda (publik) dan Masuk.
//
// `notFound()` yang dipanggil dari dalam grup `(app)` akan memakai berkas
// `src/app/(app)/not-found.tsx` (versi dengan sidebar), bukan berkas ini.

import type { Metadata } from "next";
import Link from "next/link";
import { Compass, ArrowLeft, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Halaman galat tidak boleh masuk indeks mesin pencari.
export const metadata: Metadata = {
  title: "Halaman tidak ditemukan",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <Compass aria-hidden="true" className="size-5 shrink-0" />
            <span className="text-sm font-base text-foreground/70">
              Galat 404
            </span>
          </div>
          <CardTitle>Halaman tidak ditemukan</CardTitle>
          <CardDescription>
            Alamat yang Anda buka tidak ada, atau sudah dipindahkan. Periksa
            kembali tautannya — salah ketik satu huruf saja sudah cukup.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button render={<Link href="/" />}>
            <ArrowLeft aria-hidden="true" />
            Kembali ke beranda
          </Button>
          <Button variant="neutral" render={<Link href="/login" />}>
            <LogIn aria-hidden="true" />
            Masuk
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
