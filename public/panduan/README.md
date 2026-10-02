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
- **Privasi (penting):** sebelum menaruh gambar, **jangan** biarkan terlihat
  nama/email akun Anda, nilai token yang sebenarnya, atau data pribadi lain.
  Blur atau tutup bagian itu. Nilai token di gambar akan tersimpan di repo
  publik dan itu sama dengan membocorkan sesi 30 hari.
- **Keterbacaan:** cukup lebar agar tab **Application**, opsi **Show
  URL-decoded**, dan nama kolom (Name/Value) terbaca saat gambar diperkecil di
  layar ponsel. Bila perlu, potong (crop) hanya area panel Cookies.

## Catatan

Gambar dirender lewat `next/image` (statis lokal), jadi dimensi tertahan dan
pemuatan malas tetap aktif tanpa konfigurasi loader tambahan. Karena proyek ini
sebelumnya tidak memiliki aset gambar, bila kelak gambar dihapus, ingat untuk
menghapus blok `jenis: "gambar"` yang menunjuknya di `src/lib/guides.ts`.
