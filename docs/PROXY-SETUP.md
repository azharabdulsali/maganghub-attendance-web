# Panduan: Login Otomatis di Vercel via Proxy Residensial

Dokumen ini menjelaskan cara membuat **login otomatis Kemnaker SSO** berhasil
saat aplikasi berjalan di **Vercel**, sehingga sekitar 15 pengguna cukup menekan
"Uji Login" — **tanpa menempel token manual**.

Bagi yang lebih suka baca kode: implementasi terpusat di
`src/lib/proxy-fetch.ts`; alasan kebijakan di `SPEC.md` §6 & `AGENTS.md` §73.

---

## 1. Mengapa perlu proxy di Vercel (dan tidak di PC rumah)

Halaman login SSO (`account.kemnaker.go.id/auth`) dijaga **Cloudflare Managed
Challenge**. Challenge itu bisa lolos dari **IP residensial** (rumah, kuota
seluler) tetapi **tidak** dari **IP datacenter** (AWS/GCP — tempat Vercel
berjalan).

Terbukti dari pengujian nyata:

| Dari mana | Hasil `GET /auth` |
| :--- | :--- |
| PC rumah (residensial) | `302 → /auth/login` ✅ lolos |
| Vercel / Hostinger / Tencent (datacenter) | `403` + `cf-mitigated: challenge` ❌ |

Jadi: **di PC rumah tidak perlu proxy. Di Vercel wajib pakai proxy residensial.**

> Ini bukan "menerobos proteksi". Proxy residensial hanya membuat request login
> datang dari IP residensial — sama seperti browser pengguna sendiri. UA tetap
> jujur, tidak ada spoof, tidak ada headless browser untuk mengecoh CAPTCHA.

---

## 2. Beban proxy sangat ringan (kuota aman)

Login SSO hanya dipanggil **sekali per pengguna**, bukan tiap request:

- Setelah login berhasil, sesi disimpan terenkripsi: **access token (6 jam)** +
  **refresh token (30 hari)**.
- Setelah itu, submit laporan memakai token tersimpan —
  **tidak menyentuh Cloudflare lagi**.
- Proxy **hanya** dipakai untuk host SSO. API Monev tidak lewat proxy.

Perkiraan: ~15 login SSO per 30 hari. Paket proxy residensial 1 GB akan
bertahan sangat lama.

### 2a. Verifikasi pemakaian kuota (dicek ke kode)

Klaim "proxy hanya dipakai saat login SSO" sudah **diverifikasi langsung ke
kode**, bukan asumsi:

| Kejadian | Lewat proxy? | Bukti |
| :--- | :--- | :--- |
| Login SSO awal | ✅ **Ya** | `fetchPortal` di `kemnaker-sso.ts` / `monev-login.ts` |
| Tukar refresh → access (`/auth/refresh`) | ❌ **Tidak** | `exchangeRefreshForAccess` memakai `fetch` biasa (`monev-submit.ts`) |
| Submit laporan | ❌ **Tidak** | hanya mengirim Bearer token ke API Monev |
| Pakai access token yang masih segar | ❌ **Tidak** | `perform-submit.ts` pakai token tersimpan, tanpa jaringan |

Alasannya konsisten dengan §1: **hanya host SSO** (`account.kemnaker.go.id`)
yang dijaga Cloudflare. API Monev balas `401` JSON polos (bukan `403`
challenge), jadi **tidak perlu** proxy (docs/MONEV-API.md §7).

**Artinya: kuota proxy HANYA terpakai saat login SSO awal — sekali per pengguna
per 30 hari.** Skenario terburuk (semua 15 orang login di hari yang sama) pun
hanya ±3 MB. Paket 1 GB aman bertahun-tahun.

---

## 3. Beli proxy residensial

Pilih salah satu (semuanya memberi URL berformat `http://user:pass@host:port`):

| Penyedia | Catatan |
| :--- | :--- |
| **IPRoyal** ✅ | "Residential Proxies", **$7.35/GB SEKALI bayar** (lihat §3b, §3c) |
| **Webshare** | "Residential", $3.50/GB tapi **langganan BULANAN** (lihat §3c) |
| **Decodo** (dulu Smartproxy) | "Residential", ~$2/GB, **langganan bulanan** |
| **Oxylabs** | Enterprise, ~$2.50/GB, **langganan bulanan** |
| **Bright Data** | Paling andal, "pay as you go", ~$5–8/GB (akun perlu verifikasi KYC) |

**Istilah yang harus kamu pilih:**

- **Residential** (bukan "Datacenter") — ini kuncinya.
- **Rotating** lebih baik daripada **Static**: membuat tiap request keluar dari
  IP berbeda, menghindari pola "banyak login dari 1 IP" yang mencurigakan.
- **HTTP/HTTPS** (bukan SOCKS5) paling sederhana.

### 3a. Berapa besar yang harus dibeli?

**Kecil sudah cukup.** Perhitungan kasarnya:

- Halaman login SSO (`GET /auth` lalu `POST /auth/login`) ≈ **±100–300 KB** per
  login.
- 15 user × 2 login/bulan + sedikit cadangan ≈ **< 15 MB/bulan**.
- Artinya paket **1 GB** bertahan **bertahun-tahun**, bukan berbulan-bulan.

> Jangan tergoda membeli 10 GB. Untuk kasus ini 1 GB sudah sangat lega. Beli
> dari yang termurah; kalau habis, tinggal isi ulang.

### 3b. Langkah membeli IPRoyal (paling direkomendasikan)

IPRoyal menyediakan "pay-as-you-go" 1 GB tanpa langganan bulanan — paling
cocok untuk kebutuhanmu.

1. **Buka & daftar** — kunjungi
   [iproyal.com](https://iproyal.com) → klik **Sign up** (kanan atas). Cukup
   email + sandi, tak perlu kartu kredit untuk membuat akun.

2. **Masuk ke menu Residential** — setelah login, di dashboard pilih menu
   **Residential Proxies** (bukan "Datacenter", bukan "ISP").

3. **Tentukan ukuran** — atur slider/pilihan **1 GB**. Ini paket terkecil yang
   dijual (ada juga 2/5 GB; tidak perlu).

4. **Konfigurasi rotasi** — pilih tipe **Rotating** (default). Ini membuat tiap
   request keluar dari IP berbeda — aman untuk 15 user.

5. **Checkout & bayar** — isi data pembayaran (kartu kredit/PayPal/crypto).
   Biaya **$7.35 untuk 1 GB**, **sekali bayar, tanpa langganan**.

6. **Ambil URL proxy** — setelah pembayaran, buka
   **Residential → Proxy Access / Setup** di dashboard. Kamu akan melihat
   endpoint & kredensial:

   ```
   Host: geo.iproyal.com
   Port: 12321
   Username: xxxxxxx
   Password: yyyyyyy
   ```

7. **Susun URL lengkap** — gabungkan menjadi satu baris (inilah nilai untuk
   `MAGANGHUB_PROXY_URL`):

   ```
   http://xxxxxxx:yyyyyyy@geo.iproyal.com:12321
   ```

   > Format: `http://USERNAME:PASSWORD@HOST:PORT`. Tidak ada spasi.

8. **Tambahkan parameter negara (opsional tapi disarankan)** — Kemnaker adalah
   portal Indonesia; IP residensial **Indonesia** paling kecil risiko diblokir.
   IPRoyal mendukung penargetan negara lewat awalan di **username**:

   ```
   http://xxxxxxx-country-id:yyyyyyy@geo.iproyal.com:12321
   ```

   Perhatikan `-country-id` disisipkan ke username (bukan ditambah query).
   Pola persisnya bisa berbeda per penyedia — cek tab **Country selection** di
   dashboard IPRoyal, dan salin contoh URL yang mereka sediakan.

9. **Uji sebelum dipakai** — jalankan di PC-mu:

   ```powershell
   npx tsx scripts/uji-proxy.ts "http://xxxxxxx:yyyyyyy@geo.iproyal.com:12321"
   ```

   Harus muncul `DENGAN PROXY: ✅ LOLOS`. Bila `❌ MASIH DIBLOKIR`, coba tambah
   `-country-id`, atau hubungi support IPRoyal (chat live 24/7).

### 3c. Perbandingan penyedia (harga & MODEL BAYAR)

⚠️ **Yang paling penting bukan harganya, tapi MODEL BAYARNYA.** Kebutuhanmu
sangat kecil (< 15 MB/bulan), jadi paket "sekali bayar" jauh lebih hemat jangka
panjang daripada langganan bulanan sekalipun harga per GB-nya terlihat lebih
murah.

| Penyedia | Harga 1 GB | Model | 12 bulan | 24 bulan |
| :--- | ---: | :--- | ---: | ---: |
| **IPRoyal** ✅ | **$7.35** | **Sekali bayar** (pay-as-you-go) | **$7.35** | **$7.35** |
| **Webshare** | $3.50 | **Bulanan** (1 GB/bln) | $42.00 | $84.00 |
| **Bright Data** | ~$5–8 | Sekali bayar (pay-as-you-go) | ~$5–8 | ~$5–8 |
| **Decodo** (dulu Smartproxy) | ~$2.00+ | Bulanan (kredit hangus bila tak dipakai) | ~$24+ | ~$48+ |
| **Oxylabs** | ~$2.50+ | Bulanan | ~$30+ | ~$60+ |

**Detail per penyedia (dicek langsung dari halaman harga resmi):**

- **IPRoyal** — punya **dua** jalur: *Subcription (5% off)* dan *Pay As You Go*.
  Yang kita mau adalah **Pay As You Go**: **1 GB = $7.35 sekali bayar**, tanpa
  langganan, tanpa tagihan berikutnya. (Tier langganan 1 GB = $7.00/GB **per
  bulan** — jangan tertukar.)
- **Webshare** — tabel harga menampilkan "$3.50/GB" tapi kolomnya berbunyi
  `$3.50 /mo`: itu **langganan bulanan**, bukan sekali bayar. Webshare punya
  **free tier 10 proxy / 1 GB gratis selamanya** — sayangnya proxy gratis itu
  **datacenter**, jadi **tidak** bisa menembus Cloudflare Kemnaker. Berguna hanya
  untuk uji coba kode.
- **Decodo** (dulu Smartproxy) — residensial mulai **$2/GB**, model bulanan;
  kredit biasanya **hangus** bila tidak dipakai.
- **Oxylabs** — mulai **$2.50/GB**, model bulanan, kelas enterprise.

> **Kesimpulan tabel:** untuk pemakaian kecil & jangka panjang, hanya penyedia
> dengan jalur **sekali bayar** yang hemat. Dari semua di atas, **IPRoyal
> Pay-As-You-Go** satu-satunya yang jelas: bayar $7.35 sekali, selesai.

**Cara membaca tabel ini:**

- **IPRoyal $7.35 SEKALI** — kuota 1 GB **tidak akan habis** (kebutuhanmu hanya
  ±15 MB/bulan). Bayar sekali, selesai, tanpa tagihan berikutnya.
- **Webshare $3.50 BULANAN** — meski per-GB lebih murah, kamu ditagih
  **$3.50 setiap bulan** selama app jalan, padahal 98% kuota tak terpakai.
  Dalam 1 tahun jadi **$42**; 2 tahun **$84**.
- Jadi: **jangan pilih berdasarkan "harga per GB" saja** — kalikan dengan
  berapa lama app-mu berjalan. Untuk pemakaian berkelanjutan, **sekali bayar
  selalu menang**.

> Bila kamu hanya butuh proxy < 2 bulan (mis. sekali uji), Webshare bulanan baru
> lebih murah. Tapi begitu berhenti bayar, proxy mati & login Vercel gagal lagi.

**Catatan:** harga di atas dari halaman checkout masing-masing penyedia
(dicek langsung, bisa berubah). Selalu konfirmasi di halaman pembayaran sebelum
bayar.

Semua penyedia di atas memberi URL dengan format sama
(`http://user:pass@host:port`), jadi `uji-proxy.ts` & Vercel-nya identik.


### 3d. Yang HARUS dihindari

- ❌ **Datacenter proxy** — sama-sama diblokir Cloudflare seperti Vercel.
- ❌ **Paket "ISP / Static Residential"** mahal & 1 IP untuk 15 user (bisa
  memicu rate-limit). Untuk kasus ini **Rotating** lebih baik.
- ❌ **Paket besar** (10 GB+) — buang-buang uang; kebutuhanmu < 15 MB/bulan.
- ❌ **Proxy gratis** — lambat, tidak stabil, sering sudah diblokir.
- ❌ Menulis URL asli ke file yang di-commit. Simpan hanya di `.env.local` &
  Vercel.

Kamu akan mendapat URL seperti:

```
http://user123:pass456@geo.iproyal.com:12321
```

> ⚠️ Jangan pernah menuliskan URL ini ke file yang di-commit. Ia memuat sandi.

---

## 4. Uji proxy DULU sebelum dipakai (WAJIB)

Ada skrip diagnostik khusus untuk ini. Ia menembak endpoint yang **sama** dengan
alur login nyata, jadi hasilnya mewakili kenyataan.

Jalankan **dari PC lokal** (bukan Vercel):

```powershell
# Cara 1: masukkan URL proxy langsung sebagai argumen
npx tsx scripts/uji-proxy.ts "http://user:pass@host:port"

# Cara 2: simpan dulu di .env.local sebagai MAGANGHUB_PROXY_URL, lalu:
npx tsx scripts/uji-proxy.ts
```

Bacaan hasil:

| Hasil | Artinya |
| :--- | :--- |
| `TANPA PROXY` lolos (`302`) | Server lokalmu memang tidak diblokir (wajar, IP rumah) |
| `DENGAN PROXY: ✅ LOLOS` | **Proxy benar.** Lanjut ke langkah 5 |
| `DENGAN PROXY: ❌ MASIH DIBLOKIR` | Proxy salah/tidak residensial. Periksa URL & sandi, atau hubungi penyedia |

Skrip **tidak pernah** mencetak URL proxy apa adanya — hanya `host:port`.

---

## 5. Set `MAGANGHUB_PROXY_URL` di Vercel

Proxy harus diisi di **Vercel Environment Variables**, bukan di `.env` lokal.

1. Buka [vercel.com](https://vercel.com) → pilih proyekmu.
2. **Settings** → **Environment Variables**.
3. Tambah variabel baru:
   - **Key**: `MAGANGHUB_PROXY_URL`
   - **Value**: `http://user:pass@host:port` (URL proxy residensialmu)
   - **Environments**: centang **Production** (dan **Preview** bila mau).
4. Klik **Save**.
5. **Deploy ulang** agar env baru terpakai:
   - **Deployments** → deployment terbaru → ikon `⋯` → **Redeploy**.

> Env var **tidak** berlaku pada deployment lama. Wajib redeploy.

---

## 6. Verifikasi di produksi

Setelah redeploy:

1. Buka app Vercel-mu → halaman `/credentials`.
2. Login sebagai salah satu pengguna (yang kredensialnya sudah tersimpan).
3. Tekan **Uji Login**.
4. Hasil yang diharapkan:

```json
{
  "ok": true,
  "status": "ACTIVE",
  "message": "Login otomatis berhasil. Sesi tersimpan...",
  "hasRefreshToken": true
}
```

Bila masih gagal, aplikasi akan menampilkan pesan jujur "challenge
Cloudflare/WAF (bukan kredensial salah)" — artinya proxy belum aktif atau belum
tersimpan. Ulangi langkah 4–5.

**Jangan** mengaktifkan proxy untuk semua orang sekaligus di hari pertama.
Uji dengan **1 akun** dulu (mis. akunmu sendiri) sampai `ok: true`, baru
beri tahu teman-temanmu.

### 6a. Setelah login berhasil: apakah user perlu login ulang tiap 6 jam?

**Tidak.** Sesi diperpanjang otomatis di dalam aplikasi, **tanpa** menyentuh
Cloudflare maupun proxy. Ini sudah diperiksa langsung ke kode:

1. Saat login, dua token disimpan terenkripsi: **access token** (6 jam) dan
   **refresh token** (30 hari).
2. Saat submit, aplikasi pakai access token tersimpan **bila masih segar** →
   nol request ke portal.
3. Bila access token sudah kedaluwarsa, aplikasi **otomatis** menukar refresh
   token (30 hari) menjadi access token baru lewat
   `POST /api/v1/auth/refresh` → user lanjut tanpa sadar.

Kesimpulan: user cukup login **sekali per 30 hari**. Beban proxy tidak
bertambah (lihat §2a).

> ⚠️ **Catatan jujur:** alur tukar refresh token ini **sudah ada di kode, tapi
> belum pernah diuji ke portal sungguhan** — bentuk respons sukses (`200`) dari
> `/auth/refresh` belum terekam (docs/MONEV-API.md §10). Kalau bentuknya
> berbeda dari dugaan, penukaran bisa gagal dan aplikasi akan jujur meminta
> login ulang (jalur tempel token manual tetap tersedia). Jadi: amati sekali
> setelah 6 jam pertama; kalau flow submit tetap jalan, berarti auto-refresh
> bekerja.

---

## 7. Pertimbangan etis & keamanan (BACA INI)

Fitur ini menyimpan password SSO orang lain. Kamu bertanggung jawab atasnya.

- **Kedua-duanya terenkripsi** AES-256-GCM dengan `ENCRYPTION_KEY`, tersimpan di
  Neon per-`userId`. Tapi secara teknis kamu (pemilik server) **bisa**
  mendekripsinya. Katakan ini terus terang ke pengguna.
- **JANGAN pernah ganti `ENCRYPTION_KEY`** setelah ada data tersimpan. Bila
  diganti, semua sesi & password lama tidak bisa dibuka lagi — semua user harus
  login ulang.
- **Persetujuan eksplisit**: pastikan tiap orang tahu app ini login ke akun
  Kemnaker mereka sendiri. Jangan aktifkan untuk siapa pun tanpa mereka sadari.
- **Jalur tempel token tetap ada** sebagai cadangan bagi pengguna yang tidak
  nyaman password-nya disimpan di server.
- **Rate limit**: login SSO sudah dibatasi (scope `credentialsLogin`). Hindari
  menyuruh 15 orang login serentak.

---

## 8. Bila proxy bermasalah (rollback cepat)

Untuk mematikan proxy **tanpa mengubah kode**:

1. Vercel → Settings → Environment Variables.
2. Hapus `MAGANGHUB_PROXY_URL`, atau kosongkan nilainya.
3. Redeploy.

Aplikasi otomatis kembali ke `fetch` biasa (perilaku lama), jalur tempel token
tetap berfungsi sebagai cadangan.

---

## Ringkasan cepat

```text
1. Beli proxy residensial (IPRoyal/Webshare)  -> dapat URL http://user:pass@host:port
2. npx tsx scripts/uji-proxy.ts "URL"          -> harus "DENGAN PROXY: ✅ LOLOS"
3. Vercel -> Settings -> Env Vars -> MAGANGHUB_PROXY_URL = URL -> Save
4. Redeploy
5. /credentials -> Uji Login -> harus ok:true
```
