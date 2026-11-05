// src/app/(app)/not-found.tsx: halaman 404 untuk wilayah SETELAH login.
//
// Dibedakan dari `src/app/not-found.tsx` karena berkas ini dirender di dalam
// `(app)/layout.tsx`, sehingga sidebar tetap ada dan tawarannya relevan untuk
// pengguna yang sudah masuk (Dasbor, Riwayat) — bukan "Masuk" seperti versi
// publik.
//
// Kapan ini terpakai: `notFound()` yang dipanggil dari server component di
// dalam grup `(app)` (mis. `/panduan/[slug]` versi terlindungi, atau halaman
// detail yang idnya tidak ada).

import { Compass, LayoutDashboard, CalendarCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AppNotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
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
            Alamat ini tidak ada di dalam aplikasi. Menu di samping tetap bisa
            dipakai — pilih halaman yang Anda butuhkan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button render={<Link href="/dashboard" />}>
            <LayoutDashboard aria-hidden="true" />
            Ke Dasbor
          </Button>
          <Button variant="neutral" render={<Link href="/history" />}>
            <CalendarCheck aria-hidden="true" />
            Riwayat Absensi
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
