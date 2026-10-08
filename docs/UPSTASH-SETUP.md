# Panduan Upstash Redis (rate limit lintas instance) — 100% GRATIS

> **TL;DR:** Kode sudah mendukung Upstash sejak awal. Anda **tidak menulis kode
> apa pun**. Cukup: (1) buat database Redis gratis di Upstash, (2) salin
> `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` ke `.env.local` (lokal)
> dan Vercel (produksi), (3) redeploy. Selesai.

---

## 1. Kenapa perlu Upstash? (kegunaannya di proyek ini)

Rate limit proyek ini (`src/lib/rate-limit.ts`) punya **dua bagian**:

1. **Kebijakan murni** — berapa kali boleh, dalam jendela berapa lama
   (`RATE_LIMITS`). Sudah selesai & teruji, tidak butuh Upstash.
2. **Penyimpanan penghitung** (`src/lib/rate-limit-store.ts`) — di mana angka
   "sudah berapa kali request ini?" disimpan. Ini yang berubah.

Masalahnya, penyimpanan default adalah **in-memory (memori proses)**. Di Vercel
(serverless), satu aplikasi berjalan di **beberapa instance sekaligus** dan
instance bisa mati/hidup kapan saja. Akibatnya:

- Setiap instance punya penghitung **sendiri-sendiri** → batas jadi tidak akurat.
  Contoh: batas login 10/5 menit "per IP", tapi karena tersebar ke 4 instance,
  efektifnya bisa jadi 40/5 menit.
- Cold start me-reset penghitung → rentang waktu perlindungan hilang.

**Upstash Redis** menyediakan satu penghitung **terpusat** yang dibagi semua
instance. Hasilnya batas benar-benar konsisten di produksi.

Yang **terpengaruh** (semua endpoint ber-rate-limit):

| Scope | Batas | Endpoint |
| --- | --- | --- |
| `login` | 10 / 5 menit per IP | Login NextAuth (`src/lib/auth.ts`) |
| `register` | 5 / 10 menit per IP | `POST /api/register` |
| `submitManual` | 20 / 10 menit per pengguna | `POST /api/reports/submit` |
| `cron` | 30 / 5 menit per IP | `POST /api/cron/submit` |
| `reportDraft` | 30 / 5 menit per pengguna | `POST /api/report-templates/generate` |
| `credentials` / `credentialsLogin` / `credentialsVerify` | 6–12 / 10 menit | Manajemen kredensial Monev |
| `passwordChange` / `emailChange` / `sessionRevoke` | 5 / 10 menit | Aksi akun sendiri |
| `adminUserAction` | 20 / 10 menit per admin | Aksi admin atas pengguna |

> **Penting:** `/api/cron/run-all` (dispatcher massal) **tidak** ber-rate-limit
> — hanya dijaga `CRON_SECRET`. Jadi memasang Upstash **tidak** mengubah
---

## 2. Apakah benar-benar tanpa biaya? (ya)

Data dari halaman harga resmi Upstash (2026):

| Item | Paket **Free** |
| --- | --- |
| Harga | **$0 / bulan — permanen** (bukan trial 30 hari) |
| Perintah/bulan | **500.000** |
| Ukuran data | 256 MB |
| Bandwidth/bulan | 10 GB |
| Maks perintah/detik | 10.000 |
| Jumlah database | 1 |
| Kartu kredit | **Tidak perlu** (untuk paket Free) |

### Cukup untuk proyek ini?

Perkiraan pemakaian nyata. Per satu request ber-rate-limit, store melakukan
**≈ 2 pipeline call** (INCR+TTL, lalu GET). Anggap konservatif **4 perintah**
per request (pembulatan aman):

- **Skenario santai** (login beberapa kali sehari + beberapa submit + cron):
  ~500 request/hari × 4 = **2.000 perintah/hari** ≈ **60.000 perintah/bulan**
  → **12% dari kuota gratis**.
- **Skenario ramai** (100 request/hari × 30 + lonjakan): masih **jauh** di
  bawah 500.000/bulan.

**Kesimpulan: kuota gratis 500K perintah/bulan sangat lega untuk 15-an
pengguna.** Yang perlu Anda jaga hanya: **jangan masukkan kartu kredit** —
selama tetap di paket Free, saat kuota habis request ditolak/limit, **bukan
ditagih otomatis**.

> **Jebakan besar yang harus dihindari:** begitu Anda memasukkan kartu kredit,
> database otomatis berpindah ke **Pay-as-you-go** dan baru **mulai ditagih**
> ($0,20 / 100K perintah, storage $0,25/GB setelah 1 GB gratis). Selama
> **tidak** memasukkan kartu, Anda tetap $0.

### Fail-open (aman bila Upstash mati)

`src/lib/enforce-rate-limit.ts` sengaja **fail-open**: bila Upstash tak dapat
dihubungi, request **tetap diizinkan** (rate limit adalah lapisan pertahanan,
bukan gerbang tunggal; gerbang utama tetap sesi/kunci). Jadi memasang Upstash
**tidak bisa mematikan aplikasi Anda** meski layanan Redis bermasalah.

---

## 3. Langkah-langkah (≈5 menit, tanpa kode)

### Langkah 1 — Buat database Redis gratis

1. Buka <https://console.upstash.com> → **Sign up** (boleh pakai Google/GitHub).
   **Tidak diminta kartu kredit.**
2. Klik **Create Database**.
3. Isi:
   - **Name**: `maganghub-ratelimit`
   - **Type**: **Regional** (bukan Global — lebih murah/latensi rendah)
   - **Region**: pilih **Singapore (`ap-southeast-1`)** agar dekat dengan Neon
     (`ap-southeast-1`) dan pengguna Indonesia.
   - **TLS**: aktifkan (default).
4. Klik **Create**.

### Langkah 2 — Salin dua kredensial REST

Di halaman database → tab **REST API** (atau **Details** → bagian *REST API*).
Di sana ada dua nilai:

- `UPSTASH_REDIS_REST_URL` — mis. `https://xxxx-12345.upstash.io`
- `UPSTASH_REDIS_REST_TOKEN` — string panjang (token rahasia)

> Gunakan tab **REST API**, bukan **Connect** (yang untuk Redis protocol/TLS
> biasa). Kode proyek memakai REST (`/pipeline`), bukan SDK/ioredis.
>
> Token ini **rahasia**. Jangan ditulis di dokumen, chat, atau commit.

### Langkah 3 — Set di LOKAL (`.env.local`)

Buka `.env.local` (buat dari `.env.example` bila belum ada) dan isi:

```bash
UPSTASH_REDIS_REST_URL="https://xxxx-12345.upstash.io"
UPSTASH_REDIS_REST_TOKEN="<token-panjang-dari-dashboard>"
```

Lalu uji lokal:

```bash
npm run dev
```

Setelah itu lakukan login 11× dengan password salah — percobaan ke-11 harus
mendapat **`429`** + header `Retry-After`. Itu bukti store aktif. (Tanpa env
ini pun perilaku lokal biasanya mirip karena hanya 1 proses — pembeda
sesungguhnya ada di produksi multi-instance.)

### Langkah 4 — Set di VERCEL (produksi)

1. Buka <https://vercel.com> → proyek Anda → **Settings** → **Environment
   Variables**.
2. Tambahkan **dua** variabel, centang **Production**, **Preview**, dan
   **Development**:
   - `UPSTASH_REDIS_REST_URL` = nilai dari Langkah 2
   - `UPSTASH_REDIS_REST_TOKEN` = nilai dari Langkah 2
3. **Save**.
4. **Redeploy** (Deployments → titik tiga pada deploy terakhir → *Redeploy*).
   Env var baru **tidak** berlaku pada deployment lama.

> Cara cepat alternatif: di dashboard Vercel ada **Integrations → Upstash** →
> *Create new database*. Integrasi ini otomatis mengisi kedua env var ke
> proyek. Tetap gratis selama Anda memilih paket Free di Upstash dan tidak
> memasukkan kartu kredit.
>
> 📖 Langkah deploy lengkap (Neon, env wajib, cron, verifikasi):
> [`DEPLOY.md`](DEPLOY.md).

### Langkah 5 — Verifikasi

1. Di **Upstash console → database → Data Browser**, setelah ada trafik login,
   Anda akan melihat kunci berawalan `rl:` (mis. `rl:login:...`). Itu bukti
   penghitung terpusat dipakai.
2. Bisa juga cek tab **Metrics**: jumlah perintah/bulan bertambah dari 0 —
   artinya produksi benar-benar memakai Upstash.
3. Di Vercel, cukup pastikan **tidak** ada error `Upstash pipeline gagal`
   di Runtime Logs.


---

## 4. Uji tanpa mengganggu produksi (opsional)

Test yang sudah ada memverifikasi kedua store tanpa jaringan:

```bash
npx vitest run src/lib/rate-limit-store.test.ts
```

Cakupan: env kosong → in-memory; env terisi → Upstash; store mati → fail-open
(tetap mengizinkan).

---

## 5. Troubleshooting

| Gejala | Penyebab | Solusi |
| --- | --- | --- |
| Batas tetap tidak akurat di produksi | Env diisi tapi **belum redeploy** | Redeploy Vercel setelah menambah env |
| Log: `Upstash pipeline gagal: HTTP 401` | Token salah/terpotong | Salin ulang `UPSTASH_REDIS_REST_TOKEN` persis |
| Log: `Upstash pipeline gagal: HTTP 404` | URL salah (`redis://` atau host *Connect*) | Pakai `https://...upstash.io` dari tab **REST API** |
| Tak ada kunci `rl:` di Data Browser | Trafik belum ada / env tak terbaca | Lakukan 1 login, lalu cek tab Metrics |
| Ditagih padahal ingin gratis | Kartu kredit dimasukkan → plan naik ke Pay-as-you-go | Hapus metode bayar / tetap di paket Free; tanpa kartu tetap $0 |
| Aplikasi mati saat Upstash down | (seharusnya tidak) fail-open | Pastikan error di-catch di `enforce-rate-limit.ts` |

---

## 6. Kalau nanti ingin melepas Upstash

Cukup **hapus** kedua env var di Vercel lalu redeploy. `createRateLimitStore()`
otomatis kembali ke in-memory. Tidak ada perubahan kode, tidak ada migrasi data
(penghitung memang ephemeral / sementara).

