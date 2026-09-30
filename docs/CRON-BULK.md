# Panduan Cron Massal (Dispatcher) — Tanpa Setup per User

Cara membuat **satu** pemicu admin yang mengabsen **semua** user otomatis,
sehingga tiap user **tidak perlu** menyalin webhook maupun memasang cron
sendiri. Cukup nyalakan sakelar Otomasi di dashboard.

> **Prasyarat:** aplikasi sudah di-deploy (HTTPS publik) dan repo ada di GitHub.
> Kalau Anda lebih suka cara lama (satu cron per user), lihat `CRON-SETUP.md`.

---

## 1. Cara kerjanya (singkat)

```
GitHub Actions (1 workflow, tiap jam)
        │  Authorization: Bearer <CRON_SECRET>
        ▼
GET /api/cron/run-all
        │
        ├─ ambil semua AutomationConfig.isEnabled = true
        ├─ pilih yang jam jadwalnya (WIB) = jam sekarang
        ├─ jalankan performSubmit untuk tiap user (paralel berbatas)
        └─ balas ringkasan: { considered, processed, deferred, results }
```

- **Jadwal per-user tetap dihormati.** Cron berjalan tiap jam; server hanya
  memproses user yang jam jadwalnya sama dengan jam sekarang.
- **Menit diabaikan.** Jadwal `07:30` diproses kapan saja antara 07:00–07:59 WIB.
  Absensi harian tidak butuh ketepatan menit, dan menuntutnya membuat jadwal
  `07:30` tak pernah kena pada cron per jam.
- **Satu user gagal tidak menggagalkan yang lain** (tiap user dibungkus
  `try/catch`).
- **Bisa juga dipicu dari aplikasi.** Selain GitHub Actions, admin yang sudah
  login dapat menekan **Jalankan sekarang** di **Panel Admin** — memanggil logika
  yang sama (`POST /api/admin/dispatch`, dijaga sesi + role ADMIN). Berguna untuk
  menguji atau mengejar ketertinggalan tanpa membuka GitHub. Seleksi user tetap
  di server: hanya yang jam jadwalnya = jam sekarang yang diproses.

---

## 2. Buat `CRON_SECRET`

Hasilkan nilai acak 32 byte:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Simpan nilainya — dipakai di **dua** tempat (Vercel & GitHub), harus sama persis.

---

## 3. Set di Vercel

1. Vercel → proyek → **Settings → Environment Variables**.
2. Tambah `CRON_SECRET` = nilai dari langkah 2 (semua environment).
3. **Redeploy** agar terbaca.

> Bila `CRON_SECRET` kosong, endpoint `/api/cron/run-all` membalas `503` dan
> fitur massal nonaktif — aplikasi lain tetap jalan normal.

---

## 4. Set di GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Nama | Nilai |
| :--- | :--- |
| `APP_URL` | URL deploy, mis. `https://maganghub-xyz.vercel.app` (**tanpa** slash di akhir) |
| `CRON_SECRET` | sama persis dengan langkah 2 |

Workflow `.github/workflows/absensi-dispatch.yml` sudah ada di repo ini dan
berjalan otomatis tiap jam (`5 * * * *` UTC = setiap jam pada menit ke-5 WIB).

> Repo **publik**: menit Actions tak terbatas. Repo **privat**: 2.000 menit/bulan
> (satu run ini hanya ~beberapa detik, jadi sangat hemat).

---

## 5. Uji aman (WAJIB sebelum produksi)

1. Pastikan `ALLOW_LIVE_SUBMIT` belum `1` di Vercel → semuanya mode latihan,
   portal **tidak** disentuh.
2. GitHub → tab **Actions** → **Absensi Monev (dispatcher massal)** →
   **Run workflow** (manual).
3. Buka run itu → langkah **Panggil dispatcher**. Periksa:
   - `HTTP 200`
   - `considered` = jumlah user otomasi aktif
   - `processed` = yang diproses pada jam ini
   - `results[].kind` — mis. `DRY_RUN` (normal saat latihan), `SUBMITTED` (asli)
4. Buka aplikasi → **Dashboard → Riwayat** user terkait → baris ber-`trigger:
   CRON` muncul pada jam tersebut.

> **Alternatif tanpa GitHub (opsional):** login sebagai admin → **Panel Admin** →
> **Pengiriman massal → Jalankan sekarang**. Hasilnya sama dengan langkah 2–3 di
> atas (ringkasan `considered/processed/deferred/results` tampil di halaman).
> Tetap butuh `CRON_SECRET`? **Tidak** — jalur ini memakai sesi admin, bukan
> rahasia cron. Jadi panel bisa dipakai bahkan sebelum GitHub Secrets diisi.

---

## 6. Arti kode respons

| HTTP | Arti | Tindakan |
| :--- | :--- | :--- |
| `200` | Diproses (sebagian mungkin `dryRun`) | Periksa `results` |
| `401` | `CRON_SECRET` salah/tidak dikirim | Samakan nilai di Vercel & GitHub |
| `503` | `CRON_SECRET` belum diset di Vercel | Set lalu redeploy |
| `407`/timeout | Portal Monev menggantung | Normal; `deferred` diproses jam berikutnya |

---

## 7. Batas & kuota (jujur)

- **Batas waktu fungsi:** route menyetel `maxDuration = 60` (maksimum Hobby).
  Ada tenggat internal 50 detik dan konkurensi 10 — 40 user normal selesai jauh
  di bawah itu.
- **Kenapa BUKAN Vercel Cron:** Hobby hanya mengizinkan cron **sekali per hari**;
  ekspresi per-jam (`0 * * * *`) **gagal saat deploy** ("Hobby accounts are
  limited to daily cron jobs"). Karena itu pemicunya GitHub Actions (tidak
  terbatas frekuensi). Ini bukan pilihan gaya — di Hobby, cron per-jam memang
  tidak bisa.
- **Kuota Hobby yang relevan (Function/Fluid Compute):** Active CPU **4 jam**/bln,
  Provisioned Memory **360 GB-hrs**/bln, Invocations **1 juta**/bln.
  **Active CPU hanya ditagih saat kode benar-benar berjalan — penagihan BERHENTI
  saat menunggu I/O** (permintaan ke portal Monev). Jadi portal yang menggantung
  **tidak** menghabiskan kuota CPU; ia hanya memakai Provisioned Memory.
- **Perkiraan pemakaian (kasus terburuk: 40 user, portal mati, 2×8s timeout):**
  satu batch ≈ 50s wall. Active CPU ≈ 0,4s (kripto + JSON) dan Provisioned
  Memory ≈ 5 GB-jam/bulan untuk 720 batch — **≈0,08 jam CPU** vs kuota 4 jam, dan
  **≈5 GB-hrs** vs 360. Aman dengan margin lebar.
- **Yang tetap diawasi:** bila jumlah user naik jauh (≥100 dalam satu jam) atau
  terjadi pengulangan eksekusi (retry), cek **Vercel → Usage**. Naikkan
  `DISPATCH_BATCH_SIZE`/`DISPATCH_CONCURRENCY` hanya bila perlu.
- **Ketepatan waktu:** GitHub Actions bisa telat 5–15 menit saat sibuk. Tidak
  masalah untuk absensi harian. Kalau butuh tepat waktu, pakai cron-job.org
  (lihat `CRON-SETUP.md`) dengan satu job memanggil endpoint yang sama.

---

## 8. Pemecahan masalah

| Gejala | Kemungkinan penyebab |
| :--- | :--- |
| `considered: 0` | Tak ada user dengan otomasi aktif, atau sakelarnya mati |
| `processed: 0` tapi `considered > 0` | Tak ada user yang jam jadwalnya = jam sekarang — normal, tunggu jam berikutnya |
| `deferred` tinggi | Terlalu banyak user pada jam sama; mereka diproses jam berikutnya |
| Actions hijau tapi tak ada log baru | `ALLOW_LIVE_SUBMIT` belum `1` → mode latihan (`DRY_RUN`) |
