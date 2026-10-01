# Panduan Memasang Cron (Per User), MagangHub Attendance

Cara menyambungkan **cron eksternal** (penabuh jadwal) ke webhook aplikasi ini,
supaya laporan absensi dikirim otomatis setiap hari.

> **Prasyarat:** aplikasi sudah di-deploy dan bisa diakses lewat HTTPS publik.
> Dokumen ini mulai dari "aplikasi sudah online".
>
> ⚠️ **Ini BUKAN cara yang direkomendasikan.** Cara utama & direkomendasikan
> adalah **dispatcher massal**, satu pemicu admin (GitHub Actions) mengabsen
> SEMUA user otomatis; user cukup menyalakan sakelar Otomasi, tanpa menyalin
> webhook apa pun. Lihat **`docs/CRON-BULK.md`** lebih dulu.
>
> Dokumen ini menyajikan **model per-user lama** (satu cron per user, dijaga
> `?key=<webhookKey>`). Tetap berlaku bila Anda memang butuh **ketepatan menit**
> (bulk mengabaikan menit dan berjalan per jam) atau ingin tiap user punya
> kendali penuh atas jadwalnya sendiri.
>
> ⏳ **DEPRECATION `?key=`:** mengirim rahasia di query string **akan dihapus
> pada 1 Januari 2026**. Setelah tanggal itu, hanya
> `Authorization: Bearer <webhookKey>` yang diterima. Selama masa transisi
> keduanya masih berlaku supaya cron yang sudah terpasang tidak mati mendadak.
> **Pasang cron baru langsung dengan header Bearer** (lihat §1), dan bila Anda
> punya cron lama ber-`?key=`, migrasikan ke header sebelum tanggal tersebut.
> Sumber kebenaran tanggal: `CRON_QUERY_KEY_REMOVAL_DATE` di
> `src/lib/bearer-token.ts`.

---

## 1. Apa yang sebenarnya terjadi

Web app ini **pasif** (lihat SPEC §6). Ia tidak punya proses yang menyala 24
jam. Yang menabuh adalah layanan cron pihak ketiga, tiap hari, dengan memanggil
satu URL:

```
GET https://<domain-anda>/api/cron/submit
Authorization: Bearer <webhookKey>          ← cara dianjurkan
```

Cara lama tetap didukung **sementara** (kompatibilitas mundur, **dihapus 1 Jan
2026** — lihat banner di atas):

```
GET https://<domain-anda>/api/cron/submit?key=<webhookKey>
```

> **Kenapa Bearer lebih baik:** rahasia di query string gampang tersimpan di
> log akses proxy/edge dan bisa bocor lewat `Referer`. Kirim lewat header bila
> layanan cron Anda mendukungnya. **Pakai header untuk pemasangan baru.** Kedua
> cara masih diterima sampai 1 Jan 2026 agar cron yang sudah terpasang tidak
> mati mendadak.

> Inilah **endpoint per-user**. Dispatcher massal memakai endpoint **lain**
> (`GET /api/cron/run-all`, dijaga header `Authorization: Bearer <CRON_SECRET>`
>, lihat `docs/CRON-BULK.md`). Keduanya memakai logika keputusan yang sama
> persis (`performSubmit`), jadi perilaku libur/kelengkapan identik.

Alur saat dipanggil:

1. **Cek kunci**, `Authorization: Bearer <webhookKey>` (atau `?key=` lama)
   dicocokkan dengan `webhookKey` milik Anda. Salah/kosong → `401` dengan pesan
   generik.
2. **Cek sakelar**, kalau `isEnabled = false` → `200 { skipped: true }`
   (bukan error; cron bebas memanggil tanpa tahu status).
3. **Cek policy**, hari libur atau program sudah berakhir → tidak dikirim.
4. **Cek gerbang**, bila `ALLOW_LIVE_SUBMIT` belum `1` → mode latihan
   (`dryRun: true`), jaringan tidak disentuh.
5. Kalau semua lolos → laporan dikirim ke portal Monev, dan **setiap percobaan
   dicatat** ke audit log dengan `trigger: CRON`.

**Penting:** cron hanya *memicu*. Ia tidak pernah "memutuskan" apa pun soal
libur/kelengkapan, semua keputusan ada di sisi server aplikasi.

---

## 2. Ambil URL webhook Anda

1. Buka **Dashboard → Otomasi Absensi** (`/automation`).
2. Di sana tertampil **URL webhook lengkap** dengan `webhookKey` Anda, siap
   disalin (tombol salin).
3. Set jam & menit yang Anda mau (zona **Asia/Jakarta**), lalu aktifkan sakelar.

`webhookKey` dibuat acak 32 byte saat pertama kali. Menyimpan pengaturan ulang
**tidak** mengubahnya. Bila kunci bocor, tekan **Ganti kunci webhook** di
halaman Otomasi: kunci baru diterbitkan, URL lama langsung mati, lalu salin URL
baru ke layanan cron Anda.

---

## 3. Pilih layanan cron

| Layanan | Gratis | Terbaik untuk |
| :--- | :--- | :--- |
| **cron-job.org** | Ya | Paling mudah; antarmuka web. **Disarankan** untuk jalur per-user ini. |
| **GitHub Actions** | Ya (repo publik; kuota menit terbatas) | Kalau Anda sudah pakai GitHub. |
| **crontab** VPS/server sendiri | Sesuai server | Kalau punya server yang selalu nyala. |

> **Tidak ada fallback:** bila layanan cron mati, absen terjadwal per-user ini
> tidak jalan. (Jalur dispatcher massal punya nasib yang sama, pemicunya tetap
> harus hidup.) Pilihan utama proyek ini sebenarnya adalah **dispatcher massal**
> (`docs/CRON-BULK.md`); spesifikasi awal (SPEC §15) menyebut cron-job.org
> sebagai pilihan utama untuk **model per-user** yang dijelaskan di sini.

---

## 4A. Memasang di cron-job.org (disarankan)

1. Daftar/masuk di <https://cron-job.org>.
2. **Create cronjob**.
3. **Title**: `Absensi Monev harian`.
4. **URL**: tempel URL webhook dari langkah 2. **Cara dianjurkan:** basiskan URL
   **tanpa** `?key=...` (mis. `https://<domain-anda>/api/cron/submit`) lalu isi
   kunci di bagian **Headers** cron-job.org sebagai
   `Authorization: Bearer <webhookKey>`. Cara lama (menempel `?key=...` langsung
   di URL) masih boleh sampai 1 Jan 2026, tetapi hindari untuk pemasangan baru.
5. **Schedule**: pilih setiap hari, jam sesuai pengaturan di aplikasi.
   **Perhatikan zona waktu**, cron-job.org memakai UTC secara default. Jam
   `07:30 WIB` = `00:30 UTC`. Set zona waktu akun ke `Asia/Jakarta` bila
   tersedia, atau hitung manual (WIB = UTC+7).
6. **Request method**: `GET`.
7. Simpan, lalu tekan **TEST RUN** sekali untuk memastikan responsnya `200`.

---

## 4B. Memasang di GitHub Actions

Simpan sebagai `.github/workflows/absen.yml` (di repo Anda, **bukan** repo ini
kalau kredensial ada di sini):

```yaml
name: Absensi Monev Harian
on:
  schedule:
    # 00:30 UTC = 07:30 WIB. GitHub Actions SELALU memakai UTC.
    - cron: "30 0 * * *"
  workflow_dispatch: {}   # tombol "Run workflow" untuk uji manual
jobs:
  panggil:
    runs-on: ubuntu-latest
    steps:
      - name: Panggil webhook
        run: |
          curl -sS -o /dev/null -w "%{http_code}\n" \
            "${{ secrets.MONEV_WEBHOOK_URL }}"
```

Simpan URL webhook Anda sebagai **Secret** repo bernama `MONEV_WEBHOOK_URL`
(Settings → Secrets and variables → Actions). Jangan pernah menaruhnya sebagai
teks biasa di workflow, siapa pun yang bisa melihat repo bisa membaca URL itu.

> Catatan: job terjadiwal di GitHub Actions bisa tertunda beberapa menit saat
> beban tinggi. Untuk absensi harian ini biasanya tidak masalah.

---

## 4C. Memasang dengan crontab

Di server yang selalu nyala:

```cron
# m   h   dom mon dow   perintah
# 07:30 WIB setiap hari (server di zona Asia/Jakarta)
# Cara dianjurkan, kunci lewat header (tidak muncul di log URL):
30 7 * * * curl -sS -o /dev/null -H "Authorization: Bearer <webhookKey>" "https://<domain-anda>/api/cron/submit"
# Cara lama (masih didukung sampai 1 Jan 2026, lalu DIHAPUS):
# 30 7 * * * curl -sS -o /dev/null "https://<domain-anda>/api/cron/submit?key=<webhookKey>"
```

Bila server memakai UTC, jadwalnya jadi `30 0 * * *`.

---

## 5. Menafsirkan respons

| HTTP | Arti | Tindakan |
| :--- | :--- | :--- |
| `200 { ok: true, status: "SUCCESS" }` | Terkirim ke portal. | - |
| `200 { dryRun: true, status: "DRY_RUN" }` | Belum `ALLOW_LIVE_SUBMIT=1`. | Nyalakan gerbang bila sudah siap. |
| `200 { skipped: true }` | Otomasi nonaktif, **atau** libur/program berakhir. | Cek `reason` di body. |
| `200 { ok: false, status: "DUPLICATE" }` | Laporan tanggal itu sudah ada di portal. | Normal. |
| `200 { ok: false, status: "ALREADY_SUBMITTED" }` | Pra-cek `GET /daily-logs` menemukan laporan tanggal itu **sudah ada** (mis. diisi manual lewat UI portal) → kirim dibatalkan agar tidak menimpa. | Normal, tidak perlu tindakan. |
| `200 { ok: false, status: "FAILED" }` | Token tidak terbaca / sesi Monev mati, **atau** pra-cek duplikat tak bisa dipastikan (jaringan/401) sehingga kirim dibatalkan demi aman. | Bila sebabnya sesi: login ulang di portal, tempel token baru. Bila pra-cek gagal: cek koneksi portal, coba lagi jam berikutnya. |
| `401` | Kunci salah/kosong. | Salin ulang `webhookKey` dari dashboard (atau pakai header Bearer). |
| `400` | Rahasia kosong / tanggal tidak sah. | Perbaiki URL/header cron. |
| `429` | Kena rate limit (30/5 menit per IP). | Kurangi frekuensi; bukan aktivitas normal. |

> **Perhatikan:** kegagalan *submisi* tidak pernah memakai kode HTTP gagal,
> semuanya `200` dengan `ok: false`. Hanya masalah **kunci/format** (`400`,
> `401`) dan **rate limit** (`429`) yang memakai kode non-200. Alasannya sama
> seperti di atas: cron eksternal tidak bisa menafsirkan status aneh.
>
> **`429` hanya berlaku di `/api/cron/submit` (per-user).** Dispatcher massal
> (`/api/cron/run-all`) **tidak** memakai rate limit, ia dijaga `CRON_SECRET`
> dan memang dipanggil tiap jam, jadi penghitung per-IP akan salah menolaknya.

**Cron eksternal hanya memahami kode HTTP.** Karena itu "tidak ada yang dikirim
hari ini" tetap `200`, bukan error, agar cron tidak panik dan tidak mengirim
peringatan palsu tiap akhir pekan. **Setiap percobaan tetap tercatat** ke
Riwayat, jadi kebenaran sesungguhnya selalu ada di audit log, bukan di kode
HTTP.

---

## 6. Uji coba (urutan aman)

1. Biarkan `ALLOW_LIVE_SUBMIT` **kosong**. Panggil webhook dari browser atau
   `curl`. Harusnya `200` dengan `dryRun: true`, membuktikan kunci & policy
   jalan tanpa menyentuh portal.
2. Set `ALLOW_LIVE_SUBMIT=1` **hanya** saat benar-benar siap.
3. Tekan **TEST RUN** di cron-job.org sekali, lalu periksa
   **Dashboard → Riwayat** untuk memastikan baris ber-`trigger: CRON` muncul.

---

## 7. Kalau sesuatu tidak jalan

- **`401` terus** → kunci salah ketik/kepotong. Salin ulang dari dashboard.
- **`200` tapi tidak pernah `SUCCESS`** → cek **Riwayat**; biasanya policy
  (libur/akhir program) atau token Monev kedaluwarsa (login ulang di portal,
  tempel token baru di menu Kredensial).
- **Tidak pernah terpanggil** → periksa zona waktu layanan cron (UTC vs WIB)
  dan pastikan job diaktifkan.
- **`429` padahal baru sekali** → IP bersama (mis. proxy) kena batas. Sesuaikan
  jadwal atau pasang Upstash (lihat `.env.example`) agar penghitung akurat
  lintas instance.

> **Lelah menyiapkan satu cron per user?** Itulah alasan dispatcher massal ada.
> Lihat `docs/CRON-BULK.md`: satu pemicu (GitHub Actions atau tombol admin)
> mengabsen semua user yang sakelar Otomasinya menyala, tidak ada `webhookKey`
> yang perlu disalin.
