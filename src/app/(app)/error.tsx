"use client";

// src/app/(app)/error.tsx: batas galat untuk SEMUA halaman setelah login.
//
// Kenapa terpisah dari `src/app/error.tsx`: berkas ini dirender DI DALAM
// `(app)/layout.tsx`, jadi sidebar tetap tampil saat galat terjadi. Itu
// penting — pengguna tidak terjebak di halaman mati tanpa navigasi; ia bisa
// langsung pindah ke Dasbor atau Riwayat dan pekerjaan lain tetap bisa
// dilanjutkan.
//
// Galat di `(app)/layout.tsx` sendiri TIDAK tertangkap di sini (batas galat
// tidak menangkap segmennya sendiri); galat itu jatuh ke
// `src/app/error.tsx` yang tampil tanpa sidebar. Keduanya wajib ada.
//
// Sama seperti batas galat root: `error.message` mentah TIDAK ditampilkan
// (bisa memuat nama tabel/kolom Prisma atau nama variabel env). Yang
// ditampilkan hanya `digest`, yang bisa dicocokkan admin dengan log server.

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert, RotateCcw, LayoutDashboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[batas galat (app)]", error);
  }, [error]);

  return (
    // Tidak memakai `min-h-dvh`: sidebar sudah mengambil ruang, dan halaman ini
    // dirender di dalam <main id="konten">, jadi cukup padding yang lapang.
    <div className="mx-auto w-full max-w-xl px-4 py-16">
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
            Menu di samping tetap bisa dipakai — Anda tidak terjebak di sini.
            Coba muat ulang halaman ini dulu; bila tetap gagal, hubungi admin
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
              <LayoutDashboard aria-hidden="true" />
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
    </div>
  );
}
