# Panduan Deploy — MagangHub Attendance

Cara men-deploy aplikasi ini dari nol ke **Vercel** (hosting utama, Next.js),
termasuk daftar environment variable, penyiapan database Neon, cron, hingga
verifikasi pasca-deploy.

> **Ringkas:** Import repo di Vercel → isi Environment Variables → `npm run
> db:push` (sekali, dari lokal) → Deploy → verifikasi. Vercel mengenali Next.js
> otomatis, **tidak perlu** mengubah build command (`postinstall` sudah
> menjalankan `prisma generate`).

---

## 0. Ringkasan alur

1. Siapkan database Neon (produksi) — 1x.
2. Import repo di Vercel.
3. Isi Environment Variables (Production, + Preview bila perlu).
4. `npm run db:push` dari lokal ke DB produksi — 1x.
5. Deploy.
6. (Opsional) Aktifkan cron & Upstash.
7. Verifikasi.

---

## 1. Prasyarat

| Kebutuhan | Catatan |
| --- | --- |
| Repo di GitHub/GitLab | Vercel mengimpor langsung dari sana |
| Akun [Neon](https://neon.tech) | Postgres serverless (paket gratis cukup) |
| Akun [Vercel](https://vercel.com) | Paket Hobby gratis |
| Node.js 20+ | Untuk menjalankan `db:push` dari lokal |

---

## 2. Database — Neon

Proyek ini memakai **Neon** (region `ap-southeast-1` / Singapore).

1. Buat project di <https://neon.tech>. Catat region-nya.
2. Ambil **dua** connection string dari Neon Console → **Connection Details**:
   - **Pooled** (`...-pooler...`) → untuk `DATABASE_URL` (runtime, banyak
     koneksi pendek).
   - **Direct** (tanpa `-pooler`) → untuk `DIRECT_URL` (migrasi / `db push`,
     butuh satu koneksi tetap).
3. Bentuknya menyerupai:

   ```text
   DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
   DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
   ```

> **Catatan Prisma 7:** URL koneksi **tidak** disimpan di `schema.prisma`.
> `prisma.config.ts` membaca `DATABASE_URL` untuk CLI; client runtime memakai
> driver adapter (`@prisma/adapter-neon`), bukan `url`.

---

## 3. Environment Variables

Isi di Vercel: **Project → Settings → Environment Variables**.

### Wajib

| Variabel | Nilai produksi | Environment |
| --- | --- | --- |
| `DATABASE_URL` | Koneksi **pooled** Neon | Production, Preview |
| `DIRECT_URL` | Koneksi **direct** Neon | Production, Preview |
| `NEXTAUTH_SECRET` | Rahasia **baru** khusus produksi (`openssl rand -base64 32`) | Production, Preview |
| `NEXTAUTH_URL` | URL **final**, mis. `https://www.maganghub-autoabsen.my.id` | Production (+ Preview bila perlu) |
| `ENCRYPTION_KEY` | 32 byte acak, 64 karakter hex | Production |
| `ADMIN_EMAIL` | Email pendaftar pertama yang jadi ADMIN | Production |

> **`NEXTAUTH_URL` — penting:** harus `https://`, pakai host **final** yang
> tidak di-redirect (domain ini me-redirect non-`www` → `www`, jadi `www`
> **wajib**), dan **tanpa** garis miring di akhir.
>
> **`ENCRYPTION_KEY`:** jangan pernah diganti setelah ada data tersimpan —
> kredensial Monev terenkripsi dengannya. Simpan di tempat aman.

### Gerbang keselamatan

| Variabel | Nilai | Keterangan |
| --- | --- | --- |
| `ALLOW_LIVE_SUBMIT` | kosong (atau tidak `"1"`) | Gerbang pengiriman NYATA ke portal Monev. Selama kosong, semua kirim berjalan **mode latihan** (`dryRun`). Set `"1"` **hanya** saat benar-benar siap. |

### Opsional

| Variabel | Fungsi | Panduan |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Rate limit terpusat lintas instance (gratis) | [`UPSTASH-SETUP.md`](UPSTASH-SETUP.md) |
| `CRON_SECRET` | Dispatcher massal `GET /api/cron/run-all` | [`CRON-BULK.md`](CRON-BULK.md) |
| `GEMINI_API_KEY` (+ `GEMINI_MODEL`) | Penyusun draf laporan via LLM. Kosong = penyusun lokal (0 token) | `.env.example` |
| `MAGANGHUB_PROXY_URL` | Proxy residensial untuk jalur login SSO | [`PROXY-SETUP.md`](PROXY-SETUP.md) |

Daftar lengkap dengan penjelasan tiap variabel ada di **`.env.example`**.

> **Catatan Upstash:** kode sudah mendukung Upstash sejak awal
> (`src/lib/rate-limit-store.ts`). Cukup isi 2 env var — **tanpa mengubah kode**.
> Bila kosong, pembatas kembali ke in-memory (cukup untuk dev / 1 instance) dan
> **fail-open** bila Upstash mati. Panduan:
> [`docs/UPSTASH-SETUP.md`](UPSTASH-SETUP.md).

---

## 4. Siapkan skema database (sekali)

Proyek ini **tidak memakai folder migrasi**; skema diterapkan dengan `db push`.
Jalankan **dari komputer lokal**, dengan `DATABASE_URL`/`DIRECT_URL` **produksi**
di `.env.local`:

```bash
npm run db:push
```

> Skema adalah sumber kebenaran di `prisma/schema.prisma`. Karena belum ada
> migrasi berversi, `db push` menyelaraskan database ke skema **tanpa riwayat**.
> Periksa perubahan skema dengan hati-hati sebelum push ke database produksi.
> Langkah ini **manual**, bukan bagian dari build Vercel.

---

## 5. Deploy

1. **Import repo** di <https://vercel.com/new>. Vercel mengenali Next.js otomatis
   — **tidak perlu** mengubah build command.
2. Pastikan Environment Variables sudah terisi (Langkah 3).
3. **Deploy.**
4. Bila build gagal dengan pesan `Konfigurasi environment bermasalah`, artinya
   ada variabel wajib yang belum diisi — pesannya menyebut variabel mana.

> **Post-deploy:** setiap kali mengubah Environment Variables, **redeploy**
> (Deployments → titik tiga deployment terakhir → *Redeploy*). Env var baru
> **tidak** berlaku pada deployment lama.

---

## 6. Opsional pasca-deploy

### a. Cron otomasi massal (direkomendasikan)

Set `CRON_SECRET` di Vercel, lalu set **secrets repo** di GitHub
(Settings → Secrets → Actions):

- `APP_URL` = host **final** (`https://www.maganghub-autoabsen.my.id`, pakai
  `www`, tanpa slash).
- `CRON_SECRET` = **sama persis** dengan yang di Vercel.

Workflow `.github/workflows/absensi-dispatch.yml` memanggil dispatcher 4x tiap
jam (`*/15`), sehingga keterlambatan penjadwal GitHub tidak membuat absensi
terlewat hari itu. Detail: [`CRON-BULK.md`](CRON-BULK.md).

### b. Upstash Redis (rate limit akurat)

Ikuti [`UPSTASH-SETUP.md`](UPSTASH-SETUP.md): buat DB Redis gratis (Regional,
Singapore) → salin 2 env var → set di Vercel (Production + Preview +
Development) → redeploy.

### c. Vercel Web Analytics

Dashboard Vercel → proyek → tab **Analytics** → **Enable**. Paket
`@vercel/analytics` sudah terpasang; tidak ada langkah build tambahan. Data
muncul setelah deploy berikutnya. (Lihat bagian "Analytics" di README.)

---

## 7. Verifikasi pasca-deploy

| Cek | Cara | Hasil yang diharapkan |
| --- | --- | --- |
| Situs hidup | Buka `NEXTAUTH_URL` | Halaman login tampil, tanpa error 500 |
| Env terbaca | Login lalu akses Dashboard | Tidak ada error konfigurasi |
| DB tersambung | Registrasi user pertama | `ADMIN_EMAIL` otomatis jadi ADMIN |
| Rate limit | Kirim 20 request cepat ke endpoint ber-rate-limit | Muncul `429` di akhir |
| Upstash aktif | Upstash Console → database → **Metrics** / **Data Browser** | Ada command & key `rl:*` bertambah |
| Cron (bila dipakai) | GitHub Actions → *Run workflow* | Log sukses, baris `trigger: CRON` muncul di Riwayat |
| Tidak ada error runtime | Vercel → **Logs** | Tidak ada `Upstash error`, tidak ada error DB |

> **Catatan:** saat `ALLOW_LIVE_SUBMIT` kosong, pengiriman bersifat latihan
> (`dryRun: true`) — ini normal dan aman. Baru set `"1"` setelah verifikasi lain
> lolos dan Anda siap mengirim laporan sungguhan.

---

## 8. Pindah hosting / lepas layanan opsional

| Ingin melepas | Langkah |
| --- | --- |
| Upstash | Hapus `UPSTASH_REDIS_REST_URL`/`_TOKEN` di Vercel → redeploy. Otomatis kembali ke in-memory; tanpa migrasi data. |
| Cron massal | Kosongkan `CRON_SECRET` → endpoint balas `503`; hapus secrets GitHub. |
| Gemini | Kosongkan `GEMINI_API_KEY` → fitur kembali ke penyusun lokal (0 token). |
| Proxy | Kosongkan `MAGANGHUB_PROXY_URL` → kembali ke fetch biasa. |
| Analytics | Hapus `<Analytics />` + konstanta CSP + bagian terkait di `/privacy`. Lihat README §Analytics. |

---

## 9. Troubleshooting

| Gejala | Penyebab | Solusi |
| --- | --- | --- |
| Build gagal: `Konfigurasi environment bermasalah` | Env wajib belum diisi | Baca pesan, isi variabel yang disebut |
| Login redirect salah / loop | `NEXTAUTH_URL` salah (non-`www`, ada slash, `http`) | Pakai host final `https://www.…` tanpa slash |
| Error DB `relation does not exist` | `db push` belum dijalankan di DB itu | Jalankan `npm run db:push` dengan URL produksi |
| Batas rate limit tidak akurat | Upstash belum diset / belum redeploy | Set env Upstash lalu redeploy (`UPSTASH-SETUP.md`) |
| Env baru tidak berefek | Deployment lama belum di-redeploy | Redeploy dari tab Deployments |
| Kirim laporan jalan padahal belum siap | `ALLOW_LIVE_SUBMIT="1"` | Kosongkan kembali → mode latihan |
| Skema berubah tapi DB lama | `db push` belum diulang | Jalankan `npm run db:push` lagi |

---

## 10. Referensi

- [`UPSTASH-SETUP.md`](UPSTASH-SETUP.md) — rate limit terpusat
- [`CRON-BULK.md`](CRON-BULK.md) — dispatcher massal (cara direkomendasikan)
- [`CRON-SETUP.md`](CRON-SETUP.md) — cron per-user (model lama)
- [`PROXY-SETUP.md`](PROXY-SETUP.md) — proxy residensial untuk SSO
- [`MONEV-API.md`](MONEV-API.md) — integrasi API Monev
- `.env.example` — daftar lengkap env var
