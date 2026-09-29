# Panduan Memasang Cron — MagangHub Attendance

Cara menyambungkan **cron eksternal** (penabuh jadwal) ke webhook aplikasi ini,
supaya laporan absensi dikirim otomatis setiap hari.

> **Prasyarat:** aplikasi sudah di-deploy dan bisa diakses lewat HTTPS publik.
> Dokumen ini mulai dari "aplikasi sudah online".

---

## 1. Apa yang sebenarnya terjadi

Web app ini **pasif** (lihat SPEC §6). Ia tidak punya proses yang menyala 24
jam. Yang menabuh adalah layanan cron pihak ketiga, tiap hari, dengan memanggil
satu URL:

```
GET https://<domain-anda>/api/cron/submit?key=<webhookKey>
```

Alur saat dipanggil:

1. **Cek kunci** — `key` dicocokkan dengan `webhookKey` milik Anda. Salah/kosong
   → `401` dengan pesan generik.
2. **Cek sakelar** — kalau `isEnabled = false` → `200 { skipped: true }`
   (bukan error; cron bebas memanggil tanpa tahu status).
3. **Cek policy** — hari libur atau program sudah berakhir → tidak dikirim.
4. **Cek gerbang** — bila `ALLOW_LIVE_SUBMIT` belum `1` → mode latihan
   (`dryRun: true`), jaringan tidak disentuh.
5. Kalau semua lolos → laporan dikirim ke portal Monev, dan **setiap percobaan
   dicatat** ke audit log dengan `trigger: CRON`.

**Penting:** cron hanya *memicu*. Ia tidak pernah "memutuskan" apa pun soal
libur/kelengkapan — semua keputusan ada di sisi server aplikasi.

---

## 2. Ambil URL webhook Anda

1. Buka **Dashboard → Otomasi Absensi** (`/dashboard/automation`).
2. Di sana tertampil **URL webhook lengkap** dengan `webhookKey` Anda, siap
   disalin (tombol salin).
3. Set jam & menit yang Anda mau (zona **Asia/Jakarta**), lalu aktifkan sakelar.

`webhookKey` dibuat acak 32 byte saat pertama kali dan **tidak pernah berputar
sendiri**. Menyimpan pengaturan ulang tidak mengubahnya.

---

## 3. Pilih layanan cron

| Layanan | Gratis | Terbaik untuk |
| :--- | :--- | :--- |
| **cron-job.org** | Ya | Paling mudah; antarmuka web. **Disarankan.** |
| **GitHub Actions** | Ya (repo publik; kuota menit terbatas) | Kalau Anda sudah pakai GitHub. |
| **crontab** VPS/server sendiri | Sesuai server | Kalau punya server yang selalu nyala. |

> SPEC §15 menetapkan **cron-job.org** sebagai pilihan utama. Tidak ada
> fallback: bila layanan cron mati, absen terjadwal tidak jalan.

---

## 4A. Memasang di cron-job.org (disarankan)

1. Daftar/masuk di <https://cron-job.org>.
2. **Create cronjob**.
3. **Title**: `Absensi Monev harian`.
4. **URL**: tempel URL webhook dari langkah 2 — **termasuk** `?key=...`.
5. **Schedule**: pilih setiap hari, jam sesuai pengaturan di aplikasi.
   **Perhatikan zona waktu** — cron-job.org memakai UTC secara default. Jam
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
teks biasa di workflow — siapa pun yang bisa melihat repo bisa membaca URL itu.

> Catatan: job terjadiwal di GitHub Actions bisa tertunda beberapa menit saat
> beban tinggi. Untuk absensi harian ini biasanya tidak masalah.

---

## 4C. Memasang dengan crontab

Di server yang selalu nyala:

```cron
# m   h   dom mon dow   perintah
# 07:30 WIB setiap hari (server di zona Asia/Jakarta)
30 7 * * * curl -sS -o /dev/null "https://<domain-anda>/api/cron/submit?key=<webhookKey>"
```

Bila server memakai UTC, jadwalnya jadi `30 0 * * *`.

---

## 5. Menafsirkan respons

| HTTP | Arti | Tindakan |
| :--- | :--- | :--- |
| `200 { ok: true, status: "SUCCESS" }` | Terkirim ke portal. | — |
| `200 { dryRun: true, status: "DRY_RUN" }` | Belum `ALLOW_LIVE_SUBMIT=1`. | Nyalakan gerbang bila sudah siap. |
| `200 { skipped: true }` | Otomasi nonaktif, **atau** libur/program berakhir. | Cek `reason` di body. |
| `200 { ok: false, status: "DUPLICATE" }` | Laporan tanggal itu sudah ada di portal. | Normal. |
| `200 { ok: false, status: "FAILED" }` | Token tidak terbaca / sesi Monev mati. | Login ulang di portal, tempel token baru. |
| `401` | Kunci salah/kosong. | Salin ulang `webhookKey` dari dashboard. |
| `400` | `key` kosong / tanggal tidak sah. | Perbaiki URL cron. |
| `429` | Kena rate limit (30/5 menit per IP). | Kurangi frekuensi; bukan aktivitas normal. |

> **Perhatikan:** kegagalan *submisi* tidak pernah memakai kode HTTP gagal —
> semuanya `200` dengan `ok: false`. Hanya masalah **kunci/format** (`400`,
> `401`) dan **rate limit** (`429`) yang memakai kode non-200. Alasannya sama
> seperti di atas: cron eksternal tidak bisa menafsirkan status aneh.

**Cron eksternal hanya memahami kode HTTP.** Karena itu "tidak ada yang dikirim
hari ini" tetap `200`, bukan error — agar cron tidak panik dan tidak mengirim
peringatan palsu tiap akhir pekan. **Setiap percobaan tetap tercatat** ke
Riwayat, jadi kebenaran sesungguhnya selalu ada di audit log, bukan di kode
HTTP.

---

## 6. Uji coba (urutan aman)

1. Biarkan `ALLOW_LIVE_SUBMIT` **kosong**. Panggil webhook dari browser atau
   `curl`. Harusnya `200` dengan `dryRun: true` — membuktikan kunci & policy
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
