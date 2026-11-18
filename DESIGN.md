# DESIGN.md: MagangHub Autoabsen

Arah desain ini disusun dari UI yang **sudah ada** (`src/app/globals.css`,
`src/app/page.tsx`, `src/components/ui/button.tsx`), bukan dikarang dari nol.
Semua nilai di bawah bisa ditelusuri ke token nyata di repo. Status: **draf untuk
disetujui**, selama belum disetujui, setiap UI yang saya bangun diberi label
*"draf tanpa arah"* (R-37).

## Dial

```
Dial: ENERGY 2 / RHYTHM 2 / MOTION 1
```

Alasan satu baris per dial:

- **ENERGY 2**, ini alat internal untuk peserta magang, bukan portofolio agensi:
  harus terasa hidup lewat warna dan blok tebal, tapi tidak berteriak. Anchor
  rasa: antara GOV.UK dan Stripe.
- **RHYTHM 2**, halaman butuh irama yang konsisten dengan beberapa jeda (blok
  CTA penuh warna, strip langkah bernomor), bukan grid seragam total.
- **MOTION 1**, pengguna membuka ini saat buru-buru mengisi logbook; animasi
  hanya boleh jadi umpan balik (hover, focus), bukan tontonan. Satu pengecualian
  disetujui pemilik untuk lembar laporan di hero landing, batasnya di bagian
  "Buku absen editorial" di bawah.

## Bahasa visual (dipilih dari aset yang sudah dipakai)

Gaya yang sudah tertanam di `globals.css` adalah **neo-brutalist terkendali**:
border 2px hitam, shadow keras tanpa blur (`--shadow: 4px 4px 0px 0px black`),
radius kecil (`--radius-base: 5px`), dan satu warna aksen biru terang.

| Keputusan | Nilai | Alasan satu baris (R-31) |
|---|---|---|
| Warna inti | netral (putih/hitam/abu) + biru `hsl(217,100%,66%)` (`--main`) | Identitas aplikasi sudah ditentukan token `--main`; netral menjaga tabel absensi tetap terbaca. |
| Warna status | `--success` hijau `#059669` | Satu-satunya warna semantik; dipakai untuk status "terkirim", bukan dekorasi. |
| Aksen | biru `--main` saja | Satu aksen yang dipakai hemat di tombol utama dan blok CTA. |
| Tipografi | Inter (satu keluarga, via `--font-sans`) | Angka absensi harus jelas d  i ukuran kecil; satu keluarga mengurangi noise. |
| Radius | `--radius-base` 5px, konsisten | Radius kecil seragam menandai gaya border-tebal; bukan pill serba bulat. |
| Elevasi | shadow keras hanya pada elemen yang bisa ditekan (tombol, kartu tautan) | Menandai "ini bisa diklik", bukan membuat semua elemen melayang. |
| Latar | `--secondary-background` putih dengan latar halaman biru muda `hsl(214,95%,93%)` | Memisahkan kanvas dari kartu tanpa perlu gradien. |

**Dose caps yang mengikat** (dari aturan anti-slop):
- Tanpa gradien dekoratif. Warna datar + border tebal sudah jadi identitas.
- Shadow keras maksimal 1 level; tidak ada glow di kartu + tombol + badge sekaligus.
- Radius tidak boleh serba pill: `rounded-base` untuk hampir semua, `rounded-full`
  hanya untuk avatar. Penanda status kecil (titik hari ini, penanda laporan,
  butir daftar) memakai **kotak** `rounded-none`, lihat bagian "Buku absen
  editorial" di bawah.
- Maksimum 3 warna inti + 1 aksen di satu halaman.

## Warna & tombol

- **Semantik warna lewat variant, bukan kelas mentah.** Aksi merusak (hapus,
  keluar semua perangkat, rotasi kunci) memakai variant tombol `danger`
  (`--destructive`, merah). Aksi "menjalankan/aktifkan/simpan" memakai `success`
  (`--success`, hijau). Token didefinisikan di `globals.css` untuk mode terang
  dan gelap (di mode gelap foreground-nya jadi gelap agar kontras). Dilarang
  `bg-red-500`/`text-green-600`.
- **Latar berwarna selalu berpasangan dengan `*-foreground`.** `bg-success`
  ditulis dengan `text-success-foreground`; `bg-destructive` dengan
  `text-destructive-foreground`; `bg-warning` dengan `text-warning-foreground`;
  `bg-main` dengan `text-main-foreground`. **Jangan** `text-white`, `text-black`,
  atau `text-foreground` di atas latar berwarna (biru/hijau/merah/kuning), dan
  jangan `text-main-foreground` di atas hijau/merah. Aturan ini berlaku di
  `<Badge>`, `<Message>`, toast, sel kalender, badge role profil, chip terpilih,
  dan kotak ikon beraksen: satu status = satu pasangan warna yang sama di mana
  pun.
- **Latar yang berubah saat interaksi ikut mengubah foreground.** Bila kelas
  `hover:bg-main`/`open:bg-main`/`data-[state=checked]:bg-main` dipakai, tulis
  juga pasangannya (`hover:text-main-foreground`, dst.). Untuk anak yang
  diwarnai eksplisit, pakai varian grup (`group-hover:`/`group-open:`). Kasus
  paling mudah luput: bagian CTA berlatar `bg-main` yang berisi tombol varian
  `default` (juga `bg-main`), tombolnya jadi tak terlihat; solusinya jangan
  susun elemen `bg-main` di dalam `bg-main`.
- **Tiga makna, tiga token:** `success` (berhasil), `destructive` (gagal/merusak),
  `warning` (perlu tindakan tapi tidak merusak). Jangan pakai kuning untuk hal
  yang sebenarnya gagal, atau merah untuk yang hanya butuh perhatian.
- **Ikon menjelaskan aksi.** Tombol aksi berulang (dalam tabel/daftar) memakai
  `size="icon-sm"` + ikon + `title` + `aria-label`. Konvensi: `Play` jalankan,
  `Trash2` hapus, `Pencil` ubah, `Copy`/`Check` salin/tersalin, `Save`/`Plus`
  simpan/tambah, `X` batal, `LogIn` masuk, `UserPlus` daftar, `LogOut` keluar.
- **Tombol destruktif tetap jelas** sebelum dijalankan: konfirmasi selalu lewat
  `<ConfirmDialog>` dengan teks label utuh, bukan ikon saja.

## Suara (voice)

Tulis sebagai rekan kerja yang menjelaskan alat, bukan pemasar. Kalimat pendek,
kata kerja konkret, angka yang bisa dicek.

- **Larang** (R-16): "AI Powered", "Seamless", "Revolutionary", "Cutting Edge",
  "Powerful", "Effortless", "Next Generation".
- **Larang** (R-02): em dash `—` di seluruh teks yang tampil ke pengguna.
- **CTA** harus menyebut aksi nyatanya (R-15): "Simpan template", "Kirim sekarang",
  "Hubungkan akun Monev", bukan "Get Started" / "Learn More".
- **Judul hero = dua kalimat pendek, bukan deskripsi teknis** (2026-11). Bunyinya
  sekarang "Tulis sekali. Terkirim tiap hari." Kategori produknya (presensi &
  logbook magang) dinaikkan ke **kicker** di atas judul, sehingga judul boleh
  sesingkat itu tanpa kehilangan kata kunci. Kalimat lama "terkirim dari server"
  turun ke paragraf & daftar fitur karena itu **cara kerja**, bukan alasan orang
  memakainya. Pola ini yang dipakai lagi kalau judul hero disunting nanti.
- **Angka** hanya boleh muncul kalau bisa ditelusuri (R-17, R-36). Contoh yang
  lolos: "3 template", "100 karakter minimum" (benar, ada di SPEC).

## Ikon

Dipakai dari `lucide-react` yang sudah ada sebagai dependensi. Aturan:
- Ikon harus **menjelaskan isinya**, bukan mengisi slot (R-04).
- `Sparkles` dan `Zap` **dilarang** sebagai hiasan logo/footer/tombol. Sudah
  diputuskan dan dieksekusi (R-04): logo brand memakai `CalendarCheck` (inti
  aplikasi = kehadiran), topik "Quickstart" memakai `BookOpen`, fitur "Kirim
  lewat REST API" memakai `Send` (literal), dan ikon hiasan blok dihapus.

## Motif identitas

**Border 2px + shadow keras 4px tanpa blur.** Satu gestur yang diulang di tombol,
kartu, input focus, dan blok CTA sehingga UI ini terasa milik produk ini, bukan
template. Ini pengganti gradien/glow yang dilarang.

## Tema (terang/gelap)

Diputuskan dan dieksekusi (R-21, opsi b):
- Sakelar terang/gelap nyata ada di UI: header landing (`page.tsx`), header docs
  (`docs-content.tsx`), dan kartu akun di sidebar (`app-sidebar.tsx`).
- Nilai awal dipasang **tanpa JavaScript**: `RootLayout` membaca cookie `tema`
  (`light`/`dark`) dan memasangnya sebagai kelas di `<html>`; kedua palet di
  `globals.css` ditulis berdampingan lewat `light-dark()`, jadi browser memakai
  warna yang benar sejak paint pertama. Tanpa cookie, `color-scheme: light dark`
  membuat tema mengikuti OS. `src/components/theme-toggle.tsx` menulis cookie +
  kelas saat tombol ditekan.
- Riwayat: skrip anti-flicker di `public/tema.js` sudah DIHAPUS karena memicu
  error React 19 ("Encountered a script tag …"); `next/script`
  `beforeInteractive` terukur berjalan setelah paint pertama, dan
  `useServerInsertedHTML` memicu mismatch hidrasi.
- Tanpa paket baru. Tema mengandalkan token `light-dark()` di `globals.css`.
- **Ikon tombol dipilih CSS**, bukan state React (`.ikon-tema-gelap` /
  `.ikon-tema-terang` di `globals.css`). Server tidak tahu tema saat merender
  `ThemeToggle`, jadi ikon yang dipilih lewat state membuat markup server
  berbeda dari klien dan React melaporkan "Hydration failed".
- Penyesuaian mode gelap yang ikut diambil: `--shadow` diikat ke putih 90%
  (bukan turunan `--border` yang jadi terlalu tipis dan membuat shadow keras
  hilang, sekaligus tidak sekeras putih 100%), dan warna scrollbar kini memakai
  token (`--secondary-background` / `--border`) alih-alih putih/hitam hard-code.
- **Perbaikan (bug "mode gelap tetap putih semua"):** blok `.dark` dulu hanya
  meng-override sebagian token `:root`. Token `--secondary-background`, dipakai
  oleh `bg-secondary-background` di kartu, panel hero, footer, `input`,
  `textarea`, dan tombol varian `neutral`, **tidak punya pasangan gelap**, jadi
  tetap `oklch(100% 0 0)` (putih penuh) dan menutupi latar gelap di belakangnya.
  Sekarang `.dark` menetapkan `--secondary-background` (disejajarkan dengan
  `--card`) dan `--chart-active-dot` (titik penanda grafik hitam tidak terbaca di
  latar gelap).

### Penyempurnaan mode gelap (skill `dark-mode-design`)

Palet gelap disusun ulang mengikuti prinsip *surface elevation*, bukan sekadar
pembalikan warna terang, lewat skill `dark-mode-design`
(`owl-listener/designer-skills`). Empat aturan skill yang diterapkan:

- **Hierarki permukaan lewat kecerahan, bukan bayangan.** Dulu hanya ada dua
  bidang (`--background` `0.145` → sisanya `0.205`/`0.269`), sehingga kartu,
  sidebar, dan popover bertumpuk di ketinggian yang sama. Sekarang tangga
  eksplisit: kanvas `0.16` ≈ `#0d0d0d` → permukaan-1 (`--card`,
  `--secondary-background`, `--sidebar`) `0.21` ≈ `#181818` → permukaan-2
  (`--popover`) `0.25` ≈ `#222` → inset/hover (`--secondary`, `--muted`,
  `--accent`) `0.28` ≈ `#292929`.
- **Teks off-white, bukan putih murni.** `--foreground` `0.985` → `0.93`
  ≈ `#e8e8e8`. Putih 100% di latar gelap memicu *halation* (teks tampak
  "bergetar") dan mempercepat kelelahan mata.
- **Border terlihat.** `--border` `1 0 0 / 10%` hanya **1.4:1** terhadap
  permukaan, nyaris tak terlihat. Dinaikkan ke `1 0 0 / 35%` ≈ **3.2:1**,
  memenuhi ambang 3:1 batas komponen WCAG 1.4.11 tanpa terasa seperti garis
  menyala. `--input` `1 0 0 / 40%`.
- **Desaturasi aksen ±12%.** `--main` `hsl(217,100%,66%)` → `hsl(217,88%,67%)`
  (`#619af5`). Warna jenuh penuh tampak menyala di latar gelap. Teks hitam di
  atasnya tetap 7.0:1. Ini **bukan** perubahan identitas: hue 217 tetap sama,
  hanya saturasi yang diturunkan di mode gelap (mode terang tidak disentuh).
- **Transisi halus antar mode.** Kelas `html.theme-transition` (dipasang-lepas
  oleh `theme-toggle.tsx` selama 240ms) menganimasikan `background-color`,
  `border-color`, `color`, `fill`, `stroke`, dan `box-shadow` 220ms. Sengaja
  dipasang-lepas, **bukan** transisi global, karena tema sudah benar sejak paint
  pertama, transisi global justru akan menganimasikan pemuatan awal dan
  memunculkan kedipan. Transisi dilewati bila pengguna meminta
  `prefers-reduced-motion`.
- `--overlay` (tirai panel geser) dipekatkan ke `oklch(0% 0 0 / 0.7)` dan
  `--shadow` dilunakkan ke `oklch(1 0 0 / 90%)` agar offset keras khas
  neobrutalisme tetap terbaca tanpa menyilaukan.

Kontras terverifikasi: seluruh pasangan teks/latar pada tangga ini ≥ 5.7:1
(ambang WCAG AA 4.5:1). Tidak ada aset gambar di aplikasi, jadi aturan "redupkan
gambar di mode gelap" dari skill tidak berlaku. Tidak ada warna Tailwind
hard-code (`bg-white`, `text-gray-*`, dst.) dan tidak ada varian `dark:` yang
tersisa, seluruh warna mengalir lewat token semantik, jadi pergantian tema
bebas tambalan.

## Aksesibilitas (audit UI/UX)

Diaudit terhadap kategori prioritas 1-2 (aksesibilitas, sentuhan/interaksi).
Dua perbaikan dieksekusi karena keduanya bug nyata di mode gelap / pengguna
yang meminta gerakan dikurangi:

- **Cincin fokus memakai token, bukan warna hard-code.** Sebelumnya `button.tsx`,
  `input.tsx`, `textarea.tsx`, dan `password-input.tsx` memakai
  `ring-black` + `ring-offset-white`. Di mode gelap cincin hitam nyaris tak
  terlihat di atas latar gelap, dan halo offset putih tetap menyala. Sekarang
  memakai `ring-ring` + `ring-offset-background` sehingga fokus selalu terbaca
  di kedua tema (WCAG 2.4.7 / 2.4.11).
- **`prefers-reduced-motion` dihormati.** `tw-animate-css` diimpor di
  `globals.css` dan token animasi (`--animate-slide-in-right`) sudah ada, tetapi
  tidak ada satu pun media query yang mematikan gerakan. Ditambahkan blok
  `@media (prefers-reduced-motion: reduce)` yang memangkas durasi ke nyaris nol
  (bukan `animation: none`, agar `fill-mode: forwards` tetap sampai keadaan
  akhir). WCAG 2.3.3.

Ditemukan tetapi **tidak** diubah: `icon-sm` = 36px, di bawah sasaran sentuh
44px yang disarankan Apple HIG. Ini **tetap patuh** WCAG 2.2 AA, yang hanya
menuntut 24×24 CSS px (kriteria 2.5.8), 44pt adalah pedoman native iOS/Android,
bukan ambang web. Karena kontrol ini hanya muncul di header/sidebar desktop
(penunjuk presisi), 36px diterima dan dicatat sebagai pengecualian resmi.

### Putaran kedua (crosscheck penuh 10 kategori)

Audit diperluas ke seluruh `quick-reference.md` (≈180 aturan, 10 kategori).
Hasil: mayoritas sudah sesuai. Tiga perbaikan tambahan dieksekusi:

- **`cursor-pointer` pada kontrol klik.** Tailwind v4 mengubah default `<button>`
  menjadi `cursor: default`, jadi tombol tampak tidak bisa diklik (aturan
  `cursor-pointer`). Ditambahkan di kelas dasar `button.tsx` dan pada dua `<button>`
  mentah di `docs-content.tsx`.
- **`touch-action: manipulation` di `button.tsx`.** Menghapus delay tap 300ms
  di layar sentuh (aturan `tap-delay`).
- **`export const viewport` eksplisit di `layout.tsx`.** Next.js sebenarnya sudah
  menyuntikkan viewport yang benar, jadi ini bukan bug, tetapi ekspor eksplisit
  mengunci `width=device-width, initial-scale=1` dan mencegah siapa pun
  menambahkan `maximum-scale`/`user-scalable=no` (pelanggaran WCAG 1.4.4).
  Sekaligus memberi `themeColor` untuk kedua tema (aturan `viewport-meta`).

Diterima sebagai pengecualian (bukan cacat): `icon-sm` 36px di atas; tidak ada
`role="button"` pada elemen non-fokusabel (tidak ada `<div onClick>`, semua
interaksi lewat `<button>`/`<a>` asli); tabel lebar sudah dibungkus
`role="region"` + `tabIndex={0}`.

## Kepadatan teks & hierarki (2026-11)

Keluhan pemilik: halaman terasa penuh teks yang harus dibaca sebelum bisa
bekerja. Perbaikan yang dipegang sekarang:

- **Satu kalimat pengantar per halaman.** Subjudul halaman maksimal satu baris
  pendek (mis. "Ringkasan absensi Anda"). Penjelasan cara kerja pindah ke
  `InfoHint` (ikon info + tooltip) atau `Disclosure` (bagian yang bisa
  dilipat), bukan paragraf di badan halaman.
- **Aksi utama menonjol, bukan setengah kolom.** Kartu "Kirim Absen Hari Ini"
  di dashboard memakai lebar penuh + `border-main`; kartu ringkasan lain
  memakai border biasa. Hierarki ditentukan oleh ukuran & posisi, bukan hanya
  warna.
- **Tidak ada informasi ganda.** Kartu "Status Hari Ini" kini hanya menjawab
  "hari ini sudah kirim belum"; rincian syarat (kredensial, token, template)
  pindah ke kartu "Kesiapan akun" yang punya progres + tautan perbaikan per
  poin. Satu fakta, satu tempat.
- **Navigasi dikelompokkan.** Sidebar memakai label grup (`Harian`,
  `Persiapan`, `Lainnya`, `Admin`) supaya 9–13 tautan bisa dipindai, bukan
  daftar rata. `activeHref` tetap menerima daftar rata, jadi aturan menu aktif
  tidak berubah.
- **Halaman Pengaturan dibagi dua bagian** (`Akun`, `Keamanan`) dengan judul
  kecil, agar empat kartu tidak tampak sederajat.

Batas yang tetap berlaku: pesan yang tampil ke pengguna tetap Bahasa Indonesia
sederhana tanpa jargon (AGENTS.md §3), dan penjelasan yang menyangkut keamanan
atau privasi **tidak boleh hilang**, hanya dipindah ke `InfoHint`/`Disclosure`
yang tetap bisa dibuka.

## Konsistensi label & kejujuran (2026-11)

Crosscheck menyeluruh menemukan beberapa ketidakcocokan yang sudah diperbaiki:

- **Kode status tidak lagi tampil mentah.** Hasil kirim di dashboard memakai
  label Indonesia (`Berhasil dikirim`, `Sudah pernah dikirim`, `Mode latihan`,
  …) dengan nada hijau/merah/netral, bukan `SUCCESS`/`DRY_RUN`. Status
  kredensial di halaman Kredensial memakai `describeCredentialStatus` yang sama
  dengan panel admin, bukan enum `ACTIVE`/`INVALID`.
- **Nama menu seragam.** Dokumentasi, landing, dan panduan memakai nama yang
  sama dengan sidebar: `Kredensial Monev`, `Otomasi`, `Kirim Absen Hari Ini`.
  Sebelumnya ada `Akun Monev`, `Jadwal Otomatis`, `Kirim Sekarang` yang membuat
  pengguna mencari menu yang tidak ada.
- **Tanggal libur tidak bisa memilih akhir pekan.** `<DatePicker unrestricted>`
  di `/admin/holidays` tetap menonaktifkan Sabtu/Minggu karena server menolak
  mendaftarkannya; sebelumnya pengguna bisa memilih lalu gagal saat menyimpan.
- **Dokumentasi publik jujur.** Klaim lama "tidak ada AI / integrasi GitHub"
  dihapus dari `/docs`, landing, dan FAQ; sekarang disebut apa adanya beserta
  batasnya (AI opsional + fallback lokal, git hanya baca). Kebijakan privasi
  menambahkan pengungkapan pengiriman kata kunci ke penyusun AI.
- **Ukuran & jarak halaman seragam.** Semua halaman terlindungi memakai
  `max-w-6xl px-4 py-8 sm:px-6 sm:py-10`, judul `text-2xl sm:text-3xl`, dan
  header `mb-6 sm:mb-8`, sehingga perpindahan antarhalaman tidak terasa
  "melompat".

## Mobile (2026-11)

Crosscheck khusus layar kecil menemukan dan memperbaiki:

- **Header publik tidak lagi meluap.** Nama brand di header landing, `/docs`,
  `/panduan`, panduan artikel, dan halaman legal disembunyikan di bawah `sm`
  (logo tetap tampil). Sebelumnya brand + 2–3 tombol melebihi lebar 320–375px.
- **Input tidak memicu auto-zoom iOS.** `Input`, `Textarea`, dan `NativeSelect`
  memakai `text-base` (16px) di mobile dan `sm:text-sm` di desktop. Font < 16px
  membuat Safari iOS memperbesar halaman saat kolom difokus.
- **Grafik tren tidak meluap.** Titik harian dikelompokkan menjadi maksimal 45
  batang (`bucketize` di `trend-chart.tsx`). Sebelumnya rentang 90 hari/1 tahun
  menghasilkan ratusan batang dengan celah tetap yang melebihi lebar layar.
- **Aksi utama selebar layar di mobile.** Tombol kirim absen, tombol banner
  dashboard, dan CTA landing memakai `w-full sm:w-auto` agar mudah dijangkau
  ibu jari.
- **Target sentuh lebih besar.** Menu sidebar `py-2.5`, tautan paginasi
  `min-h-10`, tombol Tutup/Kosongkan di date picker diberi padding, chip
  dokumentasi `py-2.5`.
- **Teks panjang tidak merusak tata letak.** Email, pesan audit, path/header
  diagnostik, dan isi template memakai `break-all`/`break-words`; email di
  profil & pengaturan juga.
- **Safe area.** Toast memakai `pb-safe` agar tidak tertutup home indicator;
  header, laci, jam, dan footer sudah memakainya.
- **Kalender lebih lega.** Padding kartu kalender dikurangi di mobile
  (`--card-spacing` 12px) supaya 7 kolom tanggal tidak terjepit.
- **Pemilih tanggal khusus** memakai `w-full sm:w-60` agar tidak melebihi lebar
  panel pada layar 320px.

## Visualisasi status (2026-11)

Bar chart diganti **kalender status** (`status-calendar.tsx`) karena datanya
biner:

- **Masalah bar chart:** tinggi batang mengodekan jumlah kiriman, padahal
  jumlahnya hampir selalu 0 atau 1 per hari. Semua batang jadi sama tinggi,
  hari kosong tampak seperti grafik rusak, dan akhir pekan tidak bisa dibedakan
  dari hari yang terlewat.
- **Kalender status:** satu kotak = satu hari, berisi **angka tanggal** dengan
  baris nama hari (Min–Sab), disusun **per bulan** memakai `buildMonthGrid`.
  Warna: hijau (berhasil), merah (gagal), kuning (sudah ada/duplikat), abu-abu
  (belum ada). Kotak "belum ada" di akhir pekan bergaris putus-putus; hari ini
  diberi cincin aksen.
- **Rentang filter:** 7 hari = 1 bulan, 30 hari = 1–2 bulan, 90 hari = 3–4
  bulan, 1 tahun = 13 bulan paling banyak (pola sama dengan kontribusi GitHub:
  banyak kalender kecil, bukan satu kisi raksasa). Tanggal di dalam bulan yang
  berada di luar rentang filter **diredupkan** dan tidak diwarnai, supaya tidak
  salah dibaca sebagai "belum pernah kirim".
- **Aksesibilitas:** setiap kotak membawa `title` (tanggal, status, rincian
  jumlah) dan teks `sr-only` berisi status, karena warna saja tidak terbaca
  pembaca layar. Ringkasan total juga disediakan sebagai teks tersembunyi.
  Rincian per hari tetap ada di `/history`.
- **Data:** `TrendPoint` kini juga membawa `duplicate`, sehingga status
  "sudah ada" tidak lagi tercampur dengan "gagal".

## Buku absen editorial (2026-11)

Arah baru untuk **seluruh tampilan**: aplikasi ini dibaca sebagai satu **buku
absen** yang dijilid rapi, bukan kumpulan widget. Sebelumnya hampir setiap blok
adalah kartu berbayang di dalam kartu lain, dengan pil, blur, dan angka raksasa
yang saling bersaing; hasilnya rapi per komponen tetapi tidak terbaca sebagai
dokumen.

Aturan yang mengikat sekarang:

1. **Satu bingkai per bagian.** Bagian halaman memakai
   `border-2 border-border bg-card` dengan **baris kepala** `border-b-2` berisi
   judul (`font-heading text-2xl leading-none`), bukan kartu berjudul kecil di
   dalam kartu lain. Contoh: kisi bulan di `/calendar` (nama bulan **adalah**
   judul bagian, sejajar dengan judul halaman).
2. **Label dibaca lebih dulu, angka menjawab.** Label memakai kicker
   `font-heading text-[0.6875rem] tracking-[0.14em] uppercase
   text-muted-foreground`; angka `font-heading text-2xl leading-none
   tabular-nums`. Dua bentuk yang sah: **baris** label–angka dalam satu bingkai
   (dashboard, `stats-cards.tsx`) dan **kolom** label di atas angka berpagar
   `border-t-2` (ringkasan `/admin` & `/history`). Keduanya menolak pola "angka
   raksasa + label kecil di bawahnya".
3. **Kepala kolom tabel satu gaya.** Setiap berkas bertabel punya satu konstanta
   `TH_CLASS` (`p-3 font-heading text-[0.6875rem] tracking-[0.14em]
   text-muted-foreground uppercase`), jadi tidak ada kepala kolom yang
   tertinggal gaya lama saat tabel disunting.
4. **Garis pemisah = tinta penuh.** Baris tabel dipisah `border-b border-border`
   (bukan `border-border/40`); bingkai bagian `border-2`. Buku besar tidak
   memudarkan garisnya.
5. **Penanda kecil berbentuk kotak.** Titik "hari ini", penanda "laporan sudah
   ada", dan butir daftar memakai `rounded-none`; sel kalender kosong memakai
   `border-muted-foreground` (token abu), bukan border yang diburamkan.
6. **Tanpa bayangan pada wadah, tanpa blur, tanpa gradien, tanpa animasi
   berulang.** `shadow-shadow` hanya milik elemen yang bisa ditekan (tombol,
   tautan berbentuk tombol). Jam dinding tidak lagi berdenyut; `loading.tsx`
   memakai `motion-safe:animate-pulse` sehingga `prefers-reduced-motion`
   dihormati.
7. **Afordansi memakai token warna, bukan transparansi.** `hover:opacity-80`
   diganti `hover:text-main`; latar redup memakai `bg-border` /
   `bg-muted-foreground`, bukan `bg-foreground/10`.

### Pengecualian yang disetujui pemilik (2026-11): lembar laporan di hero

Aturan 6 di atas tetap berlaku untuk **seluruh aplikasi**. Satu pengecualian
disetujui pemilik untuk **lembar laporan di hero landing** (`src/app/page.tsx`),
karena lembar itu bukan wadah berisi widget melainkan **benda** yang dijual
aplikasi ini. Batasnya mengikat:

1. **Kedalaman dari tumpukan, bukan bayangan.** Dua lembar `bg-card` bergeser
   12px/6px dan miring di bawah 1 derajat di belakang lembar utama. Tidak ada
   `shadow-shadow` di sini: bayangan keras tetap milik elemen yang bisa ditekan.
2. **Sudut terlipat = satu SVG 28×28**, lima bentuk datar: potongan warna
   kanvas (pojok yang terlipat), muka lipatan `fill-card`, dua garis pada sisi
   potongan, dan satu garis lipatan. Bukan gambar, bukan gradien, bukan blur.
3. **Gerak saat halaman dimuat hanya sekali**, tidak berulang: `animate-sheet`
   (lembar "diletakkan") dan `animate-stamp` (cap menghantam). Keduanya dipakai
   lewat prefiks `motion-safe:`, jadi pengguna yang memilih "kurangi gerakan"
   langsung melihat keadaan akhir tanpa menunggu durasi. Gerak yang dipicu
   sentuhan pengguna diatur terpisah di poin 6, bukan di sini.
4. **Kemiringan 3D hanya untuk mouse.** `Tilt` (`src/components/ui/tilt.tsx`)
   menolak `pointerType !== "mouse"`, menolak `(hover: none)`, dan menolak
   `prefers-reduced-motion: reduce`; maksimal 6 derajat. Transform ditulis
   langsung ke node (tanpa `setState`) supaya `pointermove` tidak merender ulang
   isi kartu.
5. **Jangan menyalin pola ini ke halaman lain.** Kalau lembar laporan muncul di
   tempat lain (mis. pratinjau di `/report-templates`), ia tetap kartu biasa.
   Pengecualian ini melekat pada hero, bukan pada komponennya.
6. **Gerak yang dipicu sentuhan (disetujui pemilik 2026-11, diperbarui 2026-11).**
   Hampir semua gerak di sini murni umpan balik dan hanya terjadi bila pengguna
   menyentuh lembar itu sendiri. **Satu pengecualian disetujui pemilik: lembar
   berganti sendiri tiap 6 detik** sampai pengguna menyentuhnya (lihat butir
   "Putar otomatis" di bawah). Komponennya `LandingReportSheet`
   (`src/components/landing-report-sheet.tsx`).
   - **Ketukan ATAU geseran memutar isinya ke lembar berikutnya**, seperti
     menaruh lembar depan ke belakang tumpukan. Tiga contoh, masing-masing
     dengan tanggal hari kerja yang berbeda (`recentWorkingDays` di
     `src/lib/landing-sheet-dates.ts`): satu hari tidak mungkin punya tiga
     laporan berbeda, jadi tanggalnya memang harus ikut berganti. Tanggal
     Sabtu/Minggu/libur nasional tidak pernah muncul, karena otomasi juga tidak
     pernah mengirim di hari itu.
   - **Putar otomatis tiap 6 detik — keputusan pemilik 2026-11.** Lembar
     berganti sendiri sampai pengguna menyentuh atau memfokuskannya. Ini
     **satu-satunya** gerak di aplikasi yang berjalan tanpa dipicu pengguna;
     jangan menyalakan pola serupa di halaman lain.
     - **Semua pagar ada di modul MURNI** `src/lib/landing-sheet-autoplay.ts`
       (`bolehJalanOtomatis`, 11 tes). Auto-rotate hanya berjalan bila: lebih
       dari satu lembar, `prefers-reduced-motion` tidak aktif, belum disentuh,
       tidak sedang digeser, dan tab sedang terlihat. Jangan menulis ulang
       syarat itu di komponen — satu pagar yang lupa diperiksa berarti teks
       berganti di bawah jari pengguna.
     - **TIDAK ada tombol kendali — keputusan pemilik 2026-11.** Versi pertama
       fitur ini memasang tombol "Jeda"/"Lanjutkan"/"Putar otomatis" (tuntutan
       WCAG 2.2.2 untuk konten bergerak > 5 detik). Pemilik memutuskan tombol
       itu **dihapus**: ia mengganggu tampilan hero dan menambah satu kontrol
       yang tidak dipakai siapa pun. Konsekuensinya diterima sadar: hero ini
       **tidak** memenuhi WCAG 2.2.2, dan itu satu-satunya penyimpangan
       aksesibilitas yang disetujui. Jangan menambahkan tombol itu kembali
       tanpa keputusan pemilik yang baru.
     - **Sentuhan atau fokus menghentikannya, dan ia tidak menyalakan sendiri
       lagi.** Fokus ikut menghentikan karena `AnimatePresence` memasang ulang
       lembar setiap indeks berganti: tanpa itu pengguna keyboard kehilangan
       posisi fokusnya tiap 6 detik. Karena tidak ada tombol, berhenti berarti
       berhenti permanen sampai halaman dimuat ulang — itulah harga yang
       ditukar dengan hilangnya tombol kendali.
     - **Timer tidak boleh memotong geseran.** Tick timer memeriksa
       `sedangGeser` (ref) dan `document.visibilityState`; keduanya sengaja
       TIDAK menjadi dependency efek, karena memasukkannya akan memasang ulang
       timer di tengah geseran. `ganti` dibungkus `useCallback` justru supaya
       timer tidak dipasang ulang tiap render — tanpa itu timer 6 detik tidak
       pernah sempat menyala.
   - **`motion` (framer-motion) DIPAKAI — keputusan pemilik 2026-11.** Ini satu-
     satunya dependensi animasi di proyek, dan satu-satunya tempat pemakaiannya.
     Alasannya geser-dengan-jari: pelacakan pointer, ambang lepas, dan pegas
     pemulihan tidak sepadan ditulis tangan. Harganya **sudah diukur, bukan
     diperkirakan**: JS rute `/` naik 219,3 → 267,2 KB gzip (**+47,9 KB, +22%**),
     rute lain **0 KB** karena komponen ini hanya diimpor `src/app/page.tsx`.
     Angka itu hasil build yang sama yang diukur dua kali (dengan dan tanpa
     `motion`), bukan perkiraan dari ukuran paket di npm.
     **Jangan menambah pemakaian `motion` di halaman lain** tanpa keputusan
     pemilik yang baru; kalau butuh animasi kecil di tempat lain, pakai CSS
     seperti biasa.
   - **Ambang geser ada di modul MURNI** `src/lib/landing-sheet-gesture.ts`
     (`arahGantiLembar`, 14 tes). Aturannya: kecepatan menang atas jarak
     (kibasan 20px yang cepat tetap dihitung, seretan lambat 40px dikembalikan),
     geser ke KIRI = lembar berikutnya, dan `NaN`/`Infinity` tidak mengubah apa
     pun. Jangan menaruh angka ambang di dalam komponen: itu satu-satunya bagian
     interaksi ini yang bisa salah tanpa terlihat di layar.
   - **Geseran yang batal tidak boleh ikut mengganti lembar.** Ketukan dideteksi
     dari `pointerup` + penanda `sedangGeser`, **bukan** `onClick` dan **bukan**
     `onTap`. Dua pendekatan pertama sudah dicoba dan **dua-duanya gagal, terukur
     di peramban**:
     (a) `click` peramban terpicu SEBELUM `onDragEnd`, sehingga penanda "sudah
     digeser" selalu terlambat dan satu geseran menghasilkan DUA pergantian
     lembar (1 → 3, bukan 1 → 2);
     (b) `onTap` milik `motion` **tidak** dibatalkan oleh drag (2 → 1 terukur),
     jadi tetap ada satu pergantian tambahan setelah setiap geseran.
     Pola yang dipakai sekarang tidak bergantung pada urutan peristiwa:
     `sedangGeser` dikosongkan di `onPointerDownCapture` (paling awal), dipasang
     di `onDragStart` (saat gerakan melewati ambang drag, jauh sebelum
     `pointerup`), lalu `onPointerUp` hanya mengganti lembar bila penanda masih
     kosong. Dua pagar tambahan: `pointerup` dengan tombol selain kiri diabaikan
     (klik kanan tidak memutar lembar), dan `pointercancel` memasang penanda
     (jari yang mulai menggulir halaman tidak dihitung sebagai ketukan).
     Jangan menggantinya kembali ke `onClick`/`onTap` + penanda `habisGeser`;
     ketiga pola itu sudah terbukti gagal.
   - **Cap "Terkirim" bukan lagi tombol sendiri.** Cap berdetak ulang tiap
     lembar berganti, karena laporan baru memang berarti cap baru. Dua sasaran
     ketukan pada satu benda membingungkan: pengguna tidak bisa menebak apakah
     ketukan akan mengganti lembar atau mengulang cap.
   - **Angkat 4px + miring 0,5° saat ditekan sudah dibuang.** Pergantian isi
     adalah umpan balik yang jauh lebih kuat. Sebagai gantinya kursor berubah
     `grab` → `grabbing` saat digeser, yang memberi tahu bahwa benda itu bisa
     dipindahkan.
   - **Batas yang TETAP berlaku: tidak pernah ada dua lembar berteks sekaligus.**
     Ini cacat yang sudah pernah diukur (lembar kedua yang masuk menutupi lembar
     pertama membuat teks terpotong di tengah kata). Pagarnya sekarang
     `AnimatePresence mode="wait"`: lembar baru baru dipasang setelah lembar lama
     selesai pergi (160ms). **Jangan diganti `mode="popLayout"` atau `"sync"`** —
     keduanya memudarkan dua teks bersamaan, persis cacat yang dilarang.
   - **Dua cara lembar pergi.** Dari ketukan: menyelinap ke bawah-kanan ke tempat
     tumpukan. Dari geseran: melanjutkan arah lemparan jari (`x` = 2,2× jarak
     geser), jadi terasa dilempar, bukan ditarik kembali. Keduanya berdurasi
     tetap, BUKAN pegas: `mode="wait"` menahan lembar baru selama itu berjalan,
     jadi pegas 400ms akan terasa seperti jeda kosong. Lembar yang MASUK memakai
     pegas (`stiffness` 420, `damping` 34) supaya terasa punya berat.
   - **`animate-sheet` dipasang di pembungkus, bukan di lembarnya.** Animasi itu
     mengunci `transform` dan `opacity` dengan `fill-mode: both`, jadi apa pun
     yang ditulis `motion` ke elemen yang sama tidak akan pernah terlihat.
     Karena itu `animate-sheet` tetap di `<div>` pembungkus, dan `motion`
     menggerakkan `<figure>` di dalamnya.
   - **Keyframe `sheet-back`/`sheet-forward` DIHAPUS** dari `globals.css` setelah
     `motion` mengambil alih. Jangan dihidupkan lagi: dua mesin animasi untuk
     satu gerak akan saling menimpa. `sheet`/`stamp` tetap ada karena keduanya
     gerak sekali saat halaman dimuat dan tidak butuh JavaScript.
   - **Petunjuk ketuk DIHAPUS (keputusan pemilik 2026-11).** Teks "Ketuk lembar
     untuk contoh lain · 1/3" beserta penghitungnya tidak ditampilkan lagi.
     Keterangan bahwa lembar bisa digeser/diketuk tetap tersedia untuk pembaca
     layar lewat `aria-label` pada `<figure>`, dan kursor berubah menjadi `grab`
     saat melintas di desktop. Jangan menambahkan kembali teks petunjuk di bawah
     lembar tanpa keputusan baru.
   - **`prefers-reduced-motion` tetap dipangkas**: `useReducedMotion()` membuat
     semua durasi animasi nol DAN mematikan geser (`drag={false}`), jadi isi
     lembar langsung berganti tanpa menunggu apa pun. Geser sengaja dimatikan,
     bukan hanya dipercepat: menyeret benda yang tidak mengikuti jari terasa
     rusak.

`Card` tetap dipakai untuk blok yang memang berdiri sendiri (mis. panel di
`/admin`), tetapi `CardTitle` kini `text-lg leading-tight` supaya hierarki
judul–isi tidak hilang saat judul tidak lagi raksasa.

## Status: perlu keputusan Anda

Tidak ada lagi keputusan yang memblokir. R-04 (ikon) dan R-21 (tema) sudah
diputuskan dan dieksekusi. Dial ENERGY 2 / RHYTHM 2 / MOTION 1 di atas masih
berstatus draf sampai Anda menyetujuinya secara eksplisit.
