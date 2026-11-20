import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BookText,
  CalendarCheck,
  ChevronRight,
  Clock,
  KeyRound,
  LayoutDashboard,
  LogIn,
  PenLine,
  Plus,
  Send,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LandingReportSheet } from "@/components/landing-report-sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { JsonLd } from "@/components/json-ld";
import FooterComponent01 from "@/components/shadcn-studio/blocks/footer-component-01/footer-component-01";
import { recentWorkingDays } from "@/lib/landing-sheet-dates";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, FAQ_ITEMS } from "@/lib/site";
import { todayInJakarta } from "@/lib/submit-service";

// Landing PUBLIK di "/". Halaman ini SELALU tampil untuk siapa pun, termasuk
// yang sudah login, supaya "/" tetap bisa dipakai sebagai halaman penjelasan
// aplikasi. Karena itu TIDAK ada redirect ke /dashboard di sini; jangan
// menambahkannya kembali (dulu sempat ada dan membuat "/" tak bisa dibuka
// setelah logout). Lihat SPEC.md §5.8.
//
// Sesi hanya dibaca untuk MENGUBAH TOMBOL, bukan untuk mengalihkan halaman:
// pengguna yang sudah masuk melihat "Dashboard" di kanan atas (bukan
// Masuk/Daftar), sehingga ia tidak mengira sesinya hilang. Membaca sesi tidak
// membuat halaman ini lebih mahal, root layout sudah dinamis karena cookie
// `tema`, dan auth() di sini memakai jalur yang sama dengan semua halaman
// terlindungi.
//
// Isi halaman ini hanya menyebut fitur yang BENAR-BENAR ada (SPEC.md §1):
// kredensial terenkripsi, 3 template, mode manual/terjadwal, REST API.
//
// Struktur section mengikuti referensi UI (hero + statistik, strip teknologi,
// grid fitur, tiga langkah, panduan, CTA, footer) tetapi SELURUH konten ditulis
// ulang agar jujur: fitur yang disebut hanya yang benar-benar ada, dan tidak ada
// tautan ke halaman yang belum ada. Penyusun draf lokal dari kata kunci adalah
// fitur inti; AI & bahan draf dari commit git tetap opsional, jadi tidak
// dijadikan janji utama di halaman ini. Detail lengkapnya ada di /docs dan
// /panduan. Lihat SPEC.md §3 & §13.

// Statistik di bawah hero. Semua angka ini benar dan dapat ditelusuri ke SPEC
// (3 kolom laporan, 100 karakter minimum, token akses 6 jam, AES-256-GCM).
const STATISTIK = [
  { nilai: "3", label: "Kolom laporan" },
  { nilai: "100+", label: "Karakter per kolom" },
  { nilai: "6 jam", label: "Token akses" },
  { nilai: "AES-256", label: "Enkripsi kredensial" },
];

// Isi contoh pada lembar laporan di hero. Ditulis sebagai laporan magang yang
// wajar, bukan kalimat pemasaran: pembaca harus langsung mengenali tiga kolom
// yang sama dengan yang ia isi di portal.
//
// TIGA set, bukan satu: lembar di hero bisa diketuk untuk berganti isi, dan
// tiap set dipasangkan dengan tanggal hari kerja yang berbeda (lihat
// `recentWorkingDays`). Satu hari tidak mungkin punya tiga laporan berbeda,
// jadi tanggalnya memang harus ikut berganti.
const CONTOH_LEMBAR = [
  [
    {
      label: "Uraian aktivitas",
      isi: "Merapikan modul presensi dan menambah validasi tanggal pada form.",
    },
    {
      label: "Pembelajaran",
      isi: "Memahami alur data dari form sampai tersimpan di database.",
    },
    {
      label: "Kendala",
      isi: "Server uji sempat mati saat pengujian, diganti ke lingkungan lokal.",
    },
  ],
  [
    {
      label: "Uraian aktivitas",
      isi: "Membuat halaman riwayat laporan dengan filter tanggal dan status kirim.",
    },
    {
      label: "Pembelajaran",
      isi: "Belajar memisahkan query database dari komponen tampilan.",
    },
    {
      label: "Kendala",
      isi: "Data contoh belum lengkap, jadi filter status belum bisa diuji penuh.",
    },
  ],
  [
    {
      label: "Uraian aktivitas",
      isi: "Menambahkan pengingat harian dan memperbaiki tata letak di layar kecil.",
    },
    {
      label: "Pembelajaran",
      isi: "Memahami cara kerja jadwal otomatis dan batas waktu zona WIB.",
    },
    {
      label: "Kendala",
      isi: "Notifikasi uji masuk terlambat karena jam server beda dari jam lokal.",
    },
  ],
];

const FITUR = [
  {
    icon: KeyRound,
    judul: "Hubungkan akun Monev",
    isi: "Kredensial MagangHub Anda disimpan terenkripsi AES-256-GCM. Tidak pernah dalam bentuk teks biasa, tidak pernah ikut terkirim lewat log sistem atau balasan server.",
  },
  {
    icon: BookText,
    judul: "Template cadangan",
    isi: "Uraian Aktivitas, Pembelajaran, dan Kendala disimpan sekali. Kalau Anda lupa absen, template inilah yang dikirim saat jadwal otomatis menyala.",
  },
  {
    icon: ShieldCheck,
    judul: "Lolos syarat 100 karakter",
    isi: "Portal menolak laporan yang terlalu singkat. Setiap kolom dicek wajib minimal 100 karakter langsung di kode, bukan cuma diingatkan di tampilan.",
  },
  {
    icon: PenLine,
    judul: "Draf dari kata kunci",
    isi: "Ketik aktivitas hari itu, lalu tekan Susun draf. Ketiga kolom terisi otomatis dan tetap bisa Anda sunting sebelum disimpan.",
  },
  {
    icon: Clock,
    judul: "Manual atau terjadwal",
    isi: "Kirim sekali klik saat Anda siap, atau serahkan ke jadwal otomatis. Kendali penuh di tangan Anda, bisa dimatikan kapan saja.",
  },
  {
    icon: Send,
    judul: "Kirim langsung dari server",
    isi: "Tanpa browser dan tanpa server tambahan. Laporan terkirim ke portal dalam hitungan detik, tanpa Anda membuka portal Monev.",
  },
];

const LANGKAH = [
  {
    nomor: "01",
    judul: "Daftar & simpan kredensial",
    isi: "Buat akun, lalu simpan email & password Monev. Cukup sekali, setelah itu tersimpan aman dan terenkripsi.",
  },
  {
    nomor: "02",
    judul: "Simpan template cadangan",
    isi: "Isi Uraian Aktivitas, Pembelajaran, dan Kendala, masing-masing minimal 100 karakter. Setelah tersimpan, template ini jadi cadangan kalau Anda lupa absen.",
  },
  {
    nomor: "03",
    judul: "Ketik kata kunci & kirim",
    isi: "Ketik aktivitas hari itu lalu tekan Susun draf, atau langsung kirim template cadangan. Nyalakan jadwal otomatis supaya tetap terkirim saat Anda lupa.",
  },
];

// Kartu panduan mengarah ke halaman dashboard yang memang ada (SPEC.md §5.8).
const PANDUAN = [
  {
    icon: KeyRound,
    judul: "Kredensial Monev",
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
    judul: "Otomasi",
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
// sesuai SPEC: draf AI bisa gagal (selalu ada fallback lokal), integrasi git
// hanya membaca commit, laporan tetap harus pernah dibuat sendiri setidaknya
// sekali untuk mengisi template, dan pengiriman otomatis butuh jadwal yang
// dinyalakan.
const BATASAN = [
  "Tidak menulis laporan atas nama Anda, isi template tetap dari Anda.",
  "Laporan hanya terkirim otomatis bila template cadangan sudah disimpan dan jadwal otomatis dinyalakan.",
  "Draf AI opsional; bila gagal, draf disusun lokal tanpa AI.",
  "Integrasi GitHub/GitLab hanya membaca commit sebagai bahan draf; aplikasi tidak pernah menulis ke repo Anda.",
  "Bergantung pada portal Monev; bila portal berubah, pengiriman bisa gagal.",
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

// FAQPage. Dibangun dari FAQ_ITEMS yang SAMA dengan section /#faq, sehingga
// pertanyaan di schema selalu identik dengan yang terlihat di halaman. Tanpa
// itu Google menganggapnya cloaking dan rich result ditolak.
const SCHEMA_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default async function Home() {
  // Gagal baca sesi (mis. database sedang tidak terjangkau) TIDAK boleh
  // menjatuhkan halaman publik: landing tetap tampil sebagai pengunjung biasa,
  // bukan halaman galat. Sama seperti tombol yang tidak tahu ada sesi.
  let sudahMasuk = false;
  try {
    sudahMasuk = Boolean((await auth())?.user);
  } catch {
    sudahMasuk = false;
  }

  // Tanggal pada lembar contoh memakai WIB, sama dengan zona waktu yang dipakai
  // seluruh aplikasi saat memutuskan "hari ini". `todayInJakarta` dipakai ulang
  // (bukan `toISOString`) supaya di server UTC pun tanggalnya tidak meleset
  // sehari antara pukul 00:00–07:00 WIB.
  const fmtTanggal = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // Tiga lembar = tiga hari kerja terakhir, bukan tiga kali "hari ini".
  const tanggalLembar = recentWorkingDays(todayInJakarta(), CONTOH_LEMBAR.length);
  const lembar = CONTOH_LEMBAR.map((kolom, i) => ({
    // `new Date("YYYY-MM-DD")` = tengah malam UTC, jadi saat diformat ke WIB
    // tetap tanggal yang sama (07:00 WIB), tidak bergeser sehari.
    tanggal: fmtTanggal.format(new Date(tanggalLembar[i])),
    kolom,
  }));

  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd id="schema-software-application" data={SCHEMA_APLIKASI} />
      <JsonLd id="schema-website" data={SCHEMA_SITUS} />
      <JsonLd id="schema-faq" data={SCHEMA_FAQ} />
      {/* Bilah atas sederhana: brand + tautan masuk/daftar.
          `pt-safe pl-safe pr-safe`: hindari poni di iPhone landscape. */}
      <header className="pt-safe pl-safe pr-safe sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b-2 border-border bg-secondary-background px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-base border-2 border-border bg-main text-main-foreground">
            <CalendarCheck className="size-4" />
          </span>
          <span className="hidden flex-col sm:flex">
            <span className="font-heading text-sm leading-tight">
              MagangHub Autoabsen
            </span>
            <span className="text-[0.6875rem] leading-none text-muted-foreground">
              Absensi &amp; laporan
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
          {sudahMasuk ? (
            <Button
              size="sm"
              render={<Link href="/dashboard" />}
              title="Buka dashboard"
              aria-label="Buka dashboard"
            >
              <LayoutDashboard aria-hidden />
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="neutral"
                size="sm"
                render={<Link href="/login" />}
                title="Masuk"
                aria-label="Masuk"
              >
                <LogIn aria-hidden />
                Masuk
              </Button>
              <Button
                size="sm"
                render={<Link href="/register" />}
                title="Daftar"
                aria-label="Daftar"
              >
                <UserPlus aria-hidden />
                Daftar
              </Button>
            </>
          )}
        </nav>
      </header>

      {/* Pahlawan (hero). Teks di kiri, "benda" yang dijual aplikasi ini di
          kanan: lembar laporan harian yang sudah berstempel. Lembar itu dipakai
          sebagai panggung utama karena inilah artefak yang benar-benar dikirim
          ke portal, bukan angka besar atau ilustrasi dekoratif.

          Latar tetap rata (tanpa gradien) dan lekukan tetap `rounded-base`.
          Kedalaman dibangun dari tiga hal yang semuanya datar: dua lembar
          kertas di belakang (tumpukan), sudut kanan-bawah terlipat, dan
          kemiringan mengikuti kursor (`Tilt`). Rinciannya di DESIGN.md. */}
      <section className="border-b-2 border-border px-4 pt-12 pb-14 sm:px-6 sm:pt-16 sm:pb-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
          <div>
            <p className="font-heading text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Presensi &amp; logbook magang
            </p>
            <h1 className="mt-3 max-w-2xl font-heading text-4xl leading-[0.98] sm:text-5xl lg:text-6xl">
              Lupa absen? Tenang, tetap terkirim.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Simpan template laporan sekali. Kalau Anda lupa absen, template
              itulah yang dikirim saat jadwal otomatis menyala. Mau laporan yang
              lebih spesifik? Ketik kata kunci hari itu, lalu tekan Susun draf.
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Gratis</span>
              <span aria-hidden className="size-1 bg-border" />
              <span>Tanpa ekstensi browser</span>
              <span aria-hidden className="size-1 bg-border" />
              <span>Kredensial terenkripsi</span>
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {sudahMasuk ? (
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  render={<Link href="/dashboard" />}
                  title="Buka dashboard"
                  aria-label="Buka dashboard"
                >
                  <LayoutDashboard className="size-5" aria-hidden />
                  <span>Buka dashboard</span>
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="w-full sm:w-auto"
                    render={<Link href="/register" />}
                  >
                    <span>Buat akun gratis</span>
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="lg"
                    variant="neutral"
                    className="w-full sm:w-auto"
                    render={<Link href="/login" />}
                    title="Masuk ke akun yang sudah ada"
                    aria-label="Masuk ke akun yang sudah ada"
                  >
                    <LogIn aria-hidden />
                    Saya sudah punya akun
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Lembar laporan = satu-satunya "benda" di halaman ini, jadi ia yang
              diberi kedalaman. Seluruh isinya (tumpukan, cap, sudut terlipat)
              ada di `LandingReportSheet` karena lembar ini bisa DIKETUK untuk
              berganti contoh — itu butuh status di peramban, sedangkan halaman
              ini komponen server. Teksnya tetap dikirim dari sini sebagai data,
              jadi tidak ada isi laporan yang ditulis ulang di komponen klien. */}
          <LandingReportSheet lembar={lembar} fakta={STATISTIK} />
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {/* Fitur. Daftar bergaris, bukan enam kartu sejajar: isinya enam hal
            berbeda dengan bobot berbeda, dan kartu seragam membuat semuanya
            tampak sederajat. Garis atas tiap baris memisahkan tanpa menambah
            kotak baru. */}
        <section id="fitur" className="mb-16 scroll-mt-20 sm:mb-24">
          <div className="mb-8 grid gap-4 border-t-2 border-border pt-5 sm:grid-cols-2 sm:items-end sm:gap-12">
            <h2 className="font-heading text-3xl leading-[1.05] sm:text-4xl">
              Yang dikerjakan aplikasi ini
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground sm:justify-self-end">
              Semuanya berjalan dari server. Portal Monev tetap menerima
              laporan seperti biasa, Anda tidak perlu membukanya.
            </p>
          </div>
          <div className="grid gap-x-12 sm:grid-cols-2">
            {FITUR.map((item) => (
              <article
                key={item.judul}
                className="flex gap-4 border-t-2 border-border py-5"
              >
                <item.icon
                  className="mt-0.5 size-5 shrink-0 text-main"
                  aria-hidden
                />
                <div>
                  <h3 className="font-heading text-lg">{item.judul}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {item.isi}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Cara kerja. Nomor di sini benar-benar urutan, jadi penanda bernomor
            dibenarkan. Nomornya ditaruh di parit kiri sebagai angka besar
            (bukan label "LANGKAH 01") supaya tidak ada dua kali pengulangan
            informasi yang sama. */}
        <section id="alur" className="mb-16 scroll-mt-20 sm:mb-24">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-12">
            <h2 className="font-heading text-3xl leading-[1.05] sm:text-4xl">
              Tiga langkah sampai laporan masuk
            </h2>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground sm:text-right">
              Sekali saja di awal. Setelah itu pengiriman harian berjalan tanpa
              mengetik ulang.
            </p>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3 sm:gap-8">
            {LANGKAH.map((item) => (
              <li key={item.nomor} className="border-t-2 border-border pt-4">
                <p className="font-heading text-4xl leading-none tabular-nums text-main">
                  {item.nomor}
                </p>
                <h3 className="mt-3 font-heading text-lg">{item.judul}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {item.isi}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Keamanan & batasan, dua kolom dengan satu garis pemisah. Dua kartu
            bersarang di dalam panel hanya menambah bingkai tanpa menambah
            arti. */}
        <section className="mb-16 grid gap-6 border-2 border-border bg-secondary-background p-6 sm:mb-24 sm:grid-cols-2 sm:gap-10 sm:p-8">
          <div>
            <h2 className="font-heading text-2xl">Data Anda terjaga</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Password Monev dienkripsi AES-256-GCM sebelum disimpan. Tidak ada
              catatan sistem maupun balasan server yang memuat kata sandi, dan
              pengiriman otomatis bisa Anda matikan kapan saja.
            </p>
          </div>
          <div className="border-t-2 border-border pt-6 sm:border-t-0 sm:border-l-2 sm:pt-0 sm:pl-10">
            <h2 className="font-heading text-2xl">Yang tidak kami klaim</h2>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {BATASAN.map((item) => (
                <li key={item} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 bg-border"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Panduan: satu panel bergaris, bukan empat kartu tautan. Tautannya
            tetap jelas karena seluruh baris bisa diklik dan diberi sorotan
            latar saat ditunjuk. */}
        <section id="panduan" className="mb-16 scroll-mt-20 sm:mb-24">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-12">
            <div>
              <h2 className="font-heading text-3xl leading-[1.05] sm:text-4xl">
                Setelah masuk, atur dari sini
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Empat halaman ini cukup untuk menyiapkan semuanya.
              </p>
            </div>
            <Link
              href="/panduan"
              className="inline-flex shrink-0 items-center gap-1.5 font-heading text-sm underline decoration-2 underline-offset-4 hover:decoration-4"
            >
              Baca panduan lengkap
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="max-w-3xl border-2 border-border">
            {PANDUAN.map((item) => (
              <Link
                key={item.judul}
                href={item.href}
                className="group flex items-center gap-4 border-t-2 border-border px-4 py-4 first:border-t-0 hover:bg-secondary-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <item.icon className="size-5 shrink-0 text-main" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-base">{item.judul}</p>
                  <p className="text-sm text-muted-foreground">{item.isi}</p>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        </section>

        {/* Pertanyaan yang sering diajukan (audit C-1: konten & FAQPage).
            `id="faq"` supaya bisa ditautkan dari footer dan hasil pencarian.
            Memakai <details>/<summary> native: setiap pertanyaan dan jawaban
            benar-benar ada di HTML (tanpa JS), syarat wajib agar schema
            FAQPage di bawah sah menurut pedoman Google.
            Karena itu jawaban SELALU dirender (bukan {terbuka && ...}), hanya
            disembunyikan lewat CSS, supaya crawler tetap membacanya. */}
        <section id="faq" className="mb-16 scroll-mt-20 sm:mb-24">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
            <div className="lg:sticky lg:top-20 lg:self-start">
              <h2 className="font-heading text-3xl leading-[1.05] sm:text-4xl">
                Pertanyaan yang sering diajukan
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Jawaban lugas tentang keamanan, cara kerja, dan batasan
                aplikasi.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {FAQ_ITEMS.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-base border-2 border-border bg-secondary-background p-4 open:border-main"
                >
                  {/* Cincin fokus wajib ada di sini: `globals.css` tidak mengatur
                      `summary`, jadi tanpa ini pengguna keyboard kehilangan jejak
                      saat berpindah antar pertanyaan (WCAG 2.4.7). Polanya sama
                      dengan kontrol lain di aplikasi. */}
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-base font-heading text-base focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    {item.q}
                    <Plus
                      aria-hidden="true"
                      className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-45"
                    />
                  </summary>
                  {/* Grid 0fr→1fr: transisi tinggi tanpa mengukur piksel dan
                      tanpa JS. Isi tetap ada di DOM saat tertutup. */}
                  <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 group-open:grid-rows-[1fr]">
                    <div className="overflow-hidden">
                      <p className="pt-2 text-sm leading-relaxed text-muted-foreground">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Ajakan akhir: satu-satunya bidang biru penuh di halaman ini. Tombol
            di dalamnya memakai varian `neutral` (putih), bukan varian utama,
            karena tombol utama juga biru dan akan melebur ke latarnya. */}
        <section className="border-2 border-border bg-main p-6 text-main-foreground sm:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <h2 className="font-heading text-3xl leading-[1.05] sm:text-4xl">
                Jalani magang lebih tenang mulai hari ini
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-main-foreground">
                Daftar sekali, simpan kredensial dan template Anda, lalu absensi
                dan logbook berjalan tepat waktu.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              {sudahMasuk ? (
                <Button
                  size="lg"
                  variant="neutral"
                  className="w-full sm:w-auto"
                  render={<Link href="/dashboard" />}
                  title="Buka dashboard"
                  aria-label="Buka dashboard"
                >
                  <LayoutDashboard className="size-5" aria-hidden />
                  Buka dashboard
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    variant="neutral"
                    className="w-full sm:w-auto"
                    render={<Link href="/register" />}
                  >
                    <CalendarCheck className="size-5" aria-hidden />
                    Buat akun gratis
                  </Button>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 px-1 text-sm font-heading text-main-foreground underline decoration-2 underline-offset-4 hover:decoration-4"
                  >
                    <LogIn className="size-4" aria-hidden />
                    Sudah punya akun? Masuk
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer landing memakai blok footer-component-01
          (`@/components/shadcn-studio/blocks/footer-component-01`): baris
          brand | tautan, garis pemisah, lalu baris copyright terpusat.
          Struktur ini menggantikan footer inline lama yang menjejalkan
          sembilan tautan dalam dua kolom `justify-between` sehingga menabrak
          blok brand. Tombol CTA footer sudah dihapus (CTA ada di header &
          hero). Lihat komentar di berkas blok untuk daftar penyesuaian. */}
      <FooterComponent01 />
    </div>
  );
}
