# Panduan Cron Massal (Dispatcher), Tanpa Setup per User

Cara membuat **satu** pemicu admin yang mengabsen **semua** user otomatis,
sehingga tiap user **tidak perlu** menyalin webhook maupun memasang cron
sendiri. Cukup nyalakan sakelar Otomasi di dashboard.

> **Prasyarat:** aplikasi sudah di-deploy (HTTPS publik) dan repo ada di GitHub.
> Kalau Anda lebih suka cara lama (satu cron per user), lihat `CRON-SETUP.md`.

---

## 1. Cara kerjanya (singkat)

```
GitHub Actions (1 workflow, 4x tiap jam)
        │  Authorization: Bearer <CRON_SECRET>
        ▼
GET /api/cron/run-all
        │
        ├─ ambil semua AutomationConfig.isEnabled = true
        ├─ pilih yang jam jadwalnya (WIB) = jam sekarang
        ├─ jalankan performSubmit untuk tiap user (paralel berbatas)
        └─ balas ringkasan: { considered, processed, deferred, results }
```

- **Jadwal per-user tetap dihormati.** Dispatcher dipanggil 4x tiap jam; server
  hanya memproses user yang jam jadwalnya sama dengan jam sekarang.
- **Menit diabaikan.** Jadwal `07:30` diproses kapan saja antara 07:00–07:59 WIB.
  Absensi harian tidak butuh ketepatan menit, dan menuntutnya membuat jadwal
  `07:30` tak pernah kena pada cron per jam.
- **Satu user gagal tidak menggagalkan yang lain** (tiap user dibungkus
  `try/catch`).
- **Bisa juga dipicu dari aplikasi.** Selain GitHub Actions, admin yang sudah
  login dapat menekan **Jalankan sekarang** di **Panel Admin**, memanggil logika
  yang sama (`POST /api/admin/dispatch`, dijaga sesi + role ADMIN). Berguna untuk
  menguji atau mengejar ketertinggalan tanpa membuka GitHub. Seleksi user tetap
  di server: hanya yang jam jadwalnya = jam sekarang yang diproses.
- **Jalankan SATU user terpilih.** Bila hanya satu orang yang terlewat, admin
  tak perlu menunggu jam berikutnya: di tabel pengguna, tombol **Jalankan** pada
  baris user tertentu memanggil `POST /api/admin/dispatch/user` (body
  `{ userId }`, sesi + role ADMIN, rate limit `adminUserAction`). Aksi ini
  **memaksa** jalankan otomasi user itu apa pun jam jadwalnya, tetapi TETAP
  memakai `performSubmit` yang sama — jadi libur/akhir pekan/akhir program,
  pra-cek duplikat, dan gerbang `ALLOW_LIVE_SUBMIT` tetap berlaku. Pemicunya
  tercatat `CRON` di audit log.
- **Pemantauan per-user.** Tabel pengguna juga menampilkan **jadwal**
  (`HH:MM WIB`) dan **status hari ini** ("Belum jalan"/"Sudah jalan"/"Gagal")
  tiap user, sehingga admin bisa melihat siapa yang belum jalan hari itu
  sebelum memutuskan menekan **Jalankan**.

---

## 2. Buat `CRON_SECRET`

Hasilkan nilai acak 32 byte:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Simpan nilainya, dipakai di **dua** tempat (Vercel & GitHub), harus sama persis.

---

## 3. Set di Vercel

1. Vercel → proyek → **Settings → Environment Variables**.
2. Tambah `CRON_SECRET` = nilai dari langkah 2 (semua environment).
3. **Redeploy** agar terbaca.

> Bila `CRON_SECRET` kosong, endpoint `/api/cron/run-all` membalas `503` dan
> fitur massal nonaktif, aplikasi lain tetap jalan normal.

---

## 4. Set di GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Nama | Nilai |
| :--- | :--- |
| `APP_URL` | URL deploy, mis. `https://www.maganghub-autoabsen.my.id` (**tanpa** slash di akhir) |
| `CRON_SECRET` | sama persis dengan langkah 2 |

> **PENTING — pakai host FINAL, bukan yang di-redirect.** Domain ini me-redirect
> **non-`www` → `www`** dengan `HTTP 308`. Bila `APP_URL` memakai
> `https://maganghub-autoabsen.my.id` (tanpa `www`), curl mengikuti redirect
> lintas-host dan **header `Authorization` DIBUANG** di tengah jalan → server
> menerima request tanpa token → **`401`** meski `CRON_SECRET` sudah benar.
> Karena itu `APP_URL` **harus** `https://www.maganghub-autoabsen.my.id`.
> Cek host final dengan:
> `curl -sS -o /dev/null -w "%{url_effective}" -L "https://maganghub-autoabsen.my.id"`

Workflow `.github/workflows/absensi-dispatch.yml` sudah ada di repo ini dan
berjalan otomatis **4x tiap jam** (`*/15 * * * *`, yaitu xx:00/15/30/45 WIB).

> **Kenapa 4x, bukan 1x.** Penjadwal GitHub Actions tidak tepat waktu — ia bisa
> telat 10–30 menit saat runner ramai, dan kadang run di-skip. Dengan pemicu
> sekali per jam, user berjadwal `07:xx` hanya punya satu kesempatan; kalau
> pemicunya telat ke `08:xx`, server tak lagi mencocokkan jamnya dan absensi hari
> itu tidak terkirim (harus dikejar manual lewat tombol di Panel Admin). Empat
> pemicu per jam menyusutkan jendela itu jadi ≤15 menit. Panggilan berlebih aman:
> user yang jam jadwalnya tidak cocok hanya dilewati, dan `performSubmit` punya
> penjaga anti-duplikat.

> Menit Actions **nol rupiah, berapa pun frekuensinya**, bila repo ini
> **publik** — dan repo ini memang publik
> (`github.com/azharabdulsali/maganghub-attendance-web`). Jadi jadwal `*/15` di
> atas sepenuhnya gratis; bagian di bawah ini hanya relevan **bila suatu saat
> repo diprivatkan**.

> Repo **publik**: menit Actions tak terbatas. Repo **privat**: kuota gratis
> 2.000 menit/bulan, dan GitHub **membulatkan tiap run ke atas** — jadi satu run
> beberapa detik tetap dihitung **1 menit**.
>
> Karena itu frekuensi pemicu penting:
> - `5 * * * *` (1x/jam) → 24 run/hari ≈ **720 menit/bulan** → masih di bawah kuota.
> - `*/15 * * * *` (4x/jam) → 96 run/hari ≈ **2.880 menit/bulan** → **melebihi**
>   kuota gratis; sisa menit ditagihkan.
>
> Jadwal `*/15` dipilih demi keandalan (lihat catatan di atas). Bila repo Anda
> **privat** dan ingin tetap gratis, pilih salah satu: jadikan repo publik,
> turunkan ke `*/30` (≈1.440 menit/bulan, aman), atau terima biaya tambahan
> (kelebihannya kecil, ~880 menit ≈ beberapa dolar per bulan).

> **Kuota Vercel (berlaku untuk pemicu apa pun).** Setiap panggilan dispatcher
> adalah 1 invocation + CPU eksekusi (`runDispatch` selalu query
> `automationConfig`). Hobby: 1 juta invocation + **4 jam Active CPU/bulan**.
> Perkiraan kasar biaya CPU:
> - `*/15` → 2.880 panggilan/bulan ≈ **0,24 jam** (aman).
> - `*/10` → 4.320 panggilan/bulan ≈ **0,4 jam** (aman, pilihan cron-job.org).
> - `*/5` → 8.640 panggilan/bulan ≈ **0,7 jam** (masih aman).
> - `*/1` → 43.200 panggilan/bulan ≈ **3,6 jam** (nyaris menyentuh batas 4 jam).
>
> Karena server mencocokkan **jam** (bukan menit), mempercepat pemicu **tidak**
> menambah keandalan — hanya menambah CPU. Jangan turun di bawah `*/5`.

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
   - `results[].kind`, mis. `DRY_RUN` (normal saat latihan), `SUBMITTED` (asli)
4. Buka aplikasi → **Dashboard → Riwayat** user terkait → baris ber-`trigger:
   CRON` muncul pada jam tersebut.

> **Alternatif tanpa GitHub (opsional):** login sebagai admin → **Panel Admin** →
> **Pengiriman massal → Jalankan sekarang**. Hasilnya sama dengan langkah 2–3 di
> atas (ringkasan `considered/processed/deferred/results` tampil di halaman).
> Tetap butuh `CRON_SECRET`? **Tidak**, jalur ini memakai sesi admin, bukan
> rahasia cron. Jadi panel bisa dipakai bahkan sebelum GitHub Secrets diisi.

---

## 6. Arti kode respons

| HTTP | Arti | Tindakan |
| :--- | :--- | :--- |
| `200` | Diproses (sebagian mungkin `dryRun`) | Periksa `results` |
| `301`/`302`/`307`/`308` | **`APP_URL` masih kena redirect** (mis. non-`www`→`www`, atau `http`→`https`) | Set `APP_URL` ke host **final** hasil redirect (mis. `https://www....`), tanpa slash di akhir; lihat `curl -L -w "%{url_effective}"` |
| `401` | Bisa dua sebab: (a) `APP_URL` di-redirect lintas-host sehingga header `Authorization` dibuang — cek "URL akhir" di log; (b) `CRON_SECRET` GitHub ≠ Vercel | Samakan nilai di Vercel & GitHub **dan** pastikan `APP_URL` = host final |
| `503` | `CRON_SECRET` belum diset di Vercel | Set lalu redeploy |
| `407`/timeout | Portal Monev menggantung | Normal; `deferred` diproses jam berikutnya |

---

## 7. Batas & kuota (jujur)

- **Batas waktu fungsi:** route menyetel `maxDuration = 60` (maksimum Hobby).
  Ada tenggat internal 50 detik dan konkurensi 10, 40 user normal selesai jauh
  di bawah itu.
- **Kenapa BUKAN Vercel Cron:** Hobby hanya mengizinkan cron **sekali per hari**;
  ekspresi per-jam (`0 * * * *`) **gagal saat deploy** ("Hobby accounts are
  limited to daily cron jobs"). Karena itu pemicunya GitHub Actions (tidak
  terbatas frekuensi). Ini bukan pilihan gaya, di Hobby, cron per-jam memang
  tidak bisa.
- **Kuota Hobby yang relevan (Function/Fluid Compute):** Active CPU **4 jam**/bln,
  Provisioned Memory **360 GB-hrs**/bln, Invocations **1 juta**/bln.
  **Active CPU hanya ditagih saat kode benar-benar berjalan, penagihan BERHENTI
  saat menunggu I/O** (permintaan ke portal Monev). Jadi portal yang menggantung
  **tidak** menghabiskan kuota CPU; ia hanya memakai Provisioned Memory.
- **Perkiraan pemakaian (kasus terburuk: 40 user, portal mati, 2×8s timeout):**
  satu batch ≈ 50s wall. Active CPU ≈ 0,4s (kripto + JSON) dan Provisioned
  Memory ≈ 5 GB-jam/bulan untuk 720 batch, **≈0,08 jam CPU** vs kuota 4 jam, dan
  **≈5 GB-hrs** vs 360. Aman dengan margin lebar.
- **Yang tetap diawasi:** bila jumlah user naik jauh (≥100 dalam satu jam) atau
  terjadi pengulangan eksekusi (retry), cek **Vercel → Usage**. Naikkan
  `DISPATCH_BATCH_SIZE`/`DISPATCH_CONCURRENCY` hanya bila perlu.
- **Ketepatan waktu:** GitHub Actions bisa telat 5–15 menit saat sibuk, dan
  sebagian slot `*/15` bisa di-skip (lihat bagian 7). Tidak masalah untuk absensi
  harian karena server mencocokkan jam, bukan menit. Kalau butuh pemicu yang
  benar-benar rapat, tambahkan job cron-job.org (bagian 7A) yang memanggil
  endpoint yang sama.
- **GitHub Actions bisa MENGGABUNG/menghilangkan run berjadwal.** Ini perilaku
  bawaan penjadwal GitHub, bukan bug konfigurasi: pada jam sibuk run `schedule`
  ditunda, dan (terutama di repo dengan aktivitas rendah) sebagian besar slot
  `*/15` di-**skip** sepenuhnya. Akibatnya di tab Actions jeda antar-run bisa
  terlihat **berjam-jam** (mis. 3–11 jam), bukan 15 menit — padahal ekspresi
  cron-nya sudah benar. Karena server mencocokkan **jam** jadwal user, slot yang
  hilang berarti user berjam jadwal itu bisa **tidak terkirim hari itu**. Solusi
  andal: tambahkan pemicu eksternal per-15-menit (bagian 7A di bawah).

---

## 7A. Pemicu cadangan di cron-job.org (disarankan agar tepat waktu)

GitHub Actions kurang andal untuk jadwal rapat (lihat catatan skip di atas).
Tambahkan **satu job gratis** di <https://cron-job.org> yang memanggil endpoint
yang **sama** dengan workflow. Tidak ada risiko laporan ganda: `runDispatch`
hanya memproses user yang `hour`-nya = jam sekarang, dan `performSubmit` punya
penjaga anti-duplikat.

1. Masuk <https://cron-job.org> → **Create cronjob**.
2. **Title**: `Absensi Monev dispatcher (massal)`.
3. **URL**: `https://www.maganghub-autoabsen.my.id/api/cron/run-all`
   (host **final** — pakai `www`, **tanpa** slash di akhir).
   > **cron-job.org TIDAK mengikuti redirect.** Kalau URL-nya memakai non-`www`,
   > **Test run** akan menampilkan `308 Permanent Redirect / Redirection
   > detected`. Jawabannya ada di baris **"Redirection target"** — salin host itu
   > (yang ber-`www`) ke kolom URL.
4. **Schedule**: **Every 10 minutes** (`*/10 * * * *`). Set zona waktu akun ke
   `Asia/Jakarta` bila tersedia; kalau tidak, `*/10` sama saja di UTC (interval
   10 menit tak bergantung zona).
   > **Kenapa 10 menit, bukan 1 menit?** Server mencocokkan **jam**, bukan menit
   > (`isDueNow` hanya membandingkan `hour`). Panggilan 1 menit berarti 6× panggilan
   > identik tanpa manfaat apa pun, dan memakai **~3,6 jam Active CPU/bulan** —
   > nyaris menyentuh kuota Hobby 4 jam. `*/10` menaikkan jendela tangkap sedikit
   > (≤10 menit) dengan CPU ~0,4 jam/bulan, jauh dari batas. Jangan turun ke `*/1`.
5. **Request method**: `GET`.
6. **Headers** → tambah satu header:
   `Authorization: Bearer <CRON_SECRET>`
   (nilai sama persis dengan yang di Vercel & GitHub Secrets).
7. Simpan → **TEST RUN** sekali, pastikan respons `200` dan body memuat
   `considered/processed/deferred`.

> **Jangan pakai endpoint per-user** (`/api/cron/submit`) di sini — endpoint itu
> ber-rate-limit 30/5 menit per IP dan akan menolak panggilan tiap 10 menit
> dengan `429`. Dispatcher massal `/api/cron/run-all` **tidak** ber-rate-limit
> (hanya dijaga `CRON_SECRET`), itulah yang benar untuk pemicu rapat.

> Dua pemicu (GitHub + cron-job.org) boleh jalan bersamaan. Bila keduanya
> memanggil pada menit yang sama, panggilan kedua hanya menemukan user yang sudah
> `SUBMITTED`/`ALREADY_SUBMITTED` → dilewati, tidak menimpa laporan.

---

## 8. Pemecahan masalah

| Gejala | Kemungkinan penyebab |
| :--- | :--- |
| Actions merah, log `HTTP 308` | `APP_URL` di GitHub Secrets masih kena redirect (http/www). Pakai URL final |
| cron-job.org: `308 Permanent Redirect / Redirection detected` | cron-job.org **tidak** mengikuti redirect. Ganti URL job ke host di baris **"Redirection target"** (yang ber-`www`) |
| Actions merah, log `HTTP 401` | `CRON_SECRET` GitHub ≠ Vercel |
| Actions merah, log `HTTP 503` | `CRON_SECRET` belum diset di Vercel / belum redeploy |
| `considered: 0` | Tak ada user dengan otomasi aktif, atau sakelarnya mati |
| `processed: 0` tapi `considered > 0` | Tak ada user yang jam jadwalnya = jam sekarang, normal, tunggu jam berikutnya |
| `deferred` tinggi | Terlalu banyak user pada jam sama; mereka diproses jam berikutnya |
| Actions hijau tapi tak ada log baru | `ALLOW_LIVE_SUBMIT` belum `1` → mode latihan (`DRY_RUN`) |
| Jeda antar-run **berjam-jam** di tab Actions (bukan 15 menit), padahal cron `*/15` | **Normal bagi GitHub Actions**: slot berjadwal di-skip saat sibuk / repo aktivitas rendah. Bukan bug YAML. Tambah pemicu cron-job.org (bagian 7A) agar andal |
