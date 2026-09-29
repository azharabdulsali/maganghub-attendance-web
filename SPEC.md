# SPEC.md — MagangHub Attendance Web

> Platform web multi-user untuk mengelola presensi dan laporan harian magang
> ke portal Monev MagangHub Kemnaker.
>
> **Dokumen ini adalah rencana milik pemilik proyek ini.** Ide arsitektur
> dipelajari dari proyek publik lain (`LVNVoid/maganghub-bot-attendance`),
> lalu keputusan teknis diambil mandiri. Lihat §6 untuk keputusan mesin
> submit dan §10 untuk batas etika yang dipegang.

---

## 1. Tujuan

Menyediakan aplikasi web yang memungkinkan peserta magang Kemnaker:

1. Menghubungkan akun Monev MagangHub mereka (kredensial disimpan terenkripsi).
2. Menyimpan **tiga template tetap** — Uraian Aktivitas, Pembelajaran,
   Kendala — yang sama seperti proyek Python lama, masing-masing > 100 karakter.
3. Menyusun laporan harian dari template tersebut, dengan tiga cara:
   - **Tempel template apa adanya** (perilaku sama dengan bot Python).
   - **Salin ke editor lalu ubah manual** bila ingin berbeda tiap hari.
4. Memberi kebebasan memilih mode eksekusi:
   - **Mode Manual (default)** — review lalu submit 1-klik dari dashboard.
   - **Mode Terjadwal (opt-in)** — dipicu via webhook dari cron eksternal.
5. Mengirim laporan lewat **Direct REST API** dalam < 2 detik, tanpa browser,
   tanpa server tambahan, dan tanpa biaya bulanan.

### Kriteria Keberhasilan

- Pengguna bisa register, login, dan mengonfigurasi akun dalam < 5 menit.
- Kredensial Monev tersimpan terenkripsi AES-256-GCM; tidak pernah plaintext.
- Tidak ada satu pun log atau respons API yang memuat password.
- Pengguna punya kendali penuh: manual atau terjadwal, dan bisa mematikannya.
- Proyek lama (`maganghub-autoabsen`, Python) **tetap berjalan dan tidak diubah**.

---

## 2. Hubungan dengan Proyek Lama

Ini bagian terpenting dan harus dibaca lebih dulu.

| | Proyek lama (`maganghub-autoabsen`) | Proyek ini (`maganghub-attendance-web`) |
| :--- | :--- | :--- |
| Bahasa | Python | TypeScript (Next.js) |
| Mesin submit | Playwright + Chromium | **Direct REST API (tanpa browser)** |
| Pemicu | Task Scheduler Windows | Webhook cron / 1-klik dashboard |
| Jumlah pengguna | Satu (pemilik PC) | Multi-user |
| Database | `data/state.json` | PostgreSQL (Neon) |
| Laporan | Tiga template tetap, sama tiap hari | **Sama — tiga template tetap**, tapi per pengguna & bisa diedit |
| AI | Tidak dipakai | **Tidak dipakai** (dibatalkan, lihat §13) |
| Status | **Tetap jalan apa adanya** | Proyek baru, terpisah total |

**Yang diminta pemilik:** script Python **tetap ada dan tetap jalan**. Web app
ini **ditambahkan**, bukan menggantikan. Tidak ada satu pun file di
`maganghub-autoabsen/` yang diubah, diimpor, atau dipindahkan.

**Aturan mutlak:** proyek ini tidak boleh mengubah, mengimpor, atau
menggantungkan diri pada file di dalam `maganghub-autoabsen/`. Keduanya
berdiri sendiri. Jika proyek web mati, proyek lama harus tetap jalan.

**Konsekuensi penting:** kedua sistem tidak boleh mengirim untuk hari yang
sama, karena portal akan menolak yang kedua (`409 Presensi sudah ada`).
Pemilik hanya boleh mengaktifkan salah satu per hari.

---

## 3. Tech Stack

| Layer | Teknologi | Alasan |
| :--- | :--- | :--- |
| Framework | Next.js 15+ (App Router, TypeScript) | Standar industri, server + client menyatu |
| Bahasa | TypeScript strict, zero `any` | Mencegah bug yang tidak terlihat |
| Styling | Tailwind CSS v4 | Cepat, tanpa file CSS besar |
| Database | PostgreSQL di Neon (serverless) | Serverless-friendly, gratis untuk skala awal |
| ORM | Prisma | Migrasi terkontrol, tipe aman |
| Auth | NextAuth.js v5 (email/password) | Sesi tersimpan di DB, bukan cookie rapuh |
| Enkripsi | AES-256-GCM (`node:crypto`) | Standar untuk data rahasia at-rest |
| State client | Zustand | Ringan, tanpa boilerplate Redux |
| Mesin submit | **Direct REST API (tanpa browser)** | Lihat §6 |
| Deploy web | Vercel | Cocok untuk Next.js, paket gratis cukup |
| Test | Vitest | Cepat, menyatu dengan ekosistem Vite |

**Catatan:** tidak ada AI, tidak ada integrasi GitHub. Keduanya dibatalkan
atas keputusan pemilik (§13). Karena itu pula tidak ada `OPENAI_API_KEY`.

---

## 4. Peran Pengguna

| Peran | Kemampuan |
| :--- | :--- |
| **Admin** | Kelola semua pengguna, lihat audit log, statistik, paksa submit |
| **User** | Kelola akun sendiri, konfigurasi kredensial & template, review/submit laporan, buat webhook key |

---

## 5. Fitur Inti

### 5.1 Autentikasi
- Login email + password, hash `bcryptjs`.
- Sesi tersimpan di database melalui Prisma adapter.
- Wajib HTTPS di produksi — cookie sesi tidak boleh lewat HTTP polos.

### 5.2 Manajemen Kredensial Monev
- Input email + password Monev.
- Simpan terenkripsi **AES-256-GCM**: IV unik per record, auth tag tersimpan,
  hanya ciphertext yang masuk DB.
- **Tes koneksi**: verifikasi kredensial masih valid tanpa menyimpan hasil login.
- Password **tidak pernah** dikembalikan ke client, bahkan ke pemiliknya.
  Untuk mengubah, pengguna harus mengetik ulang.

### 5.3 Template Laporan (pengganti Integrasi GitHub)
- Tiga kolom tetap: **Uraian Aktivitas**, **Pembelajaran yang Diperoleh**,
  **Kendala yang Dialami** — mengikuti proyek Python lama.
- Pengguna mengisi & menyimpan template sekali; dipakai ulang setiap hari.
- **Validasi > 100 karakter per kolom**, ditegakkan di kode (bukan hanya di UI),
  mengikuti validasi portal.
- Template bisa diubah kapan saja; perubahan tidak memengaruhi laporan yang
  sudah `SUBMITTED`.

### 5.4 Penyusun Laporan (tanpa AI)
- Laporan harian **berasal dari template pengguna**, bukan dari commit.
- Dua jalur, keduanya sah:
  1. **Pakai template langsung** — persis perilaku bot Python: isi sama tiap hari.
  2. **Salin lalu edit** — template jadi titik awal, pengguna mengubahnya manual
     bila hari itu berbeda.
- Tidak ada panggilan ke layanan AI mana pun. Tidak ada biaya variabel.


### 5.5 Submit & Riwayat
- Tombol **Isi dari Template** → draf tiga kolom terisi, bisa diedit
  (ada penghitung karakter per kolom).
- Tombol **Simpan Draf** dan **Submit Sekarang**.
- Riwayat dengan pencarian, filter status, paginasi, dan detail yang bisa dibuka.
- Draf boleh dihapus; laporan berstatus `SUBMITTED` terkunci permanen.

### 5.6 Mode Terjadwal
- Setiap pengguna punya `webhookKey` unik.
- Dashboard memberi perintah `curl` siap tempel ke cron-job.org / GitHub Actions / `crontab`.
- Saat dipicu: jika belum ada draf → buat dari **template pengguna**; lalu submit.
- Respons asli portal (200 / 409 / 422) dicatat ke tabel audit.

### 5.7 Audit Log
- Setiap percobaan submit dicatat: status, pesan, HTTP code, pemicu, percobaan
  ke-berapa.
- Berguna untuk membuktikan "sudah dikirim" bila ada sengketa dengan pembimbing.

---

## 6. Cara Submit — Keputusan Kunci

**Keputusan (atas pilihan pemilik proyek): memakai Direct REST API, tanpa
browser, tanpa worker, tanpa biaya bulanan.**

Bentuk sistem:
- Web app di Vercel serverless (100% gratis di paket hobby).
- Submit berupa HTTP request langsung ke API Monev dari dalam serverless
  function. Tidak ada Chromium, tidak ada proses yang selalu nyala.
- Pemicu jadwal dari **cron eksternal gratis** (cron-job.org atau GitHub
  Actions) yang memanggil `GET /api/cron/submit?key=<webhookKey>`.

**Biaya bulanan: Rp0.** Semua komponen memakai paket gratis.

**Konsekuensi yang harus diterima (disadari, bukan tersembunyi):**
1. Web app **pasif** — ia tidak bisa "bangun sendiri". Ia hanya submit saat
   dipanggil cron atau tombol dashboard ditekan.
2. Jika layanan cron gratis pihak ketiga mati, absen terjadwal tidak jalan.
   Tidak ada fallback, karena tidak ada worker milik sendiri.
3. Alur login & submit mengikuti API internal portal yang **tidak
   didokumentasikan secara publik**. Jika portal mengubah bentuk API-nya,
   sistem bisa berhenti sampai kode disesuaikan. Ini risiko yang sudah
   diketahui dan diterima.
4. Tidak ada lapisan browser, jadi tidak ada kemampuan menyelesaikan
   halaman yang butuh JavaScript/anti-bot. Bila portal menambah proteksi
   semacam itu, Direct API akan langsung gagal.

5. Isi laporan **sama setiap hari** bila pengguna memakai template apa adanya
   — persis seperti bot Python. Ini bukan kekurangan tak terduga, melainkan
   perilaku yang diinginkan pemilik. Pengguna yang ingin berbeda cukup
   mengedit draf sebelum submit.

**Etika request (batas yang dipegang):**
- Request dikirim sebagai HTTP client biasa dengan header wajar
  (`Accept`, `Accept-Language`, `Content-Type`).
- **Tidak** memakai User-Agent palsu yang mengaku Chrome.
- **Tidak** memakai proxy untuk menembus `403`.
- Jika `403` muncul, pesannya ditampilkan terus terang ke pengguna dan
  dicatat di audit log — bukan ditutupi dengan penyamaran.

**Pencegahan kerapuhan:** nilai `buildId`/konstanta portal **tidak di-hardcode
permanen**; ditaruh di satu tempat berkonfigurasi agar mudah diperbarui,
dan kegagalan login dilaporkan dengan pesan yang jelas (bukan gagal senyap).

---

## 7. Model Data (Prisma)

Ringkas; nama field dapat menyesuaikan saat implementasi.

| Model | Isi penting |
| :--- | :--- |
| `User` | email, nama, role, hash password, waktu dibuat |
| `Account` / `Session` | tabel bawaan NextAuth |
| `MaganghubCredential` | userId, email Monev, `ciphertext`, `iv`, `authTag`, status |
| `ReportTemplate` | userId, `activity`, `learning`, `obstacles`, waktu diubah |
| `Report` | userId, tanggal, activity, learning, obstacles, source, status |
| `SubmitLog` | reportId, userId, status, message, httpCode, pemicu, attempt |
| `AutomationConfig` | userId, isEnabled, `webhookKey`, jam, timezone |

Enum: `Role`, `CredentialStatus`, `SourceType`, `ReportStatus`, `SubmitStatus`,
`TriggerType`.

`SourceType` nilainya menjadi `TEMPLATE` dan `MANUAL_EDIT` — nilai `GITHUB`
**dihapus**. Model `GithubRepo` dan `AiConfig` **dihapus seluruhnya**.

Batasan: `Report` unik per `(userId, date)` — mencegah draf ganda.

---

## 8. Endpoint API

| Method | Endpoint | Deskripsi | Auth | Rate limit |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/register` | Daftar akun baru (email + password) | Publik | **3/jam per IP** |
| `GET` | `/api/cron/submit?key=<webhookKey>` | Memicu submit otomatis (dipanggil cron eksternal) | Query `key` | 30/5 menit per IP |
| `GET/PUT` | `/api/automation` | Baca/simpan jadwal otomasi + webhook key | Cookie sesi | 20/menit |
| `GET/POST` | `/api/auth/[...nextauth]` | Autentikasi (login/logout) | Publik / callback | **10/15 menit per IP** (login) |
| `GET/PUT` | `/api/template` | Baca & simpan 3 template pengguna | Cookie sesi | 20/menit |
| `POST` | `/api/reports/draft` | Buat draf dari template | Cookie sesi | 20/menit |
| `POST` | `/api/reports/submit` | Kirim draf langsung ke Monev | Cookie sesi | 20/10 menit per pengguna |

**Implementasi rate limit (Tahap 5):** kebijakan murni di `src/lib/rate-limit.ts`
(jendela tetap, teruji dengan waktu disuntik), penyimpanan di
`src/lib/rate-limit-store.ts` — **in-memory** secara default, atau **Upstash
Redis** bila `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` diisi (akurat
lintas instance Vercel). Penegakan terpusat di `src/lib/enforce-rate-limit.ts`;
respons 429 menyertakan header `Retry-After` + `X-RateLimit-*`. Semua endpoint
sensitif (login, register, submit manual, webhook cron, ubah kredensial) dijaga.
Store mati → **fail open** (ketersediaan diutamakan; rate limit adalah lapisan
pertahanan, bukan gerbang tunggal).

**Dihapus:** `/api/github/commits` dan `/api/reports/generate` (yang dulu
memanggil AI). Keduanya tidak lagi punya alasan untuk ada.

Rate limit register & login **wajib ada sebelum rilis** (lihat §13), karena
pendaftaran langsung aktif tanpa verifikasi email.

---

## 9. Keamanan (wajib, karena publik)

1. **Enkripsi AES-256-GCM** untuk kredensial Monev.
   `ENCRYPTION_KEY` hanya di environment, **tidak pernah** di repo atau DB.
   Kunci ini **tidak boleh berubah** setelah ada data — lihat §14.
2. **Hash password pengguna** dengan `bcryptjs` (cost ≥ 12).
   Password mentah tidak pernah disimpan, tidak pernah di-log, tidak pernah
   dikembalikan ke client.
3. **Jangan pernah log password** — tidak di console, tidak di audit log,
   tidak di pesan error. Ini berlaku untuk password pengguna **dan** password
   SIAKAD yang tersimpan.
4. **HTTPS wajib** di produksi; header keamanan (HSTS, `X-Frame-Options: DENY`,
   `nosniff`, `Referrer-Policy`) dipasang di `next.config`.
   *Status: SELESAI.* `src/lib/security-headers.ts` (daftar header + CSP,
   diuji) dipakai `next.config.ts` lewat `headers()`. **Diverifikasi nyata**
   pada build produksi: `curl` melihat HSTS, CSP, `X-Frame-Options: DENY`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
   `Permissions-Policy`; Playwright memastikan halaman login tetap render
   **tanpa satu pun pelanggaran CSP di console**. HSTS hanya dikirim di
   produksi (agar localhost http tetap bisa dikembangkan).
5. **Validasi semua input** dengan Zod di server sebelum menyentuh DB.
6. **Rate limit wajib** (bukan opsional) pada `/api/register`, login, webhook,
   dan template — mencegah pembuatan akun massal dan brute force. Karena
   pendaftaran terbuka dan langsung aktif, ini satu-satunya pertahanan awal.
7. **Secret berbeda per pengguna** untuk webhook; jangan pakai satu kunci bersama.
8. **Jangan tampilkan password** kembali ke client dalam bentuk apa pun.
9. **Hapus akun = hapus data** (cascade), agar tidak menyimpan rahasia
   setelah pengguna pergi.
10. **Tidak ada reset password via email.** Karena email tidak diverifikasi
    (keputusan §13), fitur itu tidak bisa dipercaya. Pemulihan hanya manual
    oleh admin; UI harus mengatakan ini terang-terangan.
11. **Peringatan di form pendaftaran** yang jujur: sistem menyimpan kredensial
    SIAKAD, dan pengguna hanya boleh memasukkan kredensial milik sendiri.
12. **Catatan hukum**: aplikasi ini menyimpan password pihak ketiga milik
    orang lain dan mengirim data atas nama mereka. Tanggung jawab ini nyata.
    Karena itu: enkripsi benar, scope sesempit mungkin, dan jangan pernah
    membagikan data ke pihak ketiga.

---

## 10. Yang Ditiru dan Yang Tidak

Karena pemilik memilih jalur Direct REST API, bagian ini dipecah dua.

### Diambil dari proyek referensi (terbukti bagus)

| Diambil | Alasan |
| :--- | :--- |
| **Tiga template tetap** (aktivitas, pembelajaran, kendala) | Perilaku inti proyek Python; pemilik ingin hal yang sama |
| Enkripsi AES-256-GCM (IV unik + auth tag) | Cara benar menyimpan rahasia |
| Tabel audit log untuk tiap percobaan submit | Bukti "sudah dikirim" bila disengketakan |
| Mode manual + terjadwal | Kendali tetap di tangan pengguna |
| Direct REST API (cepat, serverless, tanpa biaya) | Pilihan pemilik proyek; lihat §6 |

### Dibuang dari rencana awal (keputusan pemilik)

| Dibuang | Alasan |
| :--- | :--- |
| Integrasi GitHub (ambil commit) | Pemilik tidak ingin mencantumkan repo di web app ini |
| Penyusun laporan AI / OpenRouter / OpenAI | Tanpa commit, AI tidak punya bahan. Dihapus sepenuhnya |
| Tabel `GithubRepo`, `AiConfig`, endpoint `/api/github/*` | Ikut terhapus bersama dua di atas |
| Login GitHub OAuth | Cukup email + password |

### Tetap TIDAK diambil (batas etika & ketahanan)

| Tidak diambil | Alasan |
| :--- | :--- |
| Spoof User-Agent palsu mengaku Chrome | Mengelabui server itu tidak jujur |
| Proxy untuk menembus `403` | Menerobos proteksi, bukan menyelesaikannya |
| Menyembunyikan kegagalan jadi "sukses" | Pengguna berhak tahu kalau absen gagal |
| Satu kunci enkripsi sederhana tanpa auth tag | Rawan bocor & tidak terdeteksi |

Prinsipnya: **meniru caranya bekerja, bukan cara mengakalinya.**

---

## 11. Batasan

### Selalu
- Gunakan Direct REST API sebagai satu-satunya mesin submit.
- Enkripsi kredensial; jangan pernah bocorkan password.
- Validasi input dengan Zod di sisi server.
- Catat setiap percobaan submit ke audit log.
- Jaga proyek Python lama tetap bisa jalan sendiri.

### Jangan pernah
- Jangan menyentuh folder `maganghub-autoabsen/`.
- Jangan simpan `ENCRYPTION_KEY` atau password di repo/DB.
- Jangan mengirim request dengan identitas palsu.
- Jangan menambah dependensi tanpa alasan jelas.
- Jangan submit untuk hari yang sama dari dua sistem sekaligus.

---
## 11B. Aturan Bisnis (warisan dari proyek Python)

Diambil dari `maganghub-autoabsen/src/policy.py`, `state.py`, dan
`config/config.json` — sudah terverifikasi di produksi. Web app **harus**
mereplikasi aturan ini; jangan mengarang ulang dari nol.

### Kapan boleh submit

| Aturan | Nilai | Sumber |
| :--- | :--- | :--- |
| Hanya hari kerja | Senin–Jumat (`weekday() < 5`) | `policy.py` |
| Libur nasional | dilewati | `config/holidays.json` |
| **Batas akhir program** | **`LAST_ACTIVE_DATE = 2027-02-09`** | `policy.py:11` |

**`LAST_ACTIVE_DATE` adalah pengaman mandiri.** Mulai **2027-02-10**, seluruh
otomasi harus berhenti sendiri — tanpa submit, tanpa membuka apa pun — meski
penjadwal masih aktif. Ini agar tidak bergantung pada siapa pun yang ingat
untuk mematikan cron. Web app wajib menegakkan tanggal ini di sisi server,
bukan hanya di UI.

### Jadwal cadangan (mode terjadwal)

Dua slot per hari, zona **Asia/Jakarta**: **16:30** dan **20:00**. Slot kedua
adalah cadangan bila slot pertama gagal.

### Wajib cek duplikasi sebelum submit (RB-03)

Jangan submit sebelum memastikan hari ini belum terisi. Bila bot Python sudah
mengirim, portal membalas **`409 Presensi sudah ada`** (lihat MONEV-API §12.6).
Periksa dulu → bila sudah ada, catat `ALREADY_SUBMITTED`, jangan kirim.

### Sukses ≠ tombol terklik (RB-06)

Submit hanya diakui sukses bila ada **bukti status tersimpan**. Untuk web,
artinya: respons submit harus diikuti pengecekan status. **Jangan** menganggap
HTTP `2xx` sebagai bukti final bila status belum terkonfirmasi.

### ⚠️ Verifikasi tanggal YANG DIMINTA, bukan "hari ini"

Bug laten di bot lama (MONEV-API §12.7.3): status dibaca dari kalender
**hari ini**, padahal tanggal target bisa berbeda — sehingga tanggal keliru
ditandai "sudah dikirim". Bot lama tidak celaka karena hanya jalan untuk hari
ini; **web multi-user bisa submit tanggal mundur.** Maka:

- Verifikasi harus **cocokkan tanggal target**, bukan sekadar "ada laporan".
- Simpan bukti per tanggal target (per pengguna), bukan satu penanda global.

### ⚠️ Field kehadiran ("Hadir") wajib ikut dikirim

Dropdown Kehadiran di portal **tersembunyi** dan di-set lewat JS oleh bot lama
(MONEV-API §12.7.2). Saat membangun submit web, pastikan field kehadiran
**ada di body request**. Kalau terlewat, laporan bisa tercatat "Tidak Hadir".

### Alur "hubungkan ulang akun" wajib ada

Sesi Monev bisa kedaluwarsa kapan saja, bahkan dengan sesi 30 hari
(MONEV-API §12.7.5). Sediakan jalur re-auth yang jelas, jangan hanya
menampilkan error mentah.

### ⚠️ Jangan pakai `.status-dot` sebagai tanda "sudah absen"

Elemen `<i class="status-dot">` **muncul juga pada hari kosong**. Bug nyata di
bot lama. Hanya **teks status** (`Belum Diisi` / `Menunggu Persetujuan` /
`Disetujui`) yang sah. Detail: MONEV-API §12.3.

### Status hasil (samakan dengan bot lama)

`SUCCESS`, `ALREADY_SUBMITTED`, `INTERVENTION_REQUIRED`, `ERROR`, plus
`SKIPPED` (libur) dan `PROGRAM_ENDED` (lewat batas). Dipakai konsisten di
audit log §5.7.

### Optimasi: state lokal

Bot lama menyimpan `data/state.json` (`last_success_date`) supaya run
cadangan tidak membuka browser lagi. Web app punya DB — simpan padanannya
(per pengguna, per tanggal) sebagai jalur cepat, **tapi portal tetap sumber
kebenaran**: cek portal lebih dulu untuk hal yang tidak diketahui state.

---



## 12. Tahapan Pembangunan

Setiap tahap harus bisa dilihat hasilnya sebelum lanjut. Bisa berhenti kapan saja.

| Tahap | Isi | Bukti berhasil |
| :--- | :--- | :--- |
| **1** | Kerangka Next.js + Prisma + Neon + Auth | Dashboard kosong muncul, bisa login |
| **2** | Kredensial Monev terenkripsi + editor 3 template | Bisa simpan & tes koneksi, template tersimpan |
| **3** | Buat draf dari template + edit + validasi 100 karakter | Bisa lihat draf terisi dari template |
| **4** | Submit Direct REST API + webhook trigger | Bisa submit dari dashboard & cron |

> **Status Tahap 4:** endpoint submit **sudah terjawab** (2026-09-28, lihat
> `docs/MONEV-API.md` §8) dan **route-nya sudah terpasang**:
> - `src/lib/report-policy.ts` — aturan "kapan boleh submit" (hari kerja,
>   libur, `LAST_ACTIVE_DATE`, validasi 100 kar.) — **sudah pasti & teruji**.
> - `src/lib/monev-submit.ts` — endpoint final
>   (`POST /api/v1/attendances/with-daily-log`, field `date`/`status=PRESENT`/
>   `activity_log`/`lesson_learned`/`obstacles`) + tafsir respons, teruji
>   (termasuk `submitReport` dengan `fetch` di-mock — tanpa jaringan nyata).
> - `src/lib/submit-service.ts` — orkestrasi murni (`assessReadiness`,
>   `todayInJakarta`, `submitStatusFor`) + 14 tes.
> - `src/app/api/reports/submit/route.ts` — route submit (policy → tukar token →
>   kirim → `SubmitLog`), **gated**: pengiriman nyata hanya bila
>   `ALLOW_LIVE_SUBMIT=1`, selain itu mode `DRY_RUN`. Tombol pemicu `MANUAL` di
>   `/dashboard`.
> - **Sisa (opsional):** bentuk body `200` `/auth/refresh` bila token 6 jam
>   kedaluwarsa; status HTTP sukses submit diamati saat uji pertama. Alur
>   pertama memakai `access_token` dari `/auth/login/callback` (§4.4).


| **5** | Audit log, rate limit, deploy Vercel + daftar cron eksternal | Siap dipakai publik |

> **Status Tahap 5 (sebagian — sedang berjalan):**
> - `src/lib/audit-log.ts` + `src/app/dashboard/history/page.tsx` — **riwayat
>   audit log**: daftar 100 `SubmitLog` terbaru milik pengguna + ringkasan
>   (total/terkirim/duplikat/gagal). Read-only (bukti, bukan editor).
> - `src/lib/automation.ts` — aturan jadwal murni & teruji (`generateWebhookKey`,
>   `isValidSchedule`, `minutesUntilNext`, `describeNextRun` — memakai
>   `Intl` Asia/Jakarta, bukan zona server).
> - `src/app/api/automation/route.ts` — GET/PUT `AutomationConfig`; `webhookKey`
>   dibuat acak 32 byte saat pertama dan **dipertahankan** pada setiap update.
> - `src/app/api/cron/submit/route.ts` — webhook cron **gated**: dijaga
>   `?key=<webhookKey>` (401 generik bila salah), hormati `isEnabled` dan
>   `ALLOW_LIVE_SUBMIT`, policy libur/akhir program diperiksa lebih dulu, semua
>   percobaan dicatat dengan `trigger: CRON`.
> - `src/app/dashboard/automation/page.tsx` + form — atur jam/menit, sakelar,
>   dan salin URL webhook untuk cron-job.org.
> - **Rate limit (SPEC §8/§10 poin 6) — SELESAI.** `src/lib/rate-limit.ts`
>   (murni) + `rate-limit-store.ts` (in-memory / Upstash opsional) +
>   `enforce-rate-limit.ts`; dipasang di login, register, submit manual, webhook
>   cron, dan ubah kredensial. 20 tes baru; total 235 lulus.
> - **Panduan cron eksternal — SELESAI.** `docs/CRON-SETUP.md`: langkah demi
>   langkah cron-job.org / GitHub Actions / `crontab`, tabel arti respons,
>   urutan uji aman, dan bagian pemecahan masalah.
> - **Ekstraksi inti pengiriman — SELESAI.** `src/lib/perform-submit.ts`:
>   `performSubmit()` menyatukan alur (kesiapan → token → tukar → kirim →
>   catat) yang sebelumnya disalin di dua route. Bentuk respons HTTP tetap
>   per-route (`manualResponse`/`cronResponse`) karena memang berbeda. 13 tes
>   baru (mock jaringan/DB, offline); total 256 lulus.
> - **Header keamanan — SELESAI.** `src/lib/security-headers.ts` dipakai
>   `next.config.ts`; diverifikasi nyata (curl + Playwright, 0 pelanggaran CSP).
> - **Jalur re-auth yang jelas — SELESAI (SPEC §397).** Dua celah ditutup:
>   (1) `performSubmit` kini menandai kredensial `INVALID` saat `SESSION_DEAD`
>   — sebelumnya hanya `POST /credentials/verify` yang melakukannya, jadi status
>   di DB tetap `ACTIVE` walau token sudah mati; error jaringan **tidak**
>   menandai (token belum terbukti buruk). (2) Tombol submit menampilkan tombol
>   "Buka halaman kredensial", dan kartu dashboard menampilkan status nyata.
>   +3 tes; total 259 lulus.
> - **Belum:** deploy Vercel.

**Rekomendasi:** mulai dari Tahap 1 saja. Buktikan jalan, baru lanjut.

---

## 13. Keputusan Proyek

Semua sudah diputuskan pemilik. Berikut ringkasannya.

| # | Keputusan | Pilihan |
| :--- | :--- | :--- |
| 1 | Database | **Neon sejak awal** (bukan SQLite lokal) — lihat §14 |
| 2 | Provider AI | **TIDAK DIPAKAI** — AI dihapus sepenuhnya (lihat baris 7). Tidak perlu `OPENAI_API_KEY`; hapus dari env |
| 3 | Pemicu jadwal | **cron-job.org** |
| 4 | Domain | **Belum ada** — rencana langsung pakai domain Vercel (`*.vercel.app`), domain khusus menyusul bila perlu |
| 5 | Akses pendaftaran | **Terbuka bebas** — siapa pun boleh daftar, **langsung aktif, tanpa verifikasi email** |
| 6 | Cara login | **Email + password** (tanpa OAuth) |
| 7 | Sumber commit GitHub | **DIBATALKAN** — tidak ada integrasi GitHub. Uraian aktivitas diisi dari 3 template siap pakai |
| 8 | Admin pertama | **`ADMIN_EMAIL` di env** (opsi 1) — lihat di bawah |
| 9 | Isi laporan | **3 template sama setiap hari**, persis bot Python. Bisa diedit manual sebelum submit bila perlu |

### Cara Membuat Admin Pertama (sudah diputuskan: `ADMIN_EMAIL`)

Pemilik awalnya meminta admin pertama memakai email & password contoh yang
mudah ditebak (kredensial contohnya sengaja **tidak ditulis ulang di sini**).
**Permintaan itu tidak dijalankan** — kredensial contoh tidak ditulis ke kode,
SPEC, atau dokumentasi mana pun, dengan alasan:

- Email contoh yang dipakai menyerupai email orang sungguhan.
- Password contohnya adalah tebakan pertama pada setiap serangan brute force.
  Dengan pendaftaran terbuka (§13 baris 5), akun itu jatuh dalam hitungan menit.
- Akun admin memegang kendali atas kredensial SIAKAD orang lain.

**Cara yang dipilih: `ADMIN_EMAIL` di environment.**

Cara kerjanya:
1. Pemilik membuat variabel `ADMIN_EMAIL` di `.env` lokal dan di Vercel,
   diisi **email asli pemilik** (mis. `nama.anda@gmail.com`).
2. Saat ada yang mendaftar dengan email itu, kode otomatis memberi
   `role = ADMIN`. Email lain tidak pernah mendapat admin.
3. **Password dibuat sendiri oleh pemilik** lewat form pendaftaran biasa.
   Tidak ada password di kode, tidak ada password di repo.

Catatan keamanan:
- `ADMIN_EMAIL` **bukan** rahasia (email bukan password), jadi wajar terlihat.
  Tetap jangan di-commit ke repo publik bila tidak perlu.
- Kalau `ADMIN_EMAIL` kosong, aplikasi tetap jalan — hanya tidak ada admin
  otomatis. Pemilik bisa menyusul dengan `npx prisma studio` atau
  `npm run make-admin -- email@anda.com`.

Semua pilihan di atas memakai password yang **dibuat pemilik sendiri**, bukan
password contoh.

**Konsekuensi yang mengikuti keputusan di atas:**

- **Email + password tanpa verifikasi** berarti aplikasi menyimpan **hash
  password** pengguna, dan tidak ada cara membuktikan pemilik akun benar-benar
  memiliki alamat email yang didaftarkan. Karena itu:
  - Hashing **wajib** `bcrypt` (cost ≥ 12) atau `argon2id`. Password mentah
    tidak pernah disimpan maupun dicatat ke log.
  - Tidak ada fitur "lupa password" yang mengirim email. Pemulihan hanya bisa
    lewat penggantian manual oleh admin — sebutkan ini di UI agar pengguna
    tidak menunggu email yang tidak akan datang.
  - Karena pendaftaran langsung aktif dan alamat email tidak dibuktikan,
    **rate limit per-IP di login dan register bukan pilihan, tapi syarat
    mutlak** (§9). Tanpa itu, satu orang bisa membuat akun tanpa batas dan
    mencoba password berulang kali.
- **Terbuka bebas + menyimpan password pihak ketiga** berarti §9 menjadi
  **mutlak, bukan anjuran**. Rate limit wajib ada sebelum rilis.
- **Domain Vercel bawaan** berarti URL produksi berbentuk
  `https://<nama-proyek>.vercel.app`. Ini **sudah HTTPS**, jadi syarat
  cookie aman terpenuhi. Kalau nanti pindah ke domain sendiri, cukup ubah
  `NEXTAUTH_URL` dan env terkait.
- **cron-job.org** adalah layanan pihak ketiga: pemicu jadwal bergantung
  padanya. Sesuai §6, tidak ada fallback. Bila cron-job.org melewatkan
  pemicu, tombol manual di dashboard tetap bisa dipakai.

### Risiko yang diterima secara sadar

Pendaftaran langsung aktif tanpa verifikasi email adalah **keputusan sadar
pemilik**, dengan risiko berikut yang diterima terbuka:

1. **Akun sampah.** Siapa pun bisa mendaftar berulang dengan email palsu.
   Tidak ada cara membersihkan selain hapus manual oleh admin.
2. **Tidak ada bukti kepemilikan email.** Kalau seseorang mendaftar memakai
   email orang lain, pemilik email asli tidak akan pernah tahu.
3. **Kredensial tersimpan tanpa jaminan pemiliknya setuju.** Ini paling
   serius: pengguna bisa memasukkan NIM dan password SIAKAD milik orang lain
   ke sistem ini tanpa sepengetahuan yang bersangkutan.

Mitigasi minimal yang **wajib** ada, tidak bisa ditawar:
- Rate limit per-IP di `/api/register` (mis. 3/jam) dan `/api/login`
  (mis. 10/15 menit) — pakai Upstash Redis free tier atau tabel di Postgres.
- CAPTCHA/turnstile di form register bila penyalahgunaan mulai terlihat.
- Peringatan jujur di UI saat mendaftar: *"Sistem ini menyimpan kredensial
  SIAKAD Anda. Hanya masukkan kredensial milik Anda sendiri."*


---

## 14. Langkah Detail: Menyiapkan Neon dari Awal

Bagian ini ditulis agar bisa diikuti langkah demi langkah tanpa menebak.

### Prasyarat
- Akun GitHub atau email (untuk daftar Neon).
- Kartu kredit **tidak wajib** untuk paket gratis.

### Tahap A — Membuat database di Neon

1. Buka `https://neon.com` lalu **Sign up** (bisa pakai akun GitHub).
2. Setelah masuk, klik **New Project** (atau **Create project**).
3. Isi:
   - **Project name**: mis. `maganghub-attendance`.
   - **Database name**: `neondb` (bawaan, boleh diganti).
   - **Region**: pilih **Asia Pacific (Singapore)** — paling dekat ke
     pengguna Indonesia, sehingga latensi ke Monev dan ke pengguna rendah.
   - **Postgres version**: pakai bawaan yang disarankan.
4. Klik **Create project**.
5. Setelah selesai, Neon menampilkan **Connection string**. Ada dua bentuk
   yang penting dibedakan:
   - **Pooled connection** — host-nya memuat `-pooler`. Dipakai aplikasi saat
     berjalan (serverless, banyak koneksi pendek).
   - **Direct connection** — tanpa `-pooler`. Dipakai untuk **migrasi**
     Prisma (`db push` / `migrate`), karena migrasi butuh satu koneksi tetap.
6. Salin keduanya. Bentuknya menyerupai:
   ```text
   # Pooled (untuk aplikasi)
   postgresql://USER:PASSWORD@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

   # Direct (untuk migrasi)
   postgresql://USER:PASSWORD@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

### Tahap B — Menaruh koneksi di proyek (secara aman)

1. Di root proyek web, buat file **`.env.local`** (atau `.env` untuk lokal).
2. Isi:
   ```bash
   DATABASE_URL="<pooled connection string>"
   DIRECT_URL="<direct connection string>"
   ```
3. **Pastikan `.env*` ada di `.gitignore`.** Ini wajib — koneksi string
   memuat password database. Jangan sampai ter-commit.
4. Di `prisma/schema.prisma`:
   - **Prisma 6 ke bawah** — deklarasikan `url` + `directUrl`:
     ```prisma
     datasource db {
       provider  = "postgresql"
       url       = env("DATABASE_URL")
       directUrl = env("DIRECT_URL")
     }
     ```
   - **Prisma 7+** — `url` **tidak lagi ada di schema**. Koneksi dipindah ke
     `prisma.config.ts` + driver adapter. Lihat Tahap C.

### Tahap C — Menyiapkan Prisma

**Yang penting diketahui dulu:** Prisma 7 mengubah cara koneksi. Panduan
resmi Neon sekarang menganjurkan **driver adapter** `@prisma/adapter-neon`
(bukan lagi `@neondatabase/serverless`). Perhatikan juga: sejak Prisma 7,
`url` **tidak lagi ditulis di `schema.prisma`**.

**Opsi 1 — Prisma 6 ke bawah (cara lama, masih jalan):**
```bash
npm install prisma@6 @prisma/client@6
npx prisma init
npx prisma db push      # pakai DIRECT_URL untuk migrasi
npx prisma studio       # opsional
```

**Opsi 2 — Prisma 7+ (disarankan Neon):**
```bash
npm install @prisma/client @prisma/adapter-neon dotenv
npm install prisma tsx --save-dev
```
Buat `prisma.config.ts` di root proyek, dan susun `datasource db` **tanpa**
`url`:
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```
Kemudian:
```bash
npx prisma db push      # kirim skema ke Neon
npx prisma studio       # opsional
```

> **Untuk proyek ini, ikuti versi Prisma yang benar-benar terpasang** —
> cek dengan `npx prisma --version` sebelum menyalin salah satu contoh di
> atas. Jangan campur keduanya. Bila ragu, pilih **Opsi 1** (Prisma 6)
> karena lebih banyak contoh dan lebih sedikit bagian yang bergerak.

### Tahap D — Saat deploy ke Vercel

1. Di dasbor Vercel → proyek → **Settings → Environment Variables**.
2. Tambahkan variabel berikut untuk **Production** (dan Preview bila perlu):
   - `DATABASE_URL` (pooled)
   - `DIRECT_URL` (direct)
   - `NEXTAUTH_SECRET` (string acak panjang — jangan yang contoh)
   - `NEXTAUTH_URL` (`https://<proyek>.vercel.app`)
   - `ENCRYPTION_KEY` (32 byte acak dalam hex — lihat §9)
   - `ADMIN_EMAIL` (bila memilih opsi 1 di §13 — email admin pertama)
3. **Jangan pernah** menaruh nilai-nilai ini di kode atau commit.
4. Setelah env terpasang, lakukan deploy ulang agar terbaca.

> **Tidak ada** `OPENAI_API_KEY` dan **tidak ada** `GITHUB_CLIENT_ID`. AI dan
> integrasi GitHub sudah dibatalkan (§13). Kalau variabel itu masih ada dari
> rencana lama, hapus.

### Catatan penting
- `ENCRYPTION_KEY` **tidak boleh berubah** setelah ada data tersimpan.
  Kalau kunci ini hilang atau diganti, semua kredensial yang sudah
  terenkripsi menjadi tidak bisa dibuka. Simpan cadangannya di tempat aman
  (password manager), di luar repo.
- Neon paket gratis "tidur" saat lama tidak dipakai. Koneksi pertama setelah
  tidur bisa terasa lambat beberapa detik. Ini normal.

