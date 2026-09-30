# DESIGN.md — MagangHub Absensi

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
- Penyesuaian mode gelap yang ikut diambil: `--shadow` diikat ke putih penuh
  (bukan turunan `--border` yang jadi 10% dan membuat shadow keras hilang), dan
  warna scrollbar kini memakai token (`--secondary-background` / `--border`)
  alih-alih putih/hitam hard-code.

## Status: perlu keputusan Anda

Tidak ada lagi keputusan yang memblokir. R-04 (ikon) dan R-21 (tema) sudah
diputuskan dan dieksekusi. Dial ENERGY 2 / RHYTHM 2 / MOTION 1 di atas masih
berstatus draf sampai Anda menyetujuinya secara eksplisit.
