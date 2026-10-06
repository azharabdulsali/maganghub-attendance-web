// src/app/panduan/page.tsx: hub daftar artikel panduan publik (audit C-1).
// Server component, seluruh teks jadi HTML. Halaman ini menjadi pintu masuk
// dari mesin pencari ke artikel individual, dan menghubungkan /docs (referensi
// fitur) dengan artikel bergaya pertanyaan pencarian.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { GUIDES, formatTanggalIndo } from "@/lib/guides";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Panduan Absensi & Laporan MagangHub",
  description:
    "Panduan praktis absensi Monev MagangHub Kemnaker: alur lengkap, cara mengambil token dari DevTools, dan cara mengatasi error saat kirim laporan.",
  alternates: { canonical: "/panduan" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: SITE_NAME,
    title: `Panduan | ${SITE_NAME}`,
    description:
      "Panduan praktis absensi Monev MagangHub Kemnaker: alur lengkap, token dari DevTools, dan mengatasi error kirim laporan.",
    url: "/panduan",
  },
};

export default function PanduanPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe pl-safe pr-safe sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b-2 border-border bg-secondary-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-base border-2 border-border bg-main text-main-foreground">
            <CalendarCheck className="size-4" />
          </span>
          <span className="flex flex-col">
            <span className="font-heading text-sm leading-tight">
              {SITE_NAME}
            </span>
            <span className="text-[10px] leading-none text-foreground/60">
              Panduan
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="neutral" size="sm" render={<Link href="/" />}>
            <ArrowLeft />
            Beranda
          </Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="mb-2 text-2xl font-heading sm:text-3xl">
          Panduan MagangHub
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-foreground/70">
          Artikel praktis untuk memakai aplikasi ini dari awal sampai laporan
          terkirim ke portal Monev. Untuk referensi tiap menu, lihat{" "}
          <Link href="/docs" className="text-foreground underline underline-offset-4">
            dokumentasi
          </Link>
          .
        </p>

        <ul className="space-y-6">
          {GUIDES.map((g) => (
            <li key={g.slug} className="border-b-2 border-border pb-6 last:border-0">
              <h2 className="font-heading text-lg">
                <Link
                  href={`/panduan/${g.slug}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {g.judul}
                </Link>
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                {g.ringkas}
              </p>
              <p className="mt-2 text-xs text-foreground/60">
                {formatTanggalIndo(g.terbit)} · {g.menitBaca} menit baca
              </p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="pb-safe border-t-2 border-border bg-secondary-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 text-xs text-foreground/60 sm:flex-row">
          <span>{SITE_NAME} — untuk peserta magang Kemnaker</span>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="transition-colors hover:text-foreground">
              Dokumentasi
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privasi
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Syarat
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
