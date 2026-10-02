# Gambar panduan

Folder ini menyimpan tangkapan layar yang dipakai di halaman
`/panduan/ambil-token-monev-devtools`.

## Cara memakai

Taruh berkas di bawah dengan nama yang persis seperti ini. Tidak perlu
mengubah kode; `src/lib/guides.ts` sudah menunjuk ke path ini.

| Berkas | Isi |
| :-- | :-- |
| `devtools-1-buka.webp` | Langkah 1: DevTools baru dibuka (F12), tab **Application** aktif, bagian **Cookies** terlihat di panel kiri. |
| `devtools-2-buka.webp` | Langkah 2: bagian **Storage > Cookies** di panel kiri, lalu pilih domain `monev.maganghub.kemnaker.go.id`. |
| `devtools-3-buka.webp` | Langkah 3: baris `monev_refresh_token` terpilih, isi kolom **Value** siap disalin. |

## Ketentuan gambar

- **Format:** WebP atau PNG (keduanya diterima oleh `next/image`). Ukuran
  tampil sekitar 1236x930 (nisbah mendekati 4:3). Setiap blok `jenis: "gambar"`
  di `src/lib/guides.ts` memakai dimensi intrinsik aslinya agar tidak gepeng;
  bila Anda mengganti gambar dengan nisbah berbeda, sesuaikan `lebar`/`tinggi`
  di blok yang bersangkutan.
- **Privasi (penting — pernah terjadi insiden):** sebelum menaruh gambar,
  **jangan** biarkan terlihat nama/email akun Anda, nilai token yang sebenarnya,
  atau data pribadi lain. Blur atau tutup bagian itu. Nilai token di gambar akan
  tersimpan di repo **publik** dan itu sama dengan membocorkan sesi 30 hari.

  > ⚠️ **Riwayat:** gambar `devtools-3-buka.webp` pernah ter-commit **dengan
  > nilai refresh token yang masih asli** (commit `0edfdf8`) ke repo publik ini.
  > Token itu harus dianggap bocor dan **sudah wajib diganti** (login ulang di
  > portal). Bersih-bersih git tidak menarik kembali apa yang sudah ter-push —
  > hanya rotasi token di server yang membatalkannya.

- **Cara aman mengambil gambar (pilih salah satu):**
  1. **Setel dulu nilainya jadi `REDACTED`** di DevTools sebelum memotret —
     double-klik kolom **Value**, timpa dengan `REDACTED`, baru tangkap layar.
     Cara ini paling aman karena token asli tak pernah masuk ke piksel.
  2. **Sensor seluruh panel "Cookie Value"** (blok hitam) setelah memotret.
  3. Bila karena suatu alasan gambar mentah harus disimpan dulu sebagai file
     kerja, beri nama dengan akhiran yang di-`gitignore` (mis.
     `devtools-3-buka-raw.webp` atau taruh di `public/panduan/mentah/`), lalu
     **baru** ekspor versi bersihnya ke nama final `devtools-3-buka.webp`.
     Pola nama itu ada di `.gitignore` justru agar tidak ikut ter-commit.
- **Verifikasi sebelum commit:** pastikan file yang akan di-commit **tidak**
  memuat nilai token. Ukuran/`LastWriteTime` gambar harus berubah setelah
  disanitasi — kalau angkanya tetap sama seperti file mentah, berarti ekspor
  bersihnya belum benar-benar menimpa berkasnya.
- **Keterbacaan:** cukup lebar agar tab **Application**, opsi **Show
  URL-decoded**, dan nama kolom (Name/Value) terbaca saat gambar diperkecil di
  layar ponsel. Bila perlu, potong (crop) hanya area panel Cookies.

## Catatan

Gambar dirender lewat `next/image` (statis lokal), jadi dimensi tertahan dan
pemuatan malas tetap aktif tanpa konfigurasi loader tambahan. Karena proyek ini
sebelumnya tidak memiliki aset gambar, bila kelak gambar dihapus, ingat untuk
menghapus blok `jenis: "gambar"` yang menunjuknya di `src/lib/guides.ts`.
