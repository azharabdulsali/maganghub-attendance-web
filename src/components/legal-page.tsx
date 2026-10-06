// src/components/legal-page.tsx: kerangka halaman publik legal (/privacy,
// /terms). Dipakai bersama supaya header, footer, dan gaya teks konsisten dan
// tidak ada dua salinan markup yang bisa berbeda diam-diam.
//
// Halaman ini server component (tanpa "use client"): isinya teks statis, jadi
// bisa dirender diam-diam jadi HTML dan dibaca mesin pencari sepenuhnya.

import Link from "next/link";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_IS_PLACEHOLDER,
  SITE_NAME,
} from "@/lib/site";

/** Baris tanggal "Terakhir diperbarui". */
export function LastUpdated({ date }: { date: string }) {
  return (
    <p className="text-xs text-foreground/60">Terakhir diperbarui: {date}</p>
  );
}

/** Judul bagian di dalam dokumen legal. */
export function Section({
  nomor,
  judul,
  children,
}: {
  nomor: string;
  judul: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-20 space-y-2" id={`bagian-${nomor}`}>
      <h2 className="font-heading text-lg">
        {nomor}. {judul}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-foreground/80">
        {children}
      </div>
    </section>
  );
}

/**
 * Blok kontak pengelola. Menyembunyikan alamat placeholder (mis. "[email@anda]")
 * dan menampilkan catatan sementara, supaya alamat palsu tidak pernah tampil
 * seolah-olah bisa dihubungi.
 */
export function ContactBlock() {
  if (CONTACT_EMAIL_IS_PLACEHOLDER) {
    return (
      <p className="text-sm leading-relaxed text-foreground/80">
        Hubungi pengelola melalui halaman repositori proyek ini. Alamat email
        kontak akan ditambahkan sebelum situs dipublikasikan secara luas.
      </p>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-foreground/80">
      Pertanyaan tentang privasi atau syarat ini bisa dikirim ke{" "}
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="font-heading text-foreground underline underline-offset-4"
      >
        {CONTACT_EMAIL}
      </a>
      .
    </p>
  );
}

export function LegalPage({
  judul,
  ringkas,
  children,
}: {
  judul: string;
  ringkas: string;
  children: React.ReactNode;
}) {
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
              Attendance &amp; Reports
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
        <h1 className="mb-2 text-2xl font-heading sm:text-3xl">{judul}</h1>
        <p className="mb-8 text-sm leading-relaxed text-foreground/70">
          {ringkas}
        </p>
        <div className="space-y-8">{children}</div>
      </main>

      <footer className="pb-safe border-t-2 border-border bg-secondary-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 text-xs text-foreground/60 sm:flex-row">
          <span>
            {SITE_NAME} — untuk peserta magang Kemnaker
          </span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privasi
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Syarat
            </Link>
            <Link href="/docs" className="transition-colors hover:text-foreground">
              Dokumentasi
            </Link>
            <Link href="/login" className="font-heading text-foreground">
              Masuk
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
