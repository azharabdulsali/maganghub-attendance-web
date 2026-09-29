import Link from "next/link";
import {
  BookText,
  CalendarCheck,
  Clock,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Landing PUBLIK di "/". Halaman ini SELALU tampil untuk siapa pun — termasuk
// yang sudah login — supaya "/" tetap bisa dipakai sebagai halaman penjelasan
// aplikasi. Karena itu TIDAK ada redirect ke /dashboard di sini; jangan
// menambahkannya kembali (dulu sempat ada dan membuat "/" tak bisa dibuka
// setelah logout). Lihat SPEC.md §5.8.
//
// Isi halaman ini hanya menyebut fitur yang BENAR-BENAR ada (SPEC.md §1):
// kredensial terenkripsi, 3 template, mode manual/terjadwal, REST API.

const FITUR = [
  {
    icon: KeyRound,
    judul: "Hubungkan akun Monev",
    isi: "Kredensial MagangHub disimpan terenkripsi AES-256-GCM. Tidak pernah plaintext, tidak pernah ikut terkirim di log.",
  },
  {
    icon: BookText,
    judul: "Tiga template tetap",
    isi: "Uraian Aktivitas, Pembelajaran, dan Kendala — dipakai ulang tiap hari, atau disalin ke editor kalau ingin diubah manual.",
  },
  {
    icon: Clock,
    judul: "Manual atau terjadwal",
    isi: "Kirim 1-klik saat Anda siap, atau serahkan ke jadwal lewat webhook. Kendali penuh ada di tangan Anda, dan bisa dimatikan kapan saja.",
  },
  {
    icon: Zap,
    judul: "Kirim lewat REST API",
    isi: "Tanpa browser dan tanpa server tambahan. Laporan terkirim ke portal dalam hitungan detik.",
  },
];

const LANGKAH = [
  { nomor: "1", judul: "Daftar & masuk", isi: "Buat akun dalam waktu kurang dari satu menit." },
  { nomor: "2", judul: "Simpan kredensial Monev", isi: "Sekali saja. Setelah itu tersimpan aman dan terenkripsi." },
  { nomor: "3", judul: "Isi tiga template", isi: "Tulis sekali, pakai berkali-kali untuk laporan harian." },
  { nomor: "4", judul: "Kirim", isi: "Pilih manual saat siap, atau nyalakan jadwal otomatis." },
];

export default function Home() {
  return (
    <div className="min-h-screen w-full">
      {/* Bilah atas sederhana: brand + tautan masuk/daftar. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b-2 border-border bg-secondary-background px-4 py-3 sm:px-6">
        <span className="flex items-center gap-2 font-heading">
          <Sparkles className="size-5" />
          MagangHub Absensi
        </span>
        <nav className="flex items-center gap-2">
          <Button variant="neutral" size="sm" render={<Link href="/login" />}>
            Masuk
          </Button>
          <Button size="sm" render={<Link href="/register" />}>
            Daftar
          </Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Pahlawan (hero). */}
        <section className="mb-14 sm:mb-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-base border-2 border-border bg-main px-3 py-1 text-xs font-heading">
            <ShieldCheck className="size-4" />
            Absensi magang jadi lebih mudah
          </p>
          <h1 className="mb-4 text-4xl leading-tight font-heading sm:text-6xl">
            MagangHub Autoabsen
          </h1>
          <p className="mb-8 max-w-2xl text-base text-foreground/80 sm:text-lg">
            Kirim absensi MagangHub dari tiga template laporan Anda — tanpa perlu
            menyalakan komputer, tanpa biaya bulanan. Anda tetap pegang kendali
            penuh atas kapan dan apa yang dikirim.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" render={<Link href="/register" />}>
              Mulai sekarang
            </Button>
            <Button size="lg" variant="neutral" render={<Link href="/login" />}>
              Saya sudah punya akun
            </Button>
          </div>
        </section>

        {/* Fitur-fitur utama. */}
        <section className="mb-14 sm:mb-20">
          <h2 className="mb-6 text-2xl font-heading sm:text-3xl">
            Yang Anda dapatkan
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FITUR.map((item) => (
              <article
                key={item.judul}
                className="rounded-base border-2 border-border bg-secondary-background p-5 shadow-shadow"
              >
                <span className="mb-3 inline-flex size-10 items-center justify-center rounded-base border-2 border-border bg-main">
                  <item.icon className="size-5" />
                </span>
                <h3 className="mb-2 font-heading">{item.judul}</h3>
                <p className="text-sm text-foreground/80">{item.isi}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Cara kerja, empat langkah. */}
        <section className="mb-14 sm:mb-20">
          <h2 className="mb-6 text-2xl font-heading sm:text-3xl">
            Cara kerjanya
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LANGKAH.map((item) => (
              <li
                key={item.nomor}
                className="rounded-base border-2 border-border bg-background p-5"
              >
                <span className="mb-3 inline-flex size-8 items-center justify-center rounded-full border-2 border-border bg-main font-heading">
                  {item.nomor}
                </span>
                <h3 className="mb-2 font-heading">{item.judul}</h3>
                <p className="text-sm text-foreground/80">{item.isi}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Janji keamanan — penting dan jujur. */}
        <section className="mb-14 rounded-base border-2 border-border bg-secondary-background p-6 shadow-shadow sm:mb-20">
          <span className="mb-3 inline-flex size-10 items-center justify-center rounded-base border-2 border-border bg-main">
            <Lock className="size-5" />
          </span>
          <h2 className="mb-2 font-heading">Data Anda terjaga</h2>
          <p className="text-sm text-foreground/80">
            Kredensial Monev Anda dienkripsi sebelum disimpan, dan tidak ada satu
            pun log atau respons yang memuat kata sandi. Anda bisa mematikan
            pengiriman otomatis kapan saja.
          </p>
        </section>

        {/* Ajakan akhir. */}
        <section className="rounded-base border-2 border-border bg-main p-6 text-center shadow-shadow sm:p-10">
          <h2 className="mb-2 text-2xl font-heading sm:text-3xl">
            Siap menyerahkan absensi harian?
          </h2>
          <p className="mx-auto mb-6 max-w-xl text-sm text-foreground/80">
            Atur sekali, lalu biarkan berjalan. Tidak perlu lagi mengirim laporan
            satu per satu setiap hari.
          </p>
          <Button size="lg" render={<Link href="/register" />}>
            <CalendarCheck className="size-5" />
            Daftar gratis
          </Button>
        </section>
      </main>

      <footer className="border-t-2 border-border px-4 py-6 text-center text-xs text-foreground/60 sm:px-6">
        MagangHub Absensi — dibangun untuk peserta magang Kemnaker.
      </footer>
    </div>
  );
}

