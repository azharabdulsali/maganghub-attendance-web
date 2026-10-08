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
| **DataImpulse** ✅✅ | "Residential Proxies", **$1/GB, minimum $5 (5 GB), SEKALI bayar**. Kuota **tidak pernah hangus**. **Pilihan utama** (lihat §3b, §3c) |
| **IPRoyal** ✅ | "Residential Proxies", **$7.35/GB SEKALI bayar** (lihat §3c) |
| **MarsProxies** | Murah per-GB tapi paketnya **berbasis bulanan** (kuota di-reset) — kurang cocok (lihat §3c) |
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

### 3b. Langkah membeli DataImpulse (paling direkomendasikan)

DataImpulse adalah **pay-as-you-go murni** — **tidak ada langganan bulanan**, dan
kuota **tidak pernah hangus** ("traffic never expires"). Minimum pembelian **$5
untuk 5 GB** pada paket *Intro For New Users* ($1/GB). Semua fakta di bagian ini
diverifikasi dari dokumentasi resmi (docs.dataimpulse.com, dicek 2026-06).

1. **Buka & daftar** — kunjungi
   [dataimpulse.com](https://dataimpulse.com) → tombol **TRY NOW / Sign Up**.
   Cukup email + sandi.

2. **Pilih paket Intro** — **$5 = 5 GB** (paket terkecil, "Intro For New Users").
   Ini sekali bayar; **tidak ada tagihan berikutnya**. Jangan tergoda 50 GB.

3. **Ambil kredensial & host** — setelah bayar, buka **Proxy Access** di
   dashboard. Yang kamu dapat:

   ```
   Host  : gw.dataimpulse.com      (disarankan; ada juga IP 74.81.81.81)
   Port  : 823                      (HTTP rotating)
   Login : <username>
   Pass  : <password>
   ```

   > Gunakan **hostname DNS** `gw.dataimpulse.com` (stabil). IP hostname bisa
   > berubah dan harus dipantau — hindari.

4. **Pilih jenis koneksi — ROTATING** (bukan Sticky). Port menentukan perilaku:

   | Jenis | Protokol | Port |
   | :--- | :--- | ---: |
   | **Rotating** ✅ | HTTP/HTTPS | **823** |
   | Rotating | SOCKS5 | 824 |
   | Sticky | HTTP/SOCKS5 | 10000–20000 |

   Untuk 15 user, **rotating (port 823)** aman: tiap request keluar dari IP
   berbeda — menghindari pola "banyak login dari 1 IP".

5. **Susun URL lengkap** — gabungkan `http://USERNAME:PASSWORD@HOST:PORT`:

   ```
   http://<username>:<password>@gw.dataimpulse.com:823
   ```

   > Format: `http://USER:PASS@HOST:PORT`. Tidak ada spasi.

6. **Tambahkan penargetan negara Indonesia** — Kemnaker adalah portal Indonesia;
   IP residensial **ID** paling kecil risiko. DataImpulse memakai parameter
   `__cr` yang **disisipkan ke USERNAME** (bukan query string), dipisah `__`,
   nilai dipisah titik. Format manual: `key1.value1,value2;key2.value1,value2`.

   ```
   http://<username>__cr.id:<password>@gw.dataimpulse.com:823
   ```

   (`cr` = country, `id` = kode negara Indonesia). Penargetan negara **gratis**
   — sudah termasuk harga dasar. Beberapa negara: `__cr.id,sg`.

   > ⚠️ **Parameter State/City/ZIP/ASN dikenakan tarif 2×.** Jangan tambahkan
   > `__state`/`__city`/`__zip`/`__asn` — cukup `__cr.id` saja. Untuk kasus ini
   > (login SSO) penargetan negara sudah lebih dari cukup.

7. **Uji sebelum dipakai** — jalankan di PC-mu:

   ```powershell
   npx tsx scripts/uji-proxy.ts "http://<username>__cr.id:<password>@gw.dataimpulse.com:823"
   ```

   Harus muncul `DENGAN PROXY: ✅ LOLOS`. Bila `❌ MASIH DIBLOKIR`: cek
   sandi/port (pastikan **823** untuk rotating HTTP), atau ganti ke IP hostname
   `74.81.81.81`, atau hubungi support DataImpulse (live chat 24/7, balas
   < 3 menit).

> **Ringkasan DataImpulse:** bayar $5 sekali untuk 5 GB, kuota tidak hangus,
> tanpa langganan. Dengan pemakaian ±15 MB/bulan, paket ini praktis tak akan
> habis bertahun-tahun.

### 3c. Perbandingan penyedia (harga & MODEL BAYAR)

⚠️ **Yang paling penting bukan harganya, tapi MODEL BAYARNYA.** Kebutuhanmu
sangat kecil (< 15 MB/bulan), jadi paket "sekali bayar" jauh lebih hemat jangka
panjang daripada langganan bulanan sekalipun harga per GB-nya terlihat lebih
murah.

| Penyedia | Harga 1 GB | Model | 12 bulan | 24 bulan |
| :--- | ---: | :--- | ---: | ---: |
| **DataImpulse** ✅✅ | **$5 / 5 GB → $1/GB** | **Sekali bayar** (kuota tak hangus) | **$5** | **$5** |
| **IPRoyal** ✅ | **$7.35** | **Sekali bayar** (pay-as-you-go) | **$7.35** | **$7.35** |
| **Bright Data** | ~$5–8 | Sekali bayar (pay-as-you-go) | ~$5–8 | ~$5–8 |
| **MarsProxies** | ~$0.70–1.4/GB | **Bulanan** (kuota di-reset) | ~$8–17 | ~$16–34 |
| **Webshare** | $3.50 | **Bulanan** (1 GB/bln) | $42.00 | $84.00 |
| **Decodo** (dulu Smartproxy) | ~$2.00+ | Bulanan (kredit hangus bila tak dipakai) | ~$24+ | ~$48+ |
| **Oxylabs** | ~$2.50+ | Bulanan | ~$30+ | ~$60+ |

**Detail per penyedia (dicek langsung dari halaman harga/dokumentasi resmi):**

- **DataImpulse** — **pay-as-you-go murni**, tanpa langganan. Paket *Intro For New
  Users* **$5 = 5 GB** ($1/GB). Kuota **"never expires"** — tidak hangus seperti
  penyedia bulanan. Penargetan negara **gratis** dan sudah termasuk harga dasar;
  parameter State/City/ZIP/ASN saja yang dikenakan 2×. Pendaftaran mudah
  (email + sandi), pembayaran kartu/Apple Pay/Google Pay/QRIS/crypto.
  **Inilah yang direkomendasikan** (§3b).
- **IPRoyal** — punya **dua** jalur: *Subscription (5% off)* dan *Pay As You Go*.
  Yang kita mau adalah **Pay As You Go**: **1 GB = $7.35 sekali bayar**, tanpa
  langganan, tanpa tagihan berikutnya. (Tier langganan 1 GB = $7.00/GB **per
  bulan** — jangan tertukar.) Cadangan yang aman bila DataImpulse bermasalah.
- **MarsProxies** — harga per-GB rendah (~$0.70–1.4/GB) **tapi paketnya berbasis
  bulanan**: yang kamu beli adalah "X GB/bulan", dan kuota **di-reset** tiap
  bulan. Untuk app yang hanya pakai ±15 MB/bulan, kamu bayar penuh tiap bulan
  demi kuota yang 99% tak terpakai. **Kurang cocok** untuk kasus ini.
- **Webshare** — tabel harga menampilkan "$3.50/GB" tapi kolomnya berbunyi
  `$3.50 /mo`: itu **langganan bulanan**, bukan sekali bayar. Webshare punya
  **free tier 10 proxy / 1 GB gratis selamanya** — sayangnya proxy gratis itu
  **datacenter**, jadi **tidak** bisa menembus Cloudflare Kemnaker. Berguna hanya
  untuk uji coba kode.
- **Decodo** (dulu Smartproxy) — residensial mulai **$2/GB**, model bulanan;
  kredit biasanya **hangus** bila tidak dipakai.
- **Oxylabs** — mulai **$2.50/GB**, model bulanan, kelas enterprise.

> **Kesimpulan tabel:** untuk pemakaian kecil & jangka panjang, hanya penyedia
> dengan jalur **sekali bayar** yang hemat. **DataImpulse** adalah yang termurah
> MINIMUM-nya ($5 sekali, kuota tak hangus), disusul **IPRoyal** ($7.35 sekali).
> MarsProxies/Webshare/Decodo/Oxylabs semuanya bulanan — hindari untuk app ini.

**Cara membaca tabel ini:**

- **DataImpulse $5 SEKALI** — kuota 5 GB **tidak akan habis** (kebutuhanmu hanya
  ±15 MB/bulan). Bayar sekali, selesai, tanpa tagihan berikutnya. Paling hemat.
- **IPRoyal $7.35 SEKALI** — kuota 1 GB **tidak akan habis**. Bayar sekali,
  selesai, tanpa tagihan berikutnya. Minimumnya sedikit di atas DataImpulse.
- **Webshare/MarsProxies BULANAN** — meski per-GB lebih murah, kamu ditagih
  **setiap bulan** selama app jalan, padahal 98% kuota tak terpakai.
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
http://user123__cr.id:pass456@gw.dataimpulse.com:823
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

> ⚠️ **Catatan jujur:** alur tukar refresh token ini **sudah ada di kode**, dan
> bentuk respons sukses (`200`) dari `/auth/refresh` **sebagian sudah terekam**
> (DevTools, 2026-06): portal **MEROTASI** `monev_refresh_token` tiap refresh
> sukses — token lama langsung mati (docs/MONEV-API.md §4.1 & §10). Kode sudah
> menyimpan token baru (`persistRotatedRefreshToken`), jadi auto-refresh tidak
> memakai token yang sudah dicabut. Yang belum pasti hanya apakah access token
> datang di body JSON atau cookie; penafsiran tetap toleran, dan bila bentuknya
> di luar dugaan aplikasi jujur meminta login ulang (jalur tempel token manual
> tetap tersedia). Amati sekali setelah 6 jam pertama; kalau submit tetap jalan,
> auto-refresh bekerja.

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
1. Beli proxy residensial (DataImpulse; cadangan IPRoyal) -> URL http://user:pass@host:port
2. npx tsx scripts/uji-proxy.ts "URL"          -> harus "DENGAN PROXY: ✅ LOLOS"
3. Vercel -> Settings -> Env Vars -> MAGANGHUB_PROXY_URL = URL -> Save
4. Redeploy
5. /credentials -> Uji Login -> harus ok:true
```
