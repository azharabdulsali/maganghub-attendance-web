// src/components/guide-page.tsx: kerangka halaman artikel panduan publik
// (audit C-1). Server component tanpa "use client", supaya seluruh teks
// dirender jadi HTML dan terbaca mesin pencari sepenuhnya.
//
// Berbeda dari legal-page.tsx yang isinya JSX langsung, di sini blok konten
// berasal dari src/lib/guides.ts (data), lalu dirender oleh satu fungsi
// pemetaan. Alasannya: data yang SAMA dipakai untuk JSON-LD Article/HowTo,
// sehingga mustahil skema dan tampilan jadi tidak sinkron. Ini prinsip yang
// sama dengan FAQ_ITEMS di site.ts.

import Link from "next/link";
import { ArrowLeft, CalendarCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { Guide, GuideBlock } from "@/lib/guides";
import { formatTanggalIndo, guideJsonLd, guideLain } from "@/lib/guides";

/** Satu blok isi artikel. Tabel dibungkus div agar bisa digulir di layar kecil. */
function Blok({ blok }: { blok: GuideBlock }) {
  switch (blok.jenis) {
    case "paragraf":
      return (
        <p className="text-sm leading-relaxed text-foreground/80">
          {blok.teks}
        </p>
      );
    case "daftar":
      return (
        <div className="space-y-2">
          {blok.judul ? (
            <p className="font-heading text-sm">{blok.judul}</p>
          ) : null}
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground/80">
            {blok.item.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      );
    case "langkah":
      return (
        <div className="space-y-2">
          <p className="font-heading text-sm">{blok.judul}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground/80">
            {blok.item.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      );
    case "catatan":
      return (
        <div className="rounded-base border-2 border-border bg-secondary-background p-4">
          <p className="font-heading text-sm">{blok.judul}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">
            {blok.teks}
          </p>
        </div>
      );
    case "tabel":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {blok.kepala.map((h) => (
                  <th
                    key={h}
                    className="border-2 border-border bg-secondary-background px-3 py-2 text-left font-heading"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blok.baris.map((r) => (
                <tr key={r.join("|")}>
                  {r.map((sel, i) => (
                    <td
                      key={`${r.join("|")}-${i}`}
                      className="border-2 border-border px-3 py-2 align-top text-foreground/80"
                    >
                      {sel}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}


function Header() {
  return (
    <header className="pt-safe pl-safe pr-safe sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b-2 border-border bg-secondary-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-base border-2 border-border bg-main">
          <CalendarCheck className="size-4" />
        </span>
        <span className="flex flex-col">
          <span className="font-heading text-sm leading-tight">{SITE_NAME}</span>
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
  );
}


export function GuidePage({ guide }: { guide: Guide }) {
  const lain = guideLain(guide.slug);
  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        // JSON-LD dari data terkurasi di lib/guides.ts, bukan input pengguna.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(guideJsonLd(guide, SITE_URL, SITE_NAME)),
        }}
      />
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <nav className="mb-4 text-xs text-foreground/60">
          <Link href="/panduan" className="hover:text-foreground">
            Panduan
          </Link>
        </nav>
        <h1 className="mb-3 text-2xl font-heading sm:text-3xl">{guide.judul}</h1>
        <p className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/60">
          <span>Diperbarui {formatTanggalIndo(guide.terbit)}</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {guide.menitBaca} menit baca
          </span>
        </p>

        <div className="space-y-10">
          {guide.section.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-20 space-y-3">
              <h2 className="font-heading text-lg">{s.judul}</h2>
              {s.blok.map((b, i) => (
                <Blok key={`${s.id}-${i}`} blok={b} />
              ))}
            </section>
          ))}
        </div>

        {lain.length > 0 ? (
          <aside className="mt-12 border-t-2 border-border pt-6">
            <h2 className="mb-3 font-heading text-lg">Baca juga</h2>
            <ul className="space-y-2">
              {lain.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/panduan/${g.slug}`}
                    className="text-sm text-foreground underline underline-offset-4"
                  >
                    {g.judul}
                  </Link>
                  <p className="text-xs text-foreground/60">{g.ringkas}</p>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </main>

      <footer className="pb-safe border-t-2 border-border bg-secondary-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 text-xs text-foreground/60 sm:flex-row">
          <span>{SITE_NAME} — untuk peserta magang Kemnaker</span>
          <div className="flex items-center gap-4">
            <Link href="/panduan" className="transition-colors hover:text-foreground">
              Panduan
            </Link>
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
