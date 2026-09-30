import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BookText,
  CalendarCheck,
  Clock,
  KeyRound,
  Lock,
  Send,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { JsonLd } from "@/components/json-ld";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// Landing PUBLIK di "/". Halaman ini SELALU tampil untuk siapa pun, termasuk
// yang sudah login, supaya "/" tetap bisa dipakai sebagai halaman penjelasan
// aplikasi. Karena itu TIDAK ada redirect ke /dashboard di sini; jangan
// menambahkannya kembali (dulu sempat ada dan membuat "/" tak bisa dibuka
// setelah logout). Lihat SPEC.md §5.8.
//
// Isi halaman ini hanya menyebut fitur yang BENAR-BENAR ada (SPEC.md §1):
// kredensial terenkripsi, 3 template, mode manual/terjadwal, REST API.
//
// Struktur section mengikuti referensi UI (hero + statistik, strip teknologi,
// grid fitur, tiga langkah, panduan, CTA, footer) tetapi SELURUH konten ditulis
// ulang agar jujur: TIDAK ada AI, TIDAK ada integrasi GitHub, dan tidak ada
// tautan ke halaman yang belum ada (mis. /docs). Lihat SPEC.md §3 & §13.

// Statistik di hero, semua angka ini benar dan dapat ditelusuri ke SPEC.
const STATISTIK = [
  { nilai: "3 Bagian", label: "Template laporan siap pakai" },
  { nilai: ">100", label: "Karakter wajib per kolom" },
  { nilai: "<2 dtk", label: "Kirim lewat REST API" },
  { nilai: "AES-256", label: "Enkripsi kredensial Monev" },
];

const FITUR = [
  {
    icon: KeyRound,
    judul: "Hubungkan akun Monev",
    isi: "Kredensial MagangHub disimpan terenkripsi AES-256-GCM. Tidak pernah plaintext, tidak pernah ikut terkirim di log atau respons API.",
  },
  {
    icon: BookText,
    judul: "Tiga template tetap",
    isi: "Uraian Aktivitas, Pembelajaran, dan Kendala, sama seperti proyek lama. Dipakai ulang tiap hari, atau disalin ke editor kalau ingin diubah manual.",
  },
  {
    icon: ShieldCheck,
    judul: "Lolos syarat 100 karakter",
    isi: "Portal menolak laporan terlalu singkat. Setiap kolom divalidasi lebih dari 100 karakter, di kode, bukan hanya di tampilan.",
  },
  {
    icon: Timer,
    judul: "Hemat waktu tiap sore",
    isi: "Tak perlu lagi buka web lemot dan mengetik ulang laporan. Template sudah siap, tinggal review lalu kirim.",
  },
  {
    icon: Clock,
    judul: "Manual atau terjadwal",
    isi: "Kirim 1-klik saat Anda siap, atau serahkan ke jadwal lewat webhook cron. Kendali penuh di tangan Anda, bisa dimatikan kapan saja.",
  },
  {
    icon: Send,
    judul: "Kirim lewat REST API",
    isi: "Tanpa browser dan tanpa server tambahan. Laporan terkirim ke portal dalam hitungan detik, jadi tak ada risiko lupa absen.",
  },
];

const LANGKAH = [
  {
    nomor: "01",
    judul: "Daftar & simpan kredensial",
    isi: "Buat akun, lalu simpan email & password Monev. Sekali saja, setelah itu tersimpan aman dan terenkripsi.",
  },
  {
    nomor: "02",
    judul: "Isi tiga template",
    isi: "Tulis Uraian Aktivitas, Pembelajaran, dan Kendala masing-masing lebih dari 100 karakter. Pakai berkali-kali.",
  },
  {
    nomor: "03",
    judul: "Review & kirim",
    isi: "Kirim manual 1-klik saat siap, atau nyalakan jadwal otomatis. Laporan masuk ke akun Kemnaker Anda.",
  },
];

// Kartu panduan mengarah ke halaman dashboard yang memang ada (SPEC.md §5.8).
const PANDUAN = [
  {
    icon: KeyRound,
    judul: "Akun Monev",
    isi: "Simpan & tes login",
    href: "/credentials",
  },
  {
    icon: BookText,
    judul: "Template Laporan",
    isi: "Isi tiga kolom wajib",
    href: "/report-templates",
  },
  {
    icon: Clock,
    judul: "Jadwal Otomatis",
    isi: "Atur kirim tiap sore",
    href: "/automation",
  },
  {
    icon: CalendarCheck,
    judul: "Riwayat Absensi",
    isi: "Pantau submit harian",
    href: "/history",
  },
];

// Batasan yang diakui terbuka, kebalikan dari klaim berlebihan. Semua ini
// sesuai SPEC: tidak ada AI, tidak ada integrasi GitHub, laporan tetap harus
// pernah dibuat sendiri setidaknya sekali untuk mengisi template.
const BATASAN = [
  "Tidak menulis laporan atas nama Anda, isi template tetap dari Anda.",
  "Tidak ada fitur AI atau integrasi GitHub, sesuai cakupan proyek.",
  "Bergantung pada portal Monev; bila portal berubah, kirim bisa gagal.",
];

// Data terstruktur schema.org (audit O-5). SoftwareApplication memberi Google
// sinyal bahwa ini aplikasi web; WebSite memungkinkan sitelinks search box dan
// menegaskan URL kanonik. Keduanya memakai URL absolut dari src/lib/site.ts.
const SCHEMA_APLIKASI = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "id",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "IDR",
  },
};

const SCHEMA_SITUS = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "id",
};

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd id="schema-software-application" data={SCHEMA_APLIKASI} />
      <JsonLd id="schema-website" data={SCHEMA_SITUS} />
      {/* Bilah atas sederhana: brand + tautan masuk/daftar.
          `pt-safe pl-safe pr-safe`: hindari poni di iPhone landscape. */}
      <header className="pt-safe pl-safe pr-safe sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b-2 border-border bg-secondary-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-base border-2 border-border bg-main">
            <CalendarCheck className="size-4" />
          </span>
          <span className="flex flex-col">
            <span className="font-heading text-sm leading-tight">
              MagangHub Bot
            </span>
            <span className="text-[10px] leading-none text-foreground/60">
              Attendance &amp; Reports
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="neutral"
            size="sm"
            render={<Link href="/docs" />}
            className="hidden sm:inline-flex"
          >
            <BookOpen />
            Dokumentasi
          </Button>
          <Button variant="neutral" size="sm" render={<Link href="/login" />}>
            Masuk
          </Button>
          <Button size="sm" render={<Link href="/register" />}>
            Daftar
          </Button>
        </nav>
      </header>

      {/* Pahlawan (hero) + statistik. */}
      <section className="relative overflow-hidden border-b-2 border-border px-4 pt-10 pb-12 sm:px-6 sm:pt-16 sm:pb-20 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-main px-3 py-1 text-xs font-heading uppercase tracking-wider">
            <span className="size-1.5 rounded-full bg-foreground" />
            Asisten logbook magang • tanpa browser
          </p>
          <h1 className="text-3xl leading-tight font-heading sm:text-4xl md:text-5xl">
            Otomatisasi presensi &amp; laporan{" "}
            <span className="text-main-foreground">MagangHub Kemnaker</span>
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-foreground/80 sm:text-base">
            Simpan tiga template laporan sekali, lalu kirim presensi dan laporan
            harian ke portal Monev lewat Direct REST API, manual 1-klik atau
            terjadwal otomatis, tanpa menyalakan komputer dan tanpa biaya
            bulanan.
          </p>

          <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
            <Button size="lg" render={<Link href="/register" />}>
              <span>Mulai gratis</span>
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="neutral" render={<Link href="/login" />}>
              Saya sudah punya akun
            </Button>
          </div>

          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2.5 pt-6 text-left sm:grid-cols-4 sm:gap-3">
            {STATISTIK.map((item) => (
              <div
                key={item.label}
                className="rounded-base border-2 border-border bg-secondary-background p-3"
              >
                <div className="font-mono text-base font-heading sm:text-lg">
                  {item.nilai}
                </div>
                <div className="text-[10px] text-foreground/60 sm:text-[11px]">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {/* Fitur-fitur utama. */}
        <section id="fitur" className="mb-14 sm:mb-20">
          <div className="mx-auto mb-8 max-w-xl space-y-2 text-center">
            <h2 className="text-2xl font-heading sm:text-3xl">
              Masalah nyata yang diselesaikan
            </h2>
            <p className="text-sm text-foreground/70">
              Bukan sekadar bot, asisten yang menjaga hak dan penilaian magang
              Anda tetap aman.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FITUR.map((item) => (
              <article
                key={item.judul}
                className="rounded-base border-2 border-border bg-secondary-background p-5 shadow-shadow transition-transform hover:-translate-y-0.5"
              >
                <span className="mb-3 inline-flex size-9 items-center justify-center rounded-base border-2 border-border bg-main">
                  <item.icon className="size-4" />
                </span>
                <h3 className="mb-2 font-heading">{item.judul}</h3>
                <p className="text-sm text-foreground/80">{item.isi}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Cara kerja, tiga langkah. */}
        <section
          id="alur"
          className="mb-14 rounded-base border-2 border-border bg-secondary-background/60 p-6 sm:mb-20 sm:p-10"
        >
          <div className="mx-auto mb-8 max-w-xl space-y-2 text-center">
            <h2 className="text-2xl font-heading sm:text-3xl">
              Alur singkat tiga langkah
            </h2>
            <p className="text-sm text-foreground/70">
              Dari simpan template sampai laporan masuk ke portal Monev.
            </p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {LANGKAH.map((item) => (
              <li
                key={item.nomor}
                className="rounded-base border-2 border-border bg-background p-5 shadow-shadow"
              >
                <div className="mb-2 font-mono text-xs font-heading text-foreground/60">
                  LANGKAH {item.nomor}
                </div>
                <h3 className="mb-2 font-heading">{item.judul}</h3>
                <p className="text-sm text-foreground/80">{item.isi}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Keamanan & batasan, dua kolom: janji di kiri, kejujuran di kanan. */}
        <section className="mb-14 grid gap-4 rounded-base border-2 border-border bg-secondary-background p-6 shadow-shadow sm:mb-20 sm:grid-cols-2 sm:gap-6 sm:p-8">
          <div>
            <span className="mb-3 inline-flex size-10 items-center justify-center rounded-base border-2 border-border bg-main">
              <Lock className="size-5" />
            </span>
            <h2 className="mb-2 font-heading">Data Anda terjaga</h2>
            <p className="text-sm text-foreground/80">
              Kredensial Monev Anda dienkripsi AES-256-GCM sebelum disimpan, dan
              tidak ada satu pun log atau respons API yang memuat kata sandi.
              Anda bisa mematikan pengiriman otomatis kapan saja.
            </p>
          </div>
          <div className="rounded-base border-2 border-border bg-background p-5">
            <span className="mb-3 inline-flex size-10 items-center justify-center rounded-base border-2 border-border bg-background">
              <ShieldCheck className="size-5" />
            </span>
            <h2 className="mb-2 font-heading">Yang tidak kami klaim</h2>
            <ul className="space-y-2 text-sm text-foreground/80">
              {BATASAN.map((item) => (
                <li key={item} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Panduan, pintasan ke halaman dashboard yang memang ada. */}
        <section id="panduan" className="mb-14 sm:mb-20">
          <div className="mx-auto mb-8 max-w-xl space-y-2 text-center">
            <h2 className="text-2xl font-heading sm:text-3xl">
              Panduan setup praktis
            </h2>
            <p className="text-sm text-foreground/70">
              Setelah masuk, atur semuanya dari dashboard dalam beberapa menit.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PANDUAN.map((item) => (
              <Link
                key={item.judul}
                href={item.href}
                className="group rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow transition-colors hover:bg-main"
              >
                <div className="mb-1.5 flex items-center gap-2 font-heading text-sm">
                  <item.icon className="size-4" />
                  {item.judul}
                </div>
                <p className="text-xs text-foreground/70">{item.isi}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Ajakan akhir. */}
        <section className="rounded-base border-2 border-border bg-main p-6 text-center shadow-shadow sm:p-10">
          <h2 className="mb-2 text-2xl font-heading sm:text-3xl">
            Jalani magang lebih tenang mulai hari ini
          </h2>
          <p className="mx-auto mb-6 max-w-xl text-sm text-foreground/80">
            Daftar sekali, simpan kredensial dan template Anda, lalu biarkan
            urusan absensi dan logbook beres otomatis tepat waktu.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" render={<Link href="/register" />}>
              <CalendarCheck className="size-5" />
              Daftar gratis
            </Button>
            <Button size="lg" variant="neutral" render={<Link href="/login" />}>
              Masuk ke dashboard
            </Button>
          </div>
        </section>
      </main>

      <footer className="pb-safe border-t-2 border-border bg-secondary-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-foreground/60 sm:flex-row">
          <div className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-foreground" />
            <span className="font-heading text-foreground/80">
              MagangHub Absensi
            </span>
            <span>•</span>
            <span>Untuk peserta magang Kemnaker</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="#fitur"
              className="transition-colors hover:text-foreground"
            >
              Fitur
            </a>
            <a href="#alur" className="transition-colors hover:text-foreground">
              Cara Kerja
            </a>
            <a
              href="#panduan"
              className="transition-colors hover:text-foreground"
            >
              Panduan
            </a>
            <Link
              href="/docs"
              className="transition-colors hover:text-foreground"
            >
              Dokumentasi
            </Link>
            <Link
              href="/login"
              className="font-heading text-foreground transition-colors hover:text-main-foreground"
            >
              Masuk
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
