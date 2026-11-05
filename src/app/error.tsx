"use client";

// src/app/error.tsx: batas galat (error boundary) global.
//
// Kenapa ada: sebelumnya TIDAK ADA `error.tsx`, sehingga galat runtime di
// server component (mis. query Prisma gagal, `ENCRYPTION_KEY` salah,
// `DATABASE_URL` kosong) memunculkan layar putih "Application error" bawaan
// Next.js dengan stack trace bahasa Inggris. Pengguna magang tidak tahu apa
// yang harus dilakukan, dan aplikasi terlihat rusak total padahal hanya satu
// query yang gagal.
//
// Aturan yang dipegang berkas ini:
//   1. JANGAN pernah menampilkan `error.message` mentah ke pengguna. Pesan
//      Prisma bisa memuat nama tabel/kolom, dan pesan env bisa memuat nama
//      variabel — detail internal tidak ada gunanya bagi pengguna dan
//      membocorkan struktur sistem (AGENTS.md §2: jangan menyembunyikan
//      kegagalan, tapi juga jangan membocorkan detail).
//   2. Sediakan SATU tombol yang benar-benar memulihkan: `reset()` dari
//      Next.js mencoba merender ulang segmen ini tanpa memuat ulang seluruh
//      halaman.
//   3. `digest` ditampilkan kecil — itu satu-satunya hal yang bisa dicocokkan
//      admin dengan log server Vercel untuk menemukan galat yang sama.
//
// Catatan: `error.tsx` WAJIB Client Component dan menangkap galat di segmen
// yang sama + anak-anaknya. Galat di root layout sendiri tidak tertangkap di
// sini; itu wilayah `global-error.tsx`.

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert, RotateCcw, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Dicatat ke konsol peramban supaya pengguna yang membuka DevTools bisa
  // melaporkan detailnya. `digest` (bila ada) adalah kunci yang sama dengan
  // baris di log server Vercel.
  useEffect(() => {
    console.error("[batas galat]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
            <span className="text-sm font-base text-foreground/70">
              Terjadi kesalahan
            </span>
          </div>
          <CardTitle>Halaman ini gagal dimuat</CardTitle>
          <CardDescription>
            Bukan salah Anda. Data yang dibutuhkan halaman ini gagal diambil
            dari server. Coba muat ulang dulu; bila tetap gagal, hubungi admin
            dan sebutkan kode di bawah.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              Coba lagi
            </Button>
            <Button variant="neutral" render={<Link href="/dashboard" />}>
              <ArrowLeft aria-hidden="true" />
              Ke Dasbor
            </Button>
          </div>
          {error.digest && (
            <p className="font-mono text-xs break-all text-foreground/70">
              Kode galat: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
