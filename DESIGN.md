# DESIGN.md — MagangHub Autoabsen

Arah desain ini disusun dari UI yang **sudah ada** (`src/app/globals.css`,
`src/app/page.tsx`, `src/components/ui/button.tsx`), bukan dikarang dari nol.
Semua nilai di bawah bisa ditelusuri ke token nyata di repo. Status: **draf untuk
disetujui** — selama belum disetujui, setiap UI yang saya bangun diberi label
*"draf tanpa arah"* (R-37).

## Dial

```
Dial: ENERGY 2 / RHYTHM 2 / MOTION 1
```

Alasan satu baris per dial:

- **ENERGY 2** — ini alat internal untuk peserta magang, bukan portofolio agensi:
  harus terasa hidup lewat warna dan blok tebal, tapi tidak berteriak. Anchor
  rasa: antara GOV.UK dan Stripe.
- **RHYTHM 2** — halaman butuh irama yang konsisten dengan beberapa jeda (blok
  CTA penuh warna, strip langkah bernomor), bukan grid seragam total.
- **MOTION 1** — pengguna membuka ini saat buru-buru mengisi logbook; animasi
  hanya boleh jadi umpan balik (hover, focus), bukan tontonan.

## Bahasa visual (dipilih dari aset yang sudah dipakai)

Gaya yang sudah tertanam di `globals.css` adalah **neo-brutalist terkendali**:
border 2px hitam, shadow keras tanpa blur (`--shadow: 4px 4px 0px 0px black`),
radius kecil (`--radius-base: 5px`), dan satu warna aksen biru terang.

| Keputusan | Nilai | Alasan satu baris (R-31) |
|---|---|---|
| Warna inti | netral (putih/hitam/abu) + biru `hsl(217,100%,66%)` (`--main`) | Identitas aplikasi sudah ditentukan token `--main`; netral menjaga tabel absensi tetap terbaca. |
| Warna status | `--success` hijau `#059669` | Satu-satunya warna semantik; dipakai untuk status "terkirim", bukan dekorasi. |
| Aksen | biru `--main` saja | Satu aksen yang dipakai hemat di tombol utama dan blok CTA. |
| Tipografi | Inter (satu keluarga, via `--font-sans`) | Angka absensi harus jelas di ukuran kecil; satu keluarga mengurangi noise. |
| Radius | `--radius-base` 5px, konsisten | Radius kecil seragam menandai gaya border-tebal; bukan pill serba bulat. |
| Elevasi | shadow keras hanya pada elemen yang bisa ditekan (tombol, kartu tautan) | Menandai "ini bisa diklik", bukan membuat semua elemen melayang. |
| Latar | `--secondary-background` putih dengan latar halaman biru muda `hsl(214,95%,93%)` | Memisahkan kanvas dari kartu tanpa perlu gradien. |

**Dose caps yang mengikat** (dari aturan anti-slop):
- Tanpa gradien dekoratif. Warna datar + border tebal sudah jadi identitas.
- Shadow keras maksimal 1 level; tidak ada glow di kartu + tombol + badge sekaligus.
- Radius tidak boleh serba pill: `rounded-base` untuk hampir semua, `rounded-full`
  hanya untuk avatar dan indikator status titik.
- Maksimum 3 warna inti + 1 aksen di satu halaman.

## Suara (voice)

Tulis sebagai rekan kerja yang menjelaskan alat, bukan pemasar. Kalimat pendek,
kata kerja konkret, angka yang bisa dicek.

- **Larang** (R-16): "AI Powered", "Seamless", "Revolutionary", "Cutting Edge",
  "Powerful", "Effortless", "Next Generation".
- **Larang** (R-02): em dash `—` di seluruh teks yang tampil ke pengguna.
- **CTA** harus menyebut aksi nyatanya (R-15): "Simpan template", "Kirim sekarang",
  "Hubungkan akun Monev" — bukan "Get Started" / "Learn More".
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
- Nilai awal dipasang **sebelum paint** lewat skrip inline kecil di
  `src/app/layout.tsx` (baca `localStorage["theme"]`, jatuh ke
  `prefers-color-scheme`) supaya tidak ada kedipan putih. Komponen
  `src/components/theme-toggle.tsx` hanya menyinkronkan setelahnya.
- Tanpa paket baru. Tema mengandalkan blok `.dark` yang sudah ada di
  `globals.css`.
- Penyesuaian mode gelap yang ikut diambil: `--shadow` diikat ke putih 90%
  (bukan turunan `--border` yang jadi terlalu tipis dan membuat shadow keras
  hilang, sekaligus tidak sekeras putih 100%), dan warna scrollbar kini memakai
  token (`--secondary-background` / `--border`) alih-alih putih/hitam hard-code.
- **Perbaikan (bug "mode gelap tetap putih semua"):** blok `.dark` dulu hanya
  meng-override sebagian token `:root`. Token `--secondary-background` — dipakai
  oleh `bg-secondary-background` di kartu, panel hero, footer, `input`,
  `textarea`, dan tombol varian `neutral` — **tidak punya pasangan gelap**, jadi
  tetap `oklch(100% 0 0)` (putih penuh) dan menutupi latar gelap di belakangnya.
  Sekarang `.dark` menetapkan `--secondary-background` (disejajarkan dengan
  `--card`) dan `--chart-active-dot` (titik penanda grafik hitam tidak terbaca di
  latar gelap).

### Penyempurnaan mode gelap (skill `dark-mode-design`)

Palet gelap disusun ulang mengikuti prinsip *surface elevation* — bukan sekadar
pembalikan warna terang — lewat skill `dark-mode-design`
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
  permukaan — nyaris tak terlihat. Dinaikkan ke `1 0 0 / 35%` ≈ **3.2:1**,
  memenuhi ambang 3:1 batas komponen WCAG 1.4.11 tanpa terasa seperti garis
  menyala. `--input` `1 0 0 / 40%`.
- **Desaturasi aksen ±12%.** `--main` `hsl(217,100%,66%)` → `hsl(217,88%,67%)`
  (`#619af5`). Warna jenuh penuh tampak menyala di latar gelap. Teks hitam di
  atasnya tetap 7.0:1. Ini **bukan** perubahan identitas: hue 217 tetap sama,
  hanya saturasi yang diturunkan di mode gelap (mode terang tidak disentuh).
- **Transisi halus antar mode.** Kelas `html.theme-transition` (dipasang-lepas
  oleh `theme-toggle.tsx` selama 240ms) menganimasikan `background-color`,
  `border-color`, `color`, `fill`, `stroke`, dan `box-shadow` 220ms. Sengaja
  dipasang-lepas, **bukan** transisi global, karena skrip anti-flicker memasang
  `.dark` sebelum paint pertama — transisi global justru akan menganimasikan
  pemuatan awal dan memunculkan kedipan. Transisi dilewati bila pengguna meminta
  `prefers-reduced-motion`.
- `--overlay` (tirai panel geser) dipekatkan ke `oklch(0% 0 0 / 0.7)` dan
  `--shadow` dilunakkan ke `oklch(1 0 0 / 90%)` agar offset keras khas
  neobrutalisme tetap terbaca tanpa menyilaukan.

Kontras terverifikasi: seluruh pasangan teks/latar pada tangga ini ≥ 5.7:1
(ambang WCAG AA 4.5:1). Tidak ada aset gambar di aplikasi, jadi aturan "redupkan
gambar di mode gelap" dari skill tidak berlaku. Tidak ada warna Tailwind
hard-code (`bg-white`, `text-gray-*`, dst.) dan tidak ada varian `dark:` yang
tersisa — seluruh warna mengalir lewat token semantik, jadi pergantian tema
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
menuntut 24×24 CSS px (kriteria 2.5.8) — 44pt adalah pedoman native iOS/Android,
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
  menyuntikkan viewport yang benar, jadi ini bukan bug — tetapi ekspor eksplisit
  mengunci `width=device-width, initial-scale=1` dan mencegah siapa pun
  menambahkan `maximum-scale`/`user-scalable=no` (pelanggaran WCAG 1.4.4).
  Sekaligus memberi `themeColor` untuk kedua tema (aturan `viewport-meta`).

Diterima sebagai pengecualian (bukan cacat): `icon-sm` 36px di atas; tidak ada
`role="button"` pada elemen non-fokusabel (tidak ada `<div onClick>` — semua
interaksi lewat `<button>`/`<a>` asli); tabel lebar sudah dibungkus
`role="region"` + `tabIndex={0}`.

## Status: perlu keputusan Anda

Tidak ada lagi keputusan yang memblokir. R-04 (ikon) dan R-21 (tema) sudah
diputuskan dan dieksekusi. Dial ENERGY 2 / RHYTHM 2 / MOTION 1 di atas masih
berstatus draf sampai Anda menyetujuinya secara eksplisit.
