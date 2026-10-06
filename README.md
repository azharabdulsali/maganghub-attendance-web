# MagangHub — Otomasi Absensi Monev

Web untuk mengotomatiskan pengisian laporan absensi (Monev) agar tidak perlu
dilakukan manual tiap hari. Aplikasi masuk ke portal Monev dengan kredensial
milik pengguna, lalu mengirim laporan absensi sesuai jadwal yang diatur.

Dokumen ini fokus pada **cara menjalankan** dan **cara deploy**. Untuk keputusan
desain dan aturan teknis, lihat:

| Dokumen | Isi |
| --- | --- |
| [`SPEC.md`](./SPEC.md) | Spesifikasi lengkap: model data, alur, keamanan, aturan bisnis |
| [`DESIGN.md`](./DESIGN.md) | Panduan visual & komponen UI |
| [`AGENTS.md`](./AGENTS.md) | Panduan untuk agen/AI yang bekerja di repo ini |
| [`docs/UI-LAYOUT.md`](./docs/UI-LAYOUT.md) | Aturan tata letak halaman |
| [`graphify-out/GRAPH_REPORT.md`](./graphify-out/GRAPH_REPORT.md) | Peta kode (god nodes, komunitas, koneksi antar berkas) |
| [`docs/CRON-SETUP.md`](./docs/CRON-SETUP.md) | Menyiapkan cron per pengguna |
| [`docs/CRON-BULK.md`](./docs/CRON-BULK.md) | Dispatcher massal (satu cron untuk semua) |
| [`docs/MONEV-API.md`](./docs/MONEV-API.md) | Catatan integrasi API Monev |

## Tumpukan teknologi

- **Next.js 16** (App Router) + **React 19**, TypeScript
- **Prisma 7** + **PostgreSQL (Neon)** — via driver adapter `@prisma/adapter-neon`
- **Auth.js (NextAuth v5)** — login kredensial, sesi di database
- **Tailwind CSS 4** + **Base UI** + `shadcn`
- **Vitest** untuk pengujian

## Menjalankan di lokal

### 1. Prasyarat

- Node.js 20+
- Database PostgreSQL. Cara termudah: buat proyek gratis di
  [Neon](https://neon.tech). Anda akan memakai dua koneksi dari Neon:
  **pooled** (untuk runtime aplikasi) dan **direct** (untuk Prisma CLI).

### 2. Pasang dependensi

```bash
npm install
```

`postinstall` otomatis menjalankan `prisma generate`.

### 3. Siapkan environment

```bash
cp .env.example .env.local
```

Lalu isi `.env.local`. Yang **wajib** (aplikasi gagal start bila kosong):

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Koneksi **pooled** Neon (host mengandung `-pooler`) |
| `DIRECT_URL` | Koneksi **direct** Neon |
| `NEXTAUTH_SECRET` | Minimal 32 karakter. Buat: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL aplikasi. Lokal: `http://localhost:3000` |
| `ENCRYPTION_KEY` | Tepat 64 karakter hex (32 byte). Buat: `openssl rand -hex 32` |

Yang **opsional**:

| Variabel | Efek bila kosong |
| --- | --- |
| `ADMIN_EMAIL` | Tidak ada admin otomatis; user pertama jadi `USER` biasa |
| `ALLOW_LIVE_SUBMIT` | Mode **latihan** — tidak ada laporan yang benar-benar dikirim (aman) |
| `UPSTASH_REDIS_REST_URL` / `..._TOKEN` | Rate limit per-proses (kurang akurat lintas instance) |
| `CRON_SECRET` | Dispatcher massal `/api/cron/run-all` nonaktif (balas 503) |

> **`ENCRYPTION_KEY` jangan pernah diganti** setelah ada kredensial tersimpan —
> data lama akan tidak bisa didekripsi. Simpan baik-baik.

### 4. Siapkan database

Proyek ini **tidak memakai folder migrasi**; skema diterapkan dengan `db push`:

```bash
npm run db:push
```

> Skema adalah sumber kebenaran di `prisma/schema.prisma`. Karena belum ada
> migrasi berversi, `db push` menyelaraskan database ke skema **tanpa riwayat**.
> Periksa perubahan skema dengan hati-hati sebelum push ke database produksi.

### 5. Jalankan

```bash
npm run dev
```

Buka <http://localhost:3000>. Daftar dengan email `ADMIN_EMAIL` untuk mendapat
peran admin.

## Perintah yang tersedia

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Server pengembangan (port 3000) |
| `npm run dev:3111` | Server pengembangan di port 3111 |
| `npm run build` | Build produksi |
| `npm start` | Jalankan hasil build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jalankan seluruh tes (Vitest) sekali |
| `npm run test:watch` | Vitest mode watch |
| `npm run db:push` | Selaraskan skema Prisma ke database |
| `npm run db:studio` | Prisma Studio (lihat/ubah data) |

Sebelum mengirim perubahan, pastikan **keempatnya** lulus:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Peta kode (graphify)

Repo ini memakai [graphify](https://github.com/Graphify-Labs/graphify) — sebuah
*skill* untuk agen AI (bukan dependensi aplikasi) — yang mengindeks seluruh
codebase menjadi **knowledge graph lokal**. Tujuannya: saat bertanya soal kode,
agen membaca peta ini dulu alih-alih menyisir seluruh berkas.

Ekstraksi kode murni **AST (tree-sitter), deterministik, tanpa LLM, tanpa API
key** — berjalan sepenuhnya offline.

### Prasyarat

Python 3.10+ dan paket `graphifyy` (nama PyPI sementara; CLI tetap `graphify`):

```bash
pip install graphifyy
```

### Perintah yang sering dipakai

| Perintah | Kegunaan |
| --- | --- |
| `graphify update .` | Bangun ulang graph dari kode (gratis, tanpa API key) |
| `graphify explain "nama"` | Peran sebuah simbol/nodes & tetangganya |
| `graphify path "A" "B"` | Jalur terpendek antara dua nodes |
| `graphify query "..."` | Cari subgraph yang relevan dengan pertanyaan |

`graphify query`/`explain`/`path` membutuhkan `GEMINI_API_KEY` (atau
`GOOGLE_API_KEY`) untuk pertanyaan semantik; `update` tidak butuh apa pun.

### Hasil

Output ada di `graphify-out/` (dilacak git kecuali `cache/`):

| Berkas | Isi |
| --- | --- |
| `graph.json` | Graph persisten — untuk `query`/`path`/`explain` |
| `GRAPH_REPORT.md` | Ringkasan manusia: god nodes, koneksi mengejutkan |
| `graph.html` | Viewer interaktif (klik, cari, filter per komunitas) |
| `manifest.json` | Metadata graf |

> Jalankan `graphify update .` setelah mengubah kode agar graph tidak basi.
> Bandingkan **Built from commit** di `GRAPH_REPORT.md` dengan `git rev-parse HEAD`.

## Deploy ke Vercel

1. **Import repo** di [vercel.com/new](https://vercel.com/new). Vercel mengenali
   Next.js secara otomatis — **tidak perlu** mengubah build command. `postinstall`
   sudah menjalankan `prisma generate`.

2. **Isi Environment Variables** (Settings → Environment Variables) untuk
   Production — daftar wajib & opsional sama seperti tabel di atas, dengan
   penyesuaian:

   - `NEXTAUTH_URL` = URL produksi, mis. `https://maganghub-autoabsen.my.id`
     (harus `https://`, bukan `http://`, dan tanpa garis miring di akhir).
   - `DATABASE_URL` = koneksi **pooled** Neon; `DIRECT_URL` = **direct**.
   - `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` = nilai produksi yang **baru** (jangan
     pakai yang lokal). Simpan `ENCRYPTION_KEY` di tempat aman.
   - Sertakan `NEXTAUTH_URL` juga untuk Preview bila Anda ingin preview berfungsi.

3. **Siapkan database produksi** (dari komputer lokal, dengan
   `DATABASE_URL`/`DIRECT_URL` produksi di `.env.local`):

   ```bash
   npm run db:push
   ```

   Ini dijalankan manual, bukan bagian dari build Vercel.

4. **Deploy.** Bila build gagal dengan pesan
   `Konfigurasi environment bermasalah`, artinya ada variabel wajib yang belum
   diisi — periksa pesannya, ia menyebut variabel mana yang kurang.

5. **Opsional — otomasi massal.** Bila memakai dispatcher
   (`/api/cron/run-all`), set `CRON_SECRET` di Vercel, lalu set **secrets repo**
   di GitHub (Settings → Secrets → Actions): `APP_URL` (URL Vercel tanpa slash)
   dan `CRON_SECRET` (harus **sama persis** dengan yang di Vercel). Workflow
   `.github/workflows/absensi-dispatch.yml` memanggil dispatcher tiap jam.

6. **Biarkan `ALLOW_LIVE_SUBMIT` kosong** sampai Anda benar-benar siap mengirim
   laporan sungguhan. Selama kosong, semua pengiriman berjalan mode latihan.

## Catatan sebelum dipakai sungguhan

### Rate limit lintas instance

Tanpa `UPSTASH_REDIS_REST_URL`/`_TOKEN`, pembatas rate limit disimpan di memori
proses. Di Vercel, satu aplikasi bisa berjalan di beberapa instance sekaligus,
sehingga batasnya **tidak akurat**. Isi kredensial Upstash Redis untuk pembatas
terpusat.

### Pengalihan rute bersifat sementara

`next.config.ts` masih memakai `permanent: false` (307) untuk rute lama. Setelah
struktur rute final dan situs publik, ubah ke `permanent: true` (308) dengan
sadar — redirect permanen di-cache keras oleh browser.

### Saran: migrasi Prisma

Saat ini skema disinkronkan dengan `db push` (tanpa riwayat). Untuk produksi
yang lebih aman, pertimbangkan beralih ke `prisma migrate` agar setiap perubahan
skema terversi dan bisa ditelusuri.
