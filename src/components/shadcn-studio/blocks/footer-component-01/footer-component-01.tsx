import Link from "next/link";

import Logo from "@/components/shadcn-studio/logo";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/site";

// Blok footer-component-01, disesuaikan dengan proyek ini.
//
// Struktur mengikuti blok asli: baris atas (brand | tautan | aksi) yang
// menumpuk di layar sempit (`max-md:flex-col`), garis pemisah, lalu baris
// copyright terpusat. Ini menyelesaikan masalah footer lama yang menjejalkan
// sembilan tautan dalam dua kolom `justify-between`.
//
// Penyesuaian dari blok asli (semua disengaja, lihat komentar):
//  - Nama/logo brand: `MagangHub Autoabsen`, bukan `shadcn/studio`.
//  - Tautan: ke halaman yang BENAR-BENAR ada di proyek (anchor landing,
//    /panduan, /docs, /privacy, /terms). Blok asli memakai `#`.
//  - Kolom kanan: blok asli memakai 4 ikon sosial media yang mengarah ke `#`,
//    padahal proyek ini tidak punya akun sosial media. Diganti tombol CTA
//    nyata: "Masuk" dan "Daftar gratis". Ikon sosial dihapus agar tidak ada
//    tautan mati.
//  - Garis pemisah: blok asli memakai <Separator /> dari Radix. Proyek ini
//    memakai `@base-ui/react` dan tidak punya komponen Separator, jadi garis
//    dibuat dengan token proyek (`border-t-2 border-border`) tanpa menambah
//    dependensi baru.
//  - Warna & radius memakai token neobrutalis proyek (`rounded-base`,
//    `shadow-shadow`, `bg-main`, `text-main-foreground`), bukan kelas default
//    shadcn.
const FooterComponent01 = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="pb-safe border-t-2 border-border bg-secondary-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-6 max-md:flex-col sm:px-6 sm:py-8 md:gap-6">
        <Link href="/" aria-label={`${SITE_NAME} Absensi — beranda`}>
          <Logo />
        </Link>

        <nav
          aria-label="Tautan footer"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-foreground/80"
        >
          <a
            href="#fitur"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            Fitur
          </a>
          <a
            href="#alur"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            Cara Kerja
          </a>
          <a
            href="#faq"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            FAQ
          </a>
          <Link
            href="/docs"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            Dokumentasi
          </Link>
          <Link
            href="/panduan"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            Panduan
          </Link>
          <Link
            href="/privacy"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            Privasi
          </Link>
          <Link
            href="/terms"
            className="opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            Syarat
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button size="sm" variant="neutral" render={<Link href="/login" />}>
            Masuk
          </Button>
          <Button size="sm" render={<Link href="/register" />}>
            Daftar gratis
          </Button>
        </div>
      </div>

      <div className="border-t-2 border-border">
        <div className="mx-auto flex max-w-7xl justify-center px-4 py-6 sm:px-6">
          <p className="text-center text-xs text-balance text-foreground/70">
            {`©${year}`}{" "}
            <Link href="/" className="hover:underline">
              {SITE_NAME} Absensi
            </Link>
            . Dibuat untuk peserta MagangHub.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default FooterComponent01;
