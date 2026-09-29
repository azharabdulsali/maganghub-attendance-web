"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  KeyRound,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Dokumentasi PUBLIK di "/docs" — struktur meniru referensi UI (sidebar daftar
// materi + panel konten + footer), tetapi seluruh isi disesuaikan dengan fitur
// yang BENAR-BENAR ada di proyek ini (SPEC.md §1 & §3). Karena itu TIDAK ada
// bagian "Model AI (BYOK)", "Repository GitHub", atau "Generate AI" — fitur
// tersebut tidak ada di aplikasi ini. Tautan mengarah ke route yang nyata.

type TopikId =
  | "quickstart"
  | "kredensial"
  | "template"
  | "jadwal"
  | "submit"
  | "riwayat"
  | "keamanan"
  | "batasan";

type Topik = {
  id: TopikId;
  nomor: string;
  judul: string;
  ringkas: string;
  icon: typeof BookOpen;
};

const TOPIK: Topik[] = [
  {
    id: "quickstart",
    nomor: "01",
    judul: "Quickstart & Alur",
    ringkas: "Langkah awal sampai absensi pertama terkirim.",
    icon: Sparkles,
  },
  {
    id: "kredensial",
    nomor: "02",
    judul: "Kredensial Kemnaker",
    ringkas: "Simpan email & password Monev dengan aman.",
    icon: KeyRound,
  },
  {
    id: "template",
    nomor: "03",
    judul: "Template Laporan",
    ringkas: "Isi tiga kolom wajib sekali, pakai berkali-kali.",
    icon: BookOpen,
  },
  {
    id: "jadwal",
    nomor: "04",
    judul: "Jadwal & Cron",
    ringkas: "Kirim manual 1-klik atau otomatis tiap sore.",
    icon: Clock,
  },
  {
    id: "submit",
    nomor: "05",
    judul: "Submit & Validasi",
    ringkas: "Aturan 100 karakter dan cara kirim ke portal.",
    icon: Send,
  },
  {
    id: "riwayat",
    nomor: "06",
    judul: "Riwayat & Hapus Draft",
    ringkas: "Pantau hasil kirim dan bersihkan draf lama.",
    icon: Trash2,
  },
  {
    id: "keamanan",
    nomor: "07",
    judul: "Keamanan & Enkripsi",
    ringkas: "Bagaimana kredensial Anda dilindungi.",
    icon: ShieldCheck,
  },
  {
    id: "batasan",
    nomor: "08",
    judul: "Batasan & FAQ",
    ringkas: "Apa yang belum bisa dilakukan aplikasi ini.",
    icon: TriangleAlert,
  },
];

export default function DocsContent() {
  const [aktif, setAktif] = useState<TopikId>("quickstart");
  const topikAktif = TOPIK.find((t) => t.id === aktif) ?? TOPIK[0];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Bilah atas — konsisten dengan landing page. */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b-2 border-border bg-secondary-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-base border-2 border-border bg-main">
            <Sparkles className="size-4" />
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
          <Button variant="neutral" size="sm" render={<Link href="/" />}>
            <ArrowLeft />
            Beranda
          </Button>
          <Button size="sm" render={<Link href="/login" />}>
            Masuk
          </Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Judul halaman. */}
        <div className="mb-6 space-y-1 sm:mb-8">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 shrink-0" />
            <h1 className="text-lg font-heading sm:text-xl">
              Dokumentasi &amp; Panduan Pengguna
            </h1>
          </div>
          <p className="text-xs text-foreground/70">
            Pelajari alur kerja, panduan konfigurasi, dan otomatisasi bot
            absensi MagangHub Kemnaker.
          </p>
        </div>

        <div className="flex flex-col items-start gap-6 md:flex-row md:gap-8">
          {/* Sidebar daftar materi — 8 topik. */}
          <aside className="w-full shrink-0 space-y-2 md:sticky md:top-20 md:w-64 lg:w-72">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-heading uppercase tracking-wider text-foreground/50 sm:px-3">
              <span>Daftar Materi</span>
              <span className="font-bold text-foreground/70">
                {TOPIK.length} Topik
              </span>
            </div>

            {/* Navigasi desktop: daftar vertikal. */}
            <nav className="hidden flex-col gap-1 rounded-base border-2 border-border bg-secondary-background p-2 md:flex">
              {TOPIK.map((t) => {
                const dipilih = t.id === aktif;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAktif(t.id)}
                    aria-current={dipilih ? "true" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-base border-2 px-3 py-2.5 text-left text-xs transition-colors ${
                      dipilih
                        ? "border-border bg-main font-heading"
                        : "border-transparent text-foreground/70 hover:bg-background hover:text-foreground"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <t.icon className="size-4 shrink-0" />
                      <span className="truncate">{t.judul}</span>
                    </span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-foreground/50">
                      {t.nomor}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Navigasi mobile: chip horizontal yang bisa digulir. */}
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 md:hidden">
              {TOPIK.map((t) => {
                const dipilih = t.id === aktif;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAktif(t.id)}
                    aria-current={dipilih ? "true" : undefined}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 px-3 py-2 text-xs transition-colors ${
                      dipilih
                        ? "border-border bg-main font-heading"
                        : "border-border text-foreground/70 hover:bg-background"
                    }`}
                  >
                    <t.icon className="size-3.5" />
                    <span>{t.judul}</span>
                  </button>
                );
              })}
            </div>
          </aside>


          {/* Panel konten. */}
          <div className="w-full min-w-0 flex-1">
            <article className="space-y-6 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow sm:p-8">
              <header className="border-b-2 border-border pb-4">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-foreground/50">
                  Topik {topikAktif.nomor}
                </p>
                <h2 className="text-base font-heading sm:text-lg">
                  {topikAktif.judul}
                </h2>
                <p className="mt-1 text-xs text-foreground/70">
                  {topikAktif.ringkas}
                </p>
              </header>

              {aktif === "quickstart" && <TopikQuickstart />}
              {aktif === "kredensial" && <TopikKredensial />}
              {aktif === "template" && <TopikTemplate />}
              {aktif === "jadwal" && <TopikJadwal />}
              {aktif === "submit" && <TopikSubmit />}
              {aktif === "riwayat" && <TopikRiwayat />}
              {aktif === "keamanan" && <TopikKeamanan />}
              {aktif === "batasan" && <TopikBatasan />}
            </article>
          </div>
        </div>
      </main>

      <footer className="border-t-2 border-border bg-secondary-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-foreground/60 sm:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-foreground" />
            <span>MagangHub Attendance © 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="transition-colors hover:text-foreground">
              Beranda
            </Link>
            <Link
              href="/docs"
              className="transition-colors hover:text-foreground"
            >
              Dokumentasi
            </Link>
            <Link
              href="/login"
              className="transition-colors hover:text-foreground"
            >
              Masuk
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}


// -- Blok kecil yang dipakai berulang. --

function Catatan({
  judul = "Catatan",
  children,
}: {
  judul?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 rounded-base border-2 border-border bg-background p-4 text-xs text-foreground/80">
      <div className="flex items-center gap-1.5 font-heading text-foreground">
        <ShieldCheck className="size-4" />
        <span>{judul}</span>
      </div>
      {children}
    </div>
  );
}

function Langkah({
  nomor,
  judul,
  children,
}: {
  nomor: string;
  judul: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0 font-mono text-xs text-foreground/50">
        {nomor}
      </span>
      <span>
        <strong className="font-heading text-foreground">{judul}</strong>
        {" — "}
        <span className="text-foreground/80">{children}</span>
      </span>
    </li>
  );
}

function SubJudul({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-heading text-xs uppercase tracking-wider text-foreground/60">
      {children}
    </h3>
  );
}

function TautanPanduan({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-heading text-foreground underline decoration-2 underline-offset-2 hover:no-underline"
    >
      {children}
    </Link>
  );
}


// -- Isi tiap topik. --

function TopikQuickstart() {
  return (
    <>
      <div className="space-y-1.5 rounded-base border-2 border-border bg-background p-4 text-xs text-foreground/80">
        <div className="flex items-center gap-1.5 font-heading text-foreground">
          <Sparkles className="size-4" />
          <span>Tujuan Utama Sistem</span>
        </div>
        <p className="leading-relaxed">
          Aplikasi ini mengotomatiskan penyerahan kehadiran dan laporan magang
          tiga bagian (Uraian Aktivitas, Pembelajaran, Kendala) ke portal Monev
          MagangHub Kemnaker (<code>monev.maganghub.kemnaker.go.id</code>) lewat
          Direct REST API. Isi laporan Anda berasal dari template yang Anda
          tulis sendiri — bukan dari AI dan bukan dari commit GitHub.
        </p>
      </div>

      <div className="space-y-3">
        <SubJudul>5 Langkah Mudah Memulai</SubJudul>
        <ol className="space-y-3 text-xs text-foreground/80">
          <Langkah nomor="1" judul="Daftar akun">
            Buat akun lewat{" "}
            <TautanPanduan href="/register">halaman pendaftaran</TautanPanduan>
            , lalu masuk ke dashboard.
          </Langkah>
          <Langkah nomor="2" judul="Simpan kredensial Monev">
            Buka{" "}
            <TautanPanduan href="/credentials">
              Akun Monev
            </TautanPanduan>{" "}
            , masukkan email &amp; password Kemnaker, lalu tekan{" "}
            <em>Uji Login Monev</em>.
          </Langkah>
          <Langkah nomor="3" judul="Isi tiga template">
            Buka{" "}
            <TautanPanduan href="/report-templates">
              Template Laporan
            </TautanPanduan>{" "}
            dan isi ketiga kolom, masing-masing lebih dari 100 karakter.
          </Langkah>
          <Langkah nomor="4" judul="Review draf">
            Di dashboard, periksa kembali isi laporan hari ini sebelum dikirim.
          </Langkah>
          <Langkah nomor="5" judul="Submit kehadiran">
            Klik <em>Kirim Sekarang</em> untuk mode manual, atau aktifkan jadwal
            otomatis di{" "}
            <TautanPanduan href="/automation">
              Jadwal Otomatis
            </TautanPanduan>
            .
          </Langkah>
        </ol>
      </div>

      <Catatan judul="Penting">
        <p>
          Laporan tetap harus pernah Anda tulis sendiri — aplikasi ini tidak
          mengarang isi laporan. Tiga template itu dipakai ulang setiap hari
          agar Anda tidak perlu mengetik dari nol.
        </p>
      </Catatan>
    </>
  );
}

function TopikKredensial() {
  return (
    <>
      <div className="space-y-2 text-xs text-foreground/80">
        <p>
          Buka halaman{" "}
          <TautanPanduan href="/credentials">Akun Monev</TautanPanduan>{" "}
          untuk menyimpan email dan password akun Kemnaker Anda.
        </p>
      </div>

      <div className="space-y-3">
        <SubJudul>Cara mengisi</SubJudul>
        <ol className="space-y-3 text-xs text-foreground/80">
          <Langkah nomor="1" judul="Masukkan email & password">
            Gunakan kredensial yang sama seperti saat login ke portal Monev.
          </Langkah>
          <Langkah nomor="2" judul="Uji Login Monev">
            Tombol ini mencoba masuk ke portal untuk memastikan kredensial benar
            sebelum dipakai mengirim laporan.
          </Langkah>
          <Langkah nomor="3" judul="Simpan">
            Setelah uji login berhasil, kredensial tersimpan terenkripsi dan
            siap dipakai.
          </Langkah>
        </ol>
      </div>

      <Catatan judul="Keamanan">
        <p>
          Kredensial dienkripsi AES-256-GCM sebelum disimpan. Tidak pernah
          ditulis plaintext, dan tidak pernah muncul di log maupun respons API.
          Lihat juga topik <em>Keamanan &amp; Enkripsi</em>.
        </p>
      </Catatan>
    </>
  );
}


function TopikTemplate() {
  return (
    <>
      <div className="space-y-2 text-xs text-foreground/80">
        <p>
          Laporan magang Monev terdiri dari tiga kolom wajib. Isi ketiganya di{" "}
          <TautanPanduan href="/report-templates">
            Template Laporan
          </TautanPanduan>
          , sekali saja, lalu pakai ulang setiap hari.
        </p>
      </div>

      <div className="space-y-3">
        <SubJudul>Tiga kolom wajib</SubJudul>
        <ul className="space-y-2 text-xs text-foreground/80">
          <li className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60"
            />
            <span>
              <strong className="font-heading">Uraian Aktivitas</strong> —
              kegiatan magang hari itu.
            </span>
          </li>
          <li className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60"
            />
            <span>
              <strong className="font-heading">Pembelajaran</strong> — hal baru
              yang Anda pelajari.
            </span>
          </li>
          <li className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60"
            />
            <span>
              <strong className="font-heading">Kendala</strong> — hambatan atau
              catatan selama bekerja.
            </span>
          </li>
        </ul>
      </div>

      <Catatan judul="Aturan 100 karakter">
        <p>
          Setiap kolom wajib lebih dari 100 karakter. Portal Monev menolak
          laporan yang terlalu pendek, dan validasi ini juga dijalankan di sisi
          aplikasi sebelum dikirim.
        </p>
      </Catatan>
    </>
  );
}

function TopikJadwal() {
  return (
    <>
      <div className="space-y-2 text-xs text-foreground/80">
        <p>
          Ada dua cara mengirim laporan: manual 1-klik, atau otomatis lewat
          jadwal. Atur di{" "}
          <TautanPanduan href="/automation">
            Jadwal Otomatis
          </TautanPanduan>
          .
        </p>
      </div>

      <div className="space-y-3">
        <SubJudul>Pilihan mode</SubJudul>
        <ol className="space-y-3 text-xs text-foreground/80">
          <Langkah nomor="1" judul="Manual">
            Kirim kapan pun Anda siap langsung dari dashboard. Cocok bila isi
            laporan berubah tiap hari.
          </Langkah>
          <Langkah nomor="2" judul="Terjadwal (cron)">
            Aktifkan webhook cron agar laporan terkirim otomatis, misalnya tiap
            sore. Sekali diatur, Anda tinggal memantau hasilnya.
          </Langkah>
        </ol>
      </div>

      <Catatan judul="Kendali penuh">
        <p>
          Pengiriman otomatis bisa Anda matikan kapan saja. Bila tidak ingin
          berjalan lagi, cukup nonaktifkan dari halaman Jadwal Otomatis.
        </p>
      </Catatan>
    </>
  );
}


function TopikSubmit() {
  return (
    <>
      <div className="space-y-2 text-xs text-foreground/80">
        <p>
          Pengiriman dilakukan lewat Direct REST API ke portal Monev — tanpa
          membuka browser dan tanpa server tambahan, sehingga laporan terkirim
          dalam hitungan detik.
        </p>
      </div>

      <div className="space-y-3">
        <SubJudul>Yang divalidasi sebelum kirim</SubJudul>
        <ul className="space-y-2 text-xs text-foreground/80">
          <li className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60"
            />
            <span>Ketiga kolom terisi dan masing-masing &gt; 100 karakter.</span>
          </li>
          <li className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60"
            />
            <span>Kredensial Monev sudah tersimpan dan berhasil diuji.</span>
          </li>
          <li className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60"
            />
            <span>Belum ada kiriman untuk tanggal yang sama.</span>
          </li>
        </ul>
      </div>

      <Catatan judul="Bila gagal">
        <p>
          Pesan kesalahan akan ditampilkan apa adanya (mis. kredensial salah
          atau portal menolak). Perbaiki sesuai pesan, lalu kirim ulang. Status
          tiap percobaan tercatat di Riwayat.
        </p>
      </Catatan>
    </>
  );
}

function TopikRiwayat() {
  return (
    <>
      <div className="space-y-2 text-xs text-foreground/80">
        <p>
          Halaman{" "}
          <TautanPanduan href="/history">Riwayat Absensi</TautanPanduan>{" "}
          menampilkan setiap percobaan kirim beserta statusnya, sehingga Anda
          bisa memastikan laporan hari ini benar-benar masuk.
        </p>
      </div>

      <div className="space-y-3">
        <SubJudul>Yang bisa Anda lakukan</SubJudul>
        <ol className="space-y-3 text-xs text-foreground/80">
          <Langkah nomor="1" judul="Pantau status">
            Lihat mana yang berhasil dan mana yang gagal, lengkap dengan waktu
            kirimnya.
          </Langkah>
          <Langkah nomor="2" judul="Telusuri penyebab gagal">
            Pesan kesalahan dari portal ditampilkan agar mudah diperbaiki.
          </Langkah>
          <Langkah nomor="3" judul="Bersihkan draf">
            Buang draf atau catatan lama yang tidak lagi dipakai supaya riwayat
            tetap rapi.
          </Langkah>
        </ol>
      </div>

      <Catatan judul="Tips">
        <p>
          Biasakan mengecek Riwayat setiap sore setelah jadwal otomatis
          berjalan, agar absensi tidak pernah terlewat tanpa Anda sadari.
        </p>
      </Catatan>
    </>
  );
}


function TopikKeamanan() {
  return (
    <>
      <div className="space-y-2 text-xs text-foreground/80">
        <p>
          Keamanan kredensial adalah hal paling penting di aplikasi ini. Berikut
          cara Anda dilindungi.
        </p>
      </div>

      <div className="space-y-3">
        <SubJudul>Perlindungan yang diterapkan</SubJudul>
        <ul className="space-y-2 text-xs text-foreground/80">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-heading">Enkripsi AES-256-GCM</strong> —
              kredensial dienkripsi sebelum disimpan, bukan plaintext.
            </span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-heading">Tidak di log</strong> — kata
              sandi tidak pernah muncul di log atau respons API.
            </span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-heading">Kendali penuh</strong> — Anda
              bisa mematikan pengiriman otomatis kapan saja.
            </span>
          </li>
        </ul>
      </div>

      <Catatan judul="Tetap waspada">
        <p>
          Jangan pernah membagikan kredensial Kemnaker Anda ke pihak lain.
          Aplikasi ini hanya menyimpannya untuk keperluan mengirim laporan atas
          nama Anda.
        </p>
      </Catatan>
    </>
  );
}

function TopikBatasan() {
  return (
    <>
      <div className="space-y-2 text-xs text-foreground/80">
        <p>
          Kami menyebutkan batasan secara terbuka supaya ekspektasi Anda sesuai
          dengan kemampuan aplikasi yang sebenarnya.
        </p>
      </div>

      <div className="space-y-3">
        <SubJudul>Yang belum / tidak dilakukan</SubJudul>
        <ul className="space-y-2 text-xs text-foreground/80">
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Tidak menulis laporan atas nama Anda — isi template tetap dari
              Anda.
            </span>
          </li>
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Tidak ada fitur AI atau integrasi GitHub, sesuai cakupan proyek.
            </span>
          </li>
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Bergantung pada portal Monev; bila portal berubah, pengiriman bisa
              gagal.
            </span>
          </li>
        </ul>
      </div>

      <Catatan judul="Masih ada pertanyaan?">
        <p>
          Mulai dari{" "}
          <TautanPanduan href="/register">halaman pendaftaran</TautanPanduan>{" "}
          atau masuk ke{" "}
          <TautanPanduan href="/login">dashboard</TautanPanduan> untuk mencoba
          sendiri.
        </p>
      </Catatan>
    </>
  );
}

