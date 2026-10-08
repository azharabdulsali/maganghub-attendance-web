# SPEC.md: MagangHub Attendance Web

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
2. Menyimpan **tiga template tetap**, Uraian Aktivitas, Pembelajaran,
   Kendala, yang sama seperti proyek Python lama, masing-masing > 100 karakter.
3. Menyusun laporan harian dari template tersebut, dengan tiga cara:
   - **Tempel template apa adanya** (perilaku sama dengan bot Python).
   - **Salin ke editor lalu ubah manual** bila ingin berbeda tiap hari.
4. Memberi kebebasan memilih mode eksekusi:
   - **Mode Manual (default)**, review lalu submit 1-klik dari dashboard.
   - **Mode Terjadwal (opt-in)**, dipicu via webhook dari cron eksternal.
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
| Laporan | Tiga template tetap, sama tiap hari | **Sama, tiga template tetap**, tapi per pengguna & bisa diedit |
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
- Wajib HTTPS di produksi, cookie sesi tidak boleh lewat HTTP polos.

### 5.2 Manajemen Kredensial Monev
- Input email + password Monev.
- Simpan terenkripsi **AES-256-GCM**: IV unik per record, auth tag tersimpan,
  hanya ciphertext yang masuk DB.
- **Tes koneksi**: verifikasi kredensial masih valid tanpa menyimpan hasil login.
- Password **tidak pernah** dikembalikan ke client, bahkan ke pemiliknya.
  Untuk mengubah, pengguna harus mengetik ulang.

### 5.3 Template Laporan (pengganti Integrasi GitHub)
- Tiga kolom tetap: **Uraian Aktivitas**, **Pembelajaran yang Diperoleh**,
  **Kendala yang Dialami**, mengikuti proyek Python lama.
- Pengguna mengisi & menyimpan template sekali; dipakai ulang setiap hari.
- **Validasi > 100 karakter per kolom**, ditegakkan di kode (bukan hanya di UI),
  mengikuti validasi portal.
- Template bisa diubah kapan saja; perubahan tidak memengaruhi laporan yang
  sudah `SUBMITTED`.

### 5.3a Template Khusus Tanggal Tertentu
- Selain template harian, pengguna boleh menyimpan template untuk **tanggal
  tertentu** (`DatedReportTemplate`, unik per `userId + date`).
- Saat menyusun/mengirim laporan tanggal X: bila ada template bertanggal untuk
  X, itu yang dipakai; bila tidak ada, jatuh ke template harian. Satu aturan ini
  berlaku sama di **semua** jalur kirim (manual, cron, dan dispatch webhook).
- **Template bertanggal hanya menimpa ISI, bukan pemicu kirim.** Aturan libur
  tetap berlaku: otomasi tetap melewati Sabtu, Minggu, libur nasional, dan
  tanggal di luar masa program, walaupun ada template untuk tanggal itu.
- Menyimpan template untuk Sabtu **sah** (mis. agenda khusus), hanya saja
  otomasi tidak akan mengirim di hari itu. UI menandai tanggal tersebut
  "Libur" agar pengguna tidak salah paham.
- Aturan validasi (100–5000 karakter per kolom) sama persis dengan template
  harian; tanggal divalidasi bentuknya (`YYYY-MM-DD`) dan keberadaannya di
  kalender (menolak `2026-02-30`).
- Menghapus template bertanggal **tidak** menghapus `Report` yang sudah
  terkirim; riwayat adalah bukti, bukan bagian dari template.

### 5.4 Penyusun Laporan (tanpa AI)
- Laporan harian **berasal dari template pengguna**, bukan dari commit.
- Dua jalur, keduanya sah:
  1. **Pakai template langsung**, persis perilaku bot Python: isi sama tiap hari.
  2. **Salin lalu edit**, template jadi titik awal, pengguna mengubahnya manual
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

**Halaman riwayat (`/history`):** menyajikan audit log sebagai
**tabel** dengan **filter status** dan **paginasi** (20 baris/halaman).

- Filter & halaman disimpan di **URL** (`?status=FAILED&page=2`), bukan di state
  React. Konsekuensinya: tanpa JS, bisa di-bookmark, dan tombol "Back" browser
  berfungsi wajar. Nilai tak dikenal diam-diam jatuh ke "semua" (lihat
  `parseStatusFilter`) sehingga URL yang salah ketik tidak pernah error.
- Filter diterapkan **di database** (`where.status`), dan `count` memakai `where`
  yang sama, jadi angka "Halaman X dari Y" selalu cocok dengan isi tabel.
- Kartu **Ringkasan** sengaja dihitung dari **seluruh** log, bukan hanya halaman
  yang sedang tampil; kalau tidak, angkanya akan berubah tiap pindah halaman.
- Logika murni (`parseStatusFilter`, `parsePage`, `paginate`) ada di
  `src/lib/audit-log.ts` dan **teruji tanpa DB**.
- ⚠️ Jangan kirim `take: 0` ke Prisma (error). Halaman yang tersaring kosong
  tetap memakai `take` minimal 1, lihat `Math.max(1, ...)` di halaman.
- ⚠️ Di Next.js 16, `searchParams` adalah **Promise**, wajib `await`.
- Tidak ada tombol edit/hapus di sini: audit log adalah bukti, bukan data yang
  bisa diubah.

### 5.8 Kerangka Tampilan & Struktur URL

> **Keputusan pemilik (UI/UX putaran 1):** `/` adalah **landing page publik**
> (menjelaskan aplikasi), sedangkan `/dashboard` adalah **tampilan setelah
> login**. Halaman terlindungi dikelompokkan di route group `(app)` supaya
> sidebar dipasang sekali di `src/app/(app)/layout.tsx`. Tanda `(app)`
> **tidak muncul di URL**.
>
> **Revisi struktur URL (putaran 3):** hanya beranda yang tinggal di bawah
> `/dashboard`. Halaman lain dipindah ke rute **root** agar URL lebih pendek
> dan seragam (`/credentials`, `/history`, `/calendar`, …). Karena itu
> `layout.tsx` dinaikkan dari `(app)/dashboard/` ke `(app)/` supaya sidebar &
> penjagaan sesi tetap membungkus SEMUA halaman, bukan hanya `/dashboard/*`.
> URL lama (`/credentials`, dst.) tetap hidup lewat `redirects()` di
> `next.config.ts` (307, sementara).

| Halaman | URL |
| :--- | :--- |
| Landing publik (belum login) | `/` |
| Dashboard (setelah login) | `/dashboard` |
| Kalender kehadiran & laporan | `/calendar` |
| Kredensial Monev | `/credentials` |
| Template laporan | `/report-templates` |
| Riwayat absensi | `/history` |
| Otomasi | `/automation` |
| Panel admin | `/admin` |
| Alat diagnostik (admin) | `/dev-tools` |
| Profil (informasi akun) | `/profile` |
| Pengaturan (ubah akun) | `/settings` |

**Alur:** pengunjung membuka `/` (landing). Landing di sini **selalu**
ditampilkan (termasuk untuk pengguna yang sudah login) karena `/` adalah
halaman penjelasan aplikasi. **Jangan** menambahkan redirect otomatis dari `/`
ke `/dashboard`: dulu sempat ada, dan akibatnya setelah logout `/` langsung
memantul ke login lagi. Setelah login, pengguna diarahkan ke `/dashboard` lewat
`callbackUrl` di form login (bukan lewat `/`). Belum login namun membuka
halaman terlindungi (mis. `/calendar`), atau URL lama `/dashboard/*`? Layout
mengalihkan ke `/login`.

**Statistik dashboard (`/dashboard`):** halaman ini menampilkan empat kartu
ringkas (**Total kirim, Berhasil, Gagal, Duplikat**) plus kartu **"Kirim sukses
terakhir"** bila sudah ada, dan **grafik batang 30 hari**. Semua angka dihitung
di server dari tabel `SubmitLog` (dan disaring `userId` pengguna yang sedang
login; tidak ada agregasi lintas pengguna). Implementasinya terpisah agar
halaman tetap ringkas:

- `stats-query.ts`, perhitungan; memakai `prisma.submitLog.groupBy` untuk total
  per status dan `findMany` 30 hari untuk grafik.
- `stats-cards.tsx`, kartu angka (komponen tampilan murni).
- `trend-chart.tsx`, grafik batang **SVG murni**, tanpa library chart (menghindari
  dependensi baru; lihat AGENTS.md §2).

Zona waktu: hari dihitung pada **Asia/Jakarta (UTC+7)**, bukan UTC, supaya
"hari ini" cocok dengan hari kerja pengguna. Karena `Report.date` bertipe
`@db.Date` (tanpa jam), tren dihitung dari `SubmitLog.createdAt` yang punya
stempel waktu penuh.

**Keluar (logout):** tombol Keluar di sidebar memakai **Server Action** di
`src/components/sign-out-action.ts` yang memanggil `signOut({ redirectTo: "/" })`
dari `@/lib/auth` (NextAuth v5). Lalu lintas lama memakai `<form
action="/api/auth/signout" method="post">`, **itu salah**: tanpa CSRF token,
NextAuth menolaknya sehingga sesi **tidak** benar-benar terhapus dan pengguna
tampak "masih login". Jangan kembali ke pola itu.

> **⚠️ Jebakan Next.js:** direktif `"use server"` **tidak boleh** ditulis inline
> di dalam file yang `"use client"` (mis. sidebar). Turbopack akan menolak build
> dengan pesan menyesatkan *"'use client' directive must be placed before other
> expressions"*, padahal `"use client"` sudah di baris 1. **Aturannya: satu
> file, satu direktif.** Taruh Server Action di file `.ts` terpisah.

> **⚠️ Pelajaran (jangan diulang):** sempat terjadi **loop redirect tak
> berujung** (`ERR_TOO_MANY_REDIRECTS`) karena dua file mengklaim URL `/` yang
> sama (`src/app/page.tsx` (landing) dan `src/app/(app)/page.tsx` (dashboard))
> lalu landing (`src/app/page.tsx`) mengarahkan sesi aktif ke `/`. Karena
> route group tidak muncul di URL, keduanya bertabrakan di `/`. **Aturan:**
> satu URL, satu file. Setelah login, tujuannya **wajib** `/dashboard`, bukan
> `/`.

**Navigasi:** `src/components/app-sidebar.tsx`, sidebar tetap di layar lebar
(≥ `md`) dan laci geser (*drawer*) di layar kecil. Menu **berbeda antara USER
dan ADMIN**: item khusus admin (`/admin`, `/dev-tools`) hanya
muncul bila `role === "ADMIN"`. Penyembunyian tautan ini **bukan** pengaman;
penjagaan sesungguhnya tetap di server (layout + pemeriksaan peran di tiap
halaman).

**Profil vs Pengaturan:** ada pembagian yang disengaja antara *melihat* dan
*mengubah*:

- **`/profile`**, **INFORMASI saja** (baca saja): email, peran, tanggal
  bergabung, dan status kredensial Monev. Tidak ada tombol yang mengubah apa pun
  di sini; ada tautan ke `/settings`.
- **`/settings`**, **TINDAKAN** yang mengubah akun: ubah email, nama tampilan,
  kata sandi, dan keluarkan perangkat lain. Semua halaman terlindungi (di dalam
  grup `(app)`) sudah otomatis butuh login.

**Ubah email:** kartu "Email" di `/settings` memanggil `POST /api/account/email`.
Ini perubahan **paling sensitif** di aplikasi karena email adalah identitas login
**dan** penentu peran admin (`isAdminEmail`). Karena proyek ini tidak mengirim
email verifikasi, perubahan berlaku langsung, **salah ketik = akun terkunci
permanen** (tidak ada pemulihan akun); UI memperingatkan hal ini secara eksplisit.
Pengamanannya:

- `userId` diambil dari **sesi**, bukan body.
- **Kata sandi saat ini wajib** dan diverifikasi (`bcrypt.compare`), pengganti
  verifikasi email.
- **Guard eskalasi peran:** pengguna non-admin **tidak boleh** menetapkan email
  yang sama dengan `ADMIN_EMAIL` (kalau tidak, ganti email = naik jadi admin).
  Logika murni ada di `src/lib/email-change-policy.ts`.
- Email dinormalisasi (`trim` + `lowercase`) agar satu email hanya punya satu
  bentuk, konsisten dengan jalur login/daftar.
- Email harus belum dipakai akun lain (dicek lebih awal; `P2002` ditangani untuk
  balapan).
- `sessionVersion` dinaikkan → **semua sesi lain dicabut**, dan sesi yang sedang
  dipakai diselaraskan lewat `useSession().update({ email, sessionVersion })`.
  Callback `jwt`/`session` di `src/lib/auth.ts` menyalin email baru ke klaim token
  supaya sidebar tidak menampilkan email lama.
- Peran **tidak pernah** diberikan lewat endpoint ini.

**Ubah kata sandi (dalam sesi, tanpa email):** kartu "Kata sandi" di `/settings`
memanggil `POST /api/account/password`. Pengguna harus memasukkan kata sandi
lama (diverifikasi `bcrypt.compare`) sebelum hash baru disimpan, ini pengganti
verifikasi email karena proyek ini tidak mengirim email. Kata sandi baru minimal
8 karakter, harus sama dengan konfirmasi, dan harus berbeda dari yang lama.
Mengubah kata sandi **mencabut semua sesi di perangkat lain** (lihat §5.8b);
perangkat yang dipakai mengganti tetap aktif, jadi pengguna tidak perlu login
ulang di situ. Sebelumnya sesi lain dibiarkan hidup, lihat §11 "Keterbatasan"
untuk riwayatnya.

### 5.8b Invalidasi sesi (perangkat lain), `sessionVersion`

Sesi memakai **JWT**, jadi tidak ada daftar sesi yang bisa dihapus satu per
satu. Invalidasi dilakukan dengan **generasi sesi**:

- `User.sessionVersion Int @default(0)`.
- Saat login (`authorize`), nilai ini disalin ke klaim JWT `sessionVersion`.
- Callback `jwt` membandingkan klaim token dengan nilai di DB pada setiap
  permintaan. Bila berbeda → `return null`, dan Auth.js menghapus cookie sesi
  itu (perilaku terverifikasi di `@auth/core/lib/actions/session.js`:
  `if (token !== null) {...} else { sessionStore.clean() }`).
- Menaikkan `sessionVersion` (`{ increment: 1 }`) mencabut **semua** JWT yang
  masih memegang versi lama.

Dua pemicu:

1. **Ganti kata sandi** (`POST /api/account/password`), menaikkan versi, lalu
   mengembalikan `sessionVersion` baru. Perangkat yang sedang dipakai
   memperbarui sesinya lewat `useSession().update({ sessionVersion })`, sehingga
   tidak ikut ter-logout.
2. **Tombol "Keluar dari semua perangkat lain"**, kartu "Perangkat lain" di
   `/settings` memanggil `POST /api/account/sessions/revoke` (rate limit 5/10
   menit, scope `sessionRevoke`). Berkonfirmasi dua langkah karena tidak bisa
   dibatalkan. Ganti email juga menaikkan versi (lihat §5.8 di atas), jadi
   memicu pencabutan yang sama.

**Keamanan nilai dari klien:** `useSession().update(data)` dikirim lewat
`POST /api/auth/session` dan tiba di callback `jwt` sebagai `session` saat
`trigger === "update"`. Karena berasal dari klien, nilainya **tidak dipercaya**:
hanya angka bulat ≥ 0 diterima (`versiSesiDariKlien`, `src/lib/session-version.ts`).
Klaim yang menurunkan versi tidak berpengaruh karena permintaan berikutnya tetap
dicocokkan dengan DB.

**Catatan implementasi:** sesi yang diterbitkan sebelum kolom ini ada tidak
memiliki klaim `sessionVersion`, sehingga dianggap tidak sah dan memaksa login
ulang sekali. Ini disengaja (pilihan aman) dan sifatnya sekali saja saat rilis.

### 5.9 Kalender Kehadiran & Laporan (`/calendar`)

Halaman **baca-saja** yang menampilkan status submit absensi & laporan per
**bulan**, satu kotak per tanggal. Tujuan: memberi gambaran visual "hari mana
sudah terkirim, mana yang masih kosong", melengkapi tabel linear di `/history`.

- **Sumber data:** `SubmitLog` (dikelompokkan per tanggal WIB; status paling
  penting menang, SUCCESS > FAILED > DUPLICATE) dan `Report` (menandai draft).
  Semua disaring `userId`, pengguna (termasuk ADMIN) hanya melihat kalendernya
  SENDIRI; kalender lintas pengguna adalah pekerjaan terpisah.
- **Warna sel** (`DayStatus`): **Terkirim** (SUCCESS) · **Draft** (ada `Report`,
  belum sukses) · **Gagal** (FAILED tanpa sukses) · **Belum diisi** (`,`).
- **Jujur:** kiriman `DUPLICATE` saja tidak dinaikkan ke "Terkirim"; sel tanpa
  data menampilkan `,`, bukan klaim palsu.
- **Navigasi bulan** lewat query param `?month=YYYY-MM` (server-rendered,
  tanpa state klien). Bulan tak sah jatuh ke bulan berjalan, URL salah ketik
  tidak pernah membuat halaman error.
- **Logika murni** ada di `src/lib/calendar.ts` (kisi bulan, batas WIB,
  klasifikasi) + ujinya `src/lib/calendar.test.ts`. Batas hari memakai WIB
  (UTC+7) yang sama dengan `stats-query.ts`.


### 5.10 Panel Admin (`/admin`)

> **Keputusan (UI/UX putaran 2):** halaman admin pertama dibangun **hanya-baca**.
> SPEC §4 menyebut admin dapat "kelola semua pengguna, lihat audit log,
> statistik, paksa submit". Dari daftar itu, **statistik** dan **audit lintas
> pengguna** sudah punya data & aturan yang jelas, jadi dikerjakan lebih dulu.
> Mengubah peran, menghapus pengguna, dan memaksa submit **belum** dibuat: ketiga
> tindakan itu mengubah data orang lain dan belum punya aturan aman/backend.
> Menampilkannya sebagai tombol kosong akan menjanjikan hal yang tidak ada.

Halaman ini memuat tiga bagian:

1. **Ringkasan**, kartu: total pengguna, jumlah admin, kredensial aktif, otomasi
   aktif, dan berapa pengguna yang pernah submit. Dihitung dari daftar pengguna
   (`summarizeUsers`, murni & teruji).
2. **Daftar pengguna**, tabel per pengguna: identitas (nama/email), peran,
   status kredensial, otomasi, jumlah laporan, jumlah submit, dan waktu kirim
   terakhir. Diurutkan admin lebih dulu, lalu yang terbaru bergabung.
3. **Audit lintas pengguna**, `SubmitLog` semua pengguna, memakai **filter status
   & paginasi yang sama** seperti `/history` (20 baris/halaman,
   `?status=&page=` di URL). Kolom audit: waktu, nama, email, status, pemicu,
   HTTP, keterangan. Di atas tabel ada filter rentang waktu, status, dan **nama
   pengguna** (`?user=<id>`, label memakai nama, jatuh ke email bila kosong).
   Logika murni dipakai ulang dari `src/lib/audit-log.ts` supaya tampilan kedua
   halaman konsisten.

Penjagaan peran ada di **server** halaman: sesi tanpa `role === "ADMIN"` langsung
dialihkan ke `/dashboard`. Helper murni ada di `src/lib/admin.ts` (label status
kredensial, `summarizeUsers`, `formatJoinDate`, `initialsFor`,
`labelForAuditUserOption`) dan diuji tanpa DB di `src/lib/admin.test.ts`. Query DB
dipisah di `admin-query.ts` (pola sama seperti `stats-query.ts`).

**Pemantauan otomasi & jalankan per-user.** Tabel pengguna juga menunjukkan
**jadwal** tiap user (`AutomationConfig.hour/minute`, mis. `07:30 WIB`) dan
**status hari ini** ("Belum jalan" / "Sudah jalan" / "Gagal" + jam percobaan
terakhir). Aturan murninya ada di `src/lib/admin-automation.ts` (teruji):
`jakartaDayRange(now)` menentukan batas hari WIB, `scheduleLabel` memformat jam,
dan `assessTodayRun(logs, now)` menilai status — "sudah jalan" = ada `SubmitLog`
apa pun hari ini; status log terakhir menang (FAILED → "Gagal"). Setiap baris
punya tombol **Jalankan** yang memanggil `POST /api/admin/dispatch/user` untuk
**memaksa** jalankan otomasi user itu, mengabaikan jam jadwalnya (untuk mengejar
yang terlewat). Eksekusinya memakai `performSubmit` yang SAMA dengan dispatcher
massal, jadi kebijakan laporan (libur/akhir pekan/akhir program, pra-cek duplikat,
gerbang `ALLOW_LIVE_SUBMIT`) tetap berlaku — "paksa" = abaikan jam, bukan abaikan
kebijakan. Pemicunya tercatat `CRON` di audit log.

> **⚠️ Sama seperti riwayat:** jangan kirim `take: 0` ke Prisma, halaman audit
> yang tersaring kosong tetap memakai `take` minimal 1.

### 5.11 Komponen bersama UI (badge & kotak pesan)

Dua pola tampilan sebelumnya **disalin-tempel berulang**; keduanya kini punya
satu sumber kebenaran. Jangan menulis ulang polanya secara inline.

- **`src/components/ui/badge.tsx`, `<Badge tone>`.** Sebelumnya peta warna
  (`bg-main`/`bg-secondary-background`/`bg-foreground`) dan markup `<span>`
  badge disalin di `history/page.tsx` (`BADGE_CLASS`), `admin/page.tsx`
  (`BADGE_CLASS` + `TONE_CLASS`), dan `dashboard/page.tsx`. Bila salah satu
  diubah, halaman lain bisa **berbeda warna diam-diam** untuk status yang sama.
  Kini semuanya memakai `<Badge>`. Terjemahan dari kosakata `lib/audit-log.ts`
  (`success`/`failure`/`warning`) ke `Tone` dilakukan oleh
 `toneForBadgeVariant()` (**ditaruh di komponen, bukan di halaman**) sehingga
  tabel riwayat & tabel audit admin dijamin sewarna.
- **`src/components/ui/message.tsx`, `<Message tone>`.** Menggantikan pola
  `rounded-base border-2 border-border px-3 py-2 text-sm` + logika "ini kotak
  sukses atau error?" yang dulu diulang di ~6 berkas (login, credentials,
  automation, dev-tools, submit). `role`/`aria-live` sudah diisi: `bad` →
  `alert`, nada lain → `status`.

**Kosakata nada tunggal.** `Tone = "good" | "bad" | "neutral"` didefinisikan
sekali di `src/lib/admin.ts` dan dipakai oleh `<Badge>`, `<Message>`, dan
`stats-cards.tsx`. Jangan mendeklarasikan ulang union `"good" | "bad" |
"neutral"` di berkas baru, impor `Tone` saja.

> **Uji murni:** `toneForBadgeVariant()` dikunci di
> `src/components/ui/badge.test.ts` (tanpa DOM) supaya pemetaan nada tidak
> berubah tanpa sengaja.

### 5.12 Umpan balik aksi: dialog konfirmasi & toast

Dua mekanisme untuk menjawab "apakah klik saya berhasil?", keduanya **memakai
komponen resmi dari registry neobrutalism** (Base UI di baliknya), bukan ditulis
dari nol: fokus, tombol Esc, dan atribut ARIA jangan dibuat sendiri kalau sudah
ada. Seluruh komponen `src/components/ui/**` sekarang berasal dari registry
(`npx shadcn@latest add <url-neobrutalism>`) dan **tidak ditulis tangan lagi**;
yang menyusun/menyetelnya hanya berkas komposisi (mis. `date-picker.tsx`,
`confirm-dialog.tsx`).

- **`src/components/ui/confirm-dialog.tsx`, `<ConfirmDialog>`.** Pengganti
  `window.confirm` untuk aksi yang tidak bisa dibatalkan. Dialog bawaan browser
  memblokir tab, tampil beda tiap OS, dan tidak bisa memuat konteks. Yang ini
  **menyusun** komponen resmi `alert-dialog.tsx` (`AlertDialog`/`Content`/
  `Header`/`Title`/`Description`/`Footer`/`Action`/`Cancel`) sehingga dapat focus
  trap, Esc, `role="alertdialog"`, dan fokus awal pada tombol batal, gratis. API
  luar tetap sama (`title`, `description`, `confirmLabel`, `cancelLabel`,
  `confirmVariant`, `hideConfirm`, `onConfirm`), dan `Action`/`Cancel` adalah
  primitif Close resmi sehingga `onOpenChange(false)` tetap terpanggil. Dipakai
  di halaman template laporan saat menekan **Hapus**, dan di tengah menu lain
  (kredensial, keluar).
- **`src/components/ui/toast.tsx`, `<Toaster>` + `useToast()`.** Notifikasi sudut
  layar, memakai komponen resmi Base UI `Toast` (`createToastManager`). Muncul
  karena **banyak form menaruh tombol di bawah sementara pesan suksesnya di
  atas**, pengguna yang harus menggulir tidak melihatnya. Toast selalu di posisi
  sama. Provider dipasang sekali di `src/app/providers.tsx`. Registry memakai
  API manager (`toast.add({ title, description, type })`); proyek menambahkan
  lapisan kompatibilitas tipis (`toast.success/error/...`) di berkas yang sama
  agar ~15 pemanggil lama tidak perlu diubah dan gayanya tetap satu jalur.

> **Batasan penting, toast ≠ `<Message>`.** Pesan yang perlu dibaca sambil
> memperbaiki isian (mis. "nama minimal 3 karakter") tetap **inline** memakai
> `<Message>`; toast untuk hasil akhir yang tidak perlu ditindaklanjuti. Jangan
> menaruh toast pada aksi yang sudah punya kotak hasil kaya, mis. tombol
> [Kirim Absen] atau [Analisis] sengaja **tidak** memunculkan toast karena
> kotaknya sudah memuat status, pesan, tanggal, dan jalur re-auth. Toast di sana
> hanya menduplikasi. Begitu pula [Masuk]/[Daftar]: keduanya langsung berpindah
> halaman, sehingga toast akan buyar sebelum terbaca.

> **Nada tetap satu sumber.** Toast, Badge, dan Message memakai peta warna dan
> `Tone` yang sama. `src/components/ui/badge.test.ts` mengunci pemetaan nada
> badge; lapisan kompatibilitas toast (`toast.success/error/...`) memetakannya ke
> tipe Base UI (`success`/`error`/`info`/`warning`/`loading`) sehingga warnanya
> tidak pernah berbeda dari badge.

**Cakupan.** Dialog & toast dipakai di **seluruh menu**, bukan satu halaman:

| Menu | Dialog | Toast |
| --- | --- | --- |
| `/report-templates` | Hapus template | simpan, hapus (sukses & gagal) |
| `/credentials` | Hapus kredensial | simpan, hapus, login otomatis, tes token |
| `/automation` | - | simpan, salin URL |
| `/profile` | (|) (halaman informasi, tak ada aksi) |
| `/settings` | - | simpan nama, ubah kata sandi, ubah email, keluar dari perangkat lain |
| `/dev-tools` | - | analisis selesai/gagal |
| Sidebar (semua halaman) | Keluar | - (halaman pindah, toast akan buyar) |
| `/login`, `/register` | (|) (lihat batasan di atas) |

Tombol [Kirim Absen] **tanpa** toast: kotak hasilnya sudah memuat status,
pesan, tanggal, dan tombol jalur re-auth. Menambah toast di sana hanya akan
mengabarkan dua hal sekaligus untuk satu kejadian.

> **Aturan menambah aksi baru.** Setiap tombol yang mengubah data harus
> menjawab pertanyaan ini: apakah pengguna tahu hasilnya tanpa menggulir?
> Jika tidak (tambahkan toast. Jika aksinya tidak bisa dibatalkan)
> pakai `<ConfirmDialog>`, jangan `window.confirm` atau `confirm`.



---

## 6. Cara Submit, Keputusan Kunci

**Keputusan (atas pilihan pemilik proyek): memakai Direct REST API, tanpa
browser, tanpa worker, tanpa biaya bulanan.**

Bentuk sistem:
- Web app di Vercel serverless (100% gratis di paket hobby).
- Submit berupa HTTP request langsung ke API Monev dari dalam serverless
  function. Tidak ada Chromium, tidak ada proses yang selalu nyala.
- Pemicu jadwal dari **cron eksternal gratis** (cron-job.org atau GitHub
  Actions) yang memanggil `GET /api/cron/submit` dengan header
  `Authorization: Bearer <webhookKey>` (query `?key=` lama masih diterima
  sampai 1 Jan 2026, lalu dihapus).

**Biaya bulanan: Rp0.** Semua komponen memakai paket gratis.

**Konsekuensi yang harus diterima (disadari, bukan tersembunyi):**
1. Web app **pasif**, ia tidak bisa "bangun sendiri". Ia hanya submit saat
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

5. Isi laporan **sama setiap hari** bila pengguna memakai template apa adanya, persis seperti bot Python. Ini bukan kekurangan tak terduga, melainkan
   perilaku yang diinginkan pemilik. Pengguna yang ingin berbeda cukup
   mengedit draf sebelum submit.

**Etika request (batas yang dipegang):**
- Request dikirim sebagai HTTP client biasa dengan header wajar
  (`Accept`, `Accept-Language`, `Content-Type`).
- **Tidak** memakai User-Agent palsu yang mengaku Chrome.
- Jika `403` muncul, pesannya ditampilkan terus terang ke pengguna dan
  dicatat di audit log, bukan ditutupi dengan penyamaran.

**✅ DIPUTUSKAN & DIUJI ULANG (2026-06, DIPERBARUI) — proxy residensial DIIZINKAN untuk login SSO.**

Fakta yang sudah dikonfirmasi:
- Yang dijaga Cloudflare Managed Challenge **hanya halaman login SSO**
  (`account.kemnaker.go.id`). Aplikasi ini, saat dijalankan dari IP datacenter
  (Vercel), selalu gagal di langkah `sso-prime` (GET `/auth`) dengan
  `403` + `cf-mitigated: challenge` — **jauh sebelum password dicek**.
- **API Monev TIDAK diblokir**: `monev_refresh_token` yang dipanen dari browser
  pengguna dipakai memanggil `POST /auth/refresh` dari Vercel → `ACTIVE`.
- **Repo referensi `maganghub-bot-attendance` berhasil login** (mencapai
  `/auth/login`, dapat `code`, tukar sesi) memakai **proxy residensial**:
  `axios` + `https-proxy-agent` (`HttpsProxyAgent`) yang diaktifkan
  `MAGANGHUB_PROXY_URL`.

**KEPUTUSAN:** larangan lama "*Tidak memakai proxy untuk menembus `403`*"
**dicabut oleh pemilik** untuk jalur login SSO. Alasan: proxy membuat request
datang dari **IP residensial** — tempat challenge Cloudflare lolos **secara
wajar**, persis seperti browser pengguna sendiri. Ini **bukan** mengecoh
CAPTCHA/OTP/MFA dan **bukan** menyamar sebagai identitas orang lain (UA tetap
wajar, bukan memalsukan orang). Kebijakan lama di `AGENTS.md` §73 yang
mengatakan "jangan tambahkan proxy" sudah **diperbarui**.

**Cara implementasi (jaga tetap aman):**
- Env var `MAGANGHUB_PROXY_URL` (**opsional**; sama nama dengan repo referensi).
  Bila kosong → perilaku lama (`fetch` biasa), nol perubahan.
- Implementasi terpusat: `src/lib/proxy-fetch.ts` (`fetchPortal`) memakai
  `undici.ProxyAgent` sebagai `dispatcher`. Dipakai **hanya** di jalur yang
  menyentuh host SSO (`kemnaker-sso.ts` langkah 2/2b/3b, `monev-login.ts`
  prime). **API Monev TIDAK lewat proxy.**
- Proxy URL **tidak pernah** ditulis ke log/pesan error (bisa memuat sandi).

**Jalur tempel token tetap ada sebagai fallback (Opsi B):**
1. Pengguna membuka portal Monev di browser sendiri dan login normal.
2. Salin cookie `monev_refresh_token` (DevTools → Application → Cookies) dan
   tempel di `/credentials` (`POST /api/credentials/verify`, panduan di
   `src/lib/guides.ts`).
3. Aplikasi menukar refresh token → access token; sesi ±30 hari.

Dengan proxy aktif, langkah manual itu **tidak lagi wajib** — pengguna cukup
menekan "Uji Login" dan sesi tersimpan otomatis. Jalur manual tetap berguna
bila proxy tidak tersedia/diblokir.

Batas yang tetap dipegang: tidak mengakali CAPTCHA/OTP/MFA, tidak menyamar
sebagai identitas lain, tidak memalsukan UA; semua kegagalan dilaporkan terus
terang ke pengguna + audit log. Lihat juga `AGENTS.md` §73 dan
`docs/MONEV-API.md` §9.

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
| `DatedReportTemplate` | userId, `date` (`@db.Date`), 3 kolom; unik per `userId + date` (penimpa harian) |
| `Report` | userId, tanggal, activity, learning, obstacles, source, status |
| `SubmitLog` | reportId, userId, status, message, httpCode, pemicu, attempt |
| `AutomationConfig` | userId, isEnabled, `webhookKey`, jam, timezone |

Enum: `Role`, `CredentialStatus`, `SourceType`, `ReportStatus`, `SubmitStatus`,
`TriggerType`.

`SourceType` nilainya menjadi `TEMPLATE` dan `MANUAL_EDIT`, nilai `GITHUB`
**dihapus**. Model `GithubRepo` dan `AiConfig` **dihapus seluruhnya**.

Batasan: `Report` unik per `(userId, date)`, mencegah draf ganda.

---

## 8. Endpoint API

| Method | Endpoint | Deskripsi | Auth | Rate limit |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/register` | Daftar akun baru (email + password) | Publik | **3/jam per IP** |
| `GET` | `/api/cron/submit` | Memicu submit otomatis (dipanggil cron eksternal) | Header `Authorization: Bearer` (dianjurkan) **atau** query `key` | 30/5 menit per IP |
| `GET` | `/api/cron/run-all` | Dispatcher massal: proses semua user yang jadwalnya jatuh di jam ini | `Authorization: Bearer <CRON_SECRET>` | - (rahasia) |
| `POST` | `/api/admin/dispatch` | Pemicu manual dispatcher massal dari Panel Admin | Cookie sesi + role **ADMIN** | - (hanya admin) |
| `POST` | `/api/admin/dispatch/user` | Admin memaksa jalankan otomasi SATU user terpilih (abaikan jam jadwal) | Cookie sesi + role **ADMIN** | **20/10 menit per admin** (`adminUserAction`) |
| `GET/PUT` | `/api/automation` | Baca/simpan jadwal otomasi + webhook key | Cookie sesi | 20/menit |
| `GET/POST` | `/api/auth/[...nextauth]` | Autentikasi (login/logout) | Publik / callback | **10/15 menit per IP** (login) |
| `GET/PUT` | `/api/template` | Baca & simpan 3 template pengguna | Cookie sesi | 20/menit |
| `GET/PUT/DELETE` | `/api/report-templates/dated` | Kelola template per-tanggal (`?date=` untuk DELETE) | Cookie sesi | 20/menit |
| `POST` | `/api/reports/draft` | Buat draf dari template | Cookie sesi | 20/menit |
| `POST` | `/api/reports/submit` | Kirim draf langsung ke Monev | Cookie sesi | 20/10 menit per pengguna |
| `PATCH` | `/api/profile` | Ubah nama tampilan pengguna sendiri | Cookie sesi | - (belum dibatasi) |
| `POST` | `/api/account/password` | Ubah kata sandi sendiri (dalam sesi, tanpa email) | Cookie sesi | 5/10 menit per pengguna |
| `POST` | `/api/account/email` | Ubah email sendiri (verifikasi kata sandi + guard eskalasi peran) | Cookie sesi | 5/10 menit per pengguna |

**Implementasi rate limit (Tahap 5):** kebijakan murni di `src/lib/rate-limit.ts`
(jendela tetap, teruji dengan waktu disuntik), penyimpanan di
`src/lib/rate-limit-store.ts`, **in-memory** secara default, atau **Upstash
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
   Kunci ini **tidak boleh berubah** setelah ada data, lihat §14.
2. **Hash password pengguna** dengan `bcryptjs` (cost ≥ 12).
   Password mentah tidak pernah disimpan, tidak pernah di-log, tidak pernah
   dikembalikan ke client.
3. **Jangan pernah log password**, tidak di console, tidak di audit log,
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
   dan template, mencegah pembuatan akun massal dan brute force. Karena
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
| **Penyusun draf LOKAL** (`report-draft.ts`, 0 token) | **DIPERTAHANKAN sebagai fallback wajib.** Merakit 3 kolom dari kata kunci + pustaka frasa. Selalu tersedia, tanpa provider luar. Dipakai bila `GEMINI_API_KEY` kosong ATAU LLM gagal (kuota habis / timeout / jaringan putus / jawaban tidak lolos validasi). |
| **Penyusun draf LLM** (`report-draft-llm.ts`, Gemini) | **DITAMBAHKAN atas keputusan pemilik.** Gratis, key milik admin dipakai bersama semua pengguna. ⚠️ Kata kunci aktivitas pengguna dikirim ke Google saat aktif; jangan pasang billing agar kuota habis = ditolak, bukan menagih otomatis. |
| Tabel `GithubRepo`, `AiConfig`, endpoint `/api/github/*` | Ikut terhapus bersama dua di atas |
| Login GitHub OAuth | Cukup email + password |

### Tetap TIDAK diambil (batas etika & ketahanan)

| Tidak diambil | Alasan |
| :--- | :--- |
| Spoof User-Agent palsu mengaku Chrome | Mengelabui server itu tidak jujur |
| ~~Proxy untuk menembus `403`~~ **(DICABUT 2026-06)** | Proxy residensial **DIIZINKAN** untuk login SSO (§6): membuat request datang dari IP residensial tempat Cloudflare lolos wajar, bukan menerobos proteksi. API Monev tetap tanpa proxy. |
| Menyembunyikan kegagalan jadi "sukses" | Pengguna berhak tahu kalau absen gagal |
| Satu kunci enkripsi sederhana tanpa auth tag | Rawan bocor & tidak terdeteksi |

Prinsipnya: **meniru caranya bekerja, bukan cara mengakalinya.** (Login via IP
residensial = meniru browser pengguna; bukan mengakali CAPTCHA.)

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

### Keterbatasan yang diketahui
- **Invalidasi sesi kini memerlukan satu query DB per permintaan ber-sesi.**
  Callback `jwt` memeriksa `sessionVersion` ke DB setiap permintaan (§5.8b).
  Ini harga dari invalidasi lintas perangkat pada strategi JWT. Kelihatannya
  murah (satu `findUnique` ber-indeks primary key), tetapi tetap layak dipantau
  bila trafik naik.
- ~~Sesi lama tidak otomatis berakhir setelah ganti kata sandi.~~ **Sudah
  teratasi** (fitur `sessionVersion`, §5.8b). Sesi di perangkat lain dicabut saat
  ganti kata sandi maupun lewat tombol di `/profile`. Catatan: sesi yang terbit
  sebelum rilis ini memaksa login ulang satu kali.

---
## 11B. Aturan Bisnis (warisan dari proyek Python)

Diambil dari `maganghub-autoabsen/src/policy.py`, `state.py`, dan
`config/config.json`, sudah terverifikasi di produksi. Web app **harus**
mereplikasi aturan ini; jangan mengarang ulang dari nol.

### Kapan boleh submit

| Aturan | Nilai | Sumber |
| :--- | :--- | :--- |
| Hanya hari kerja | Senin–Jumat (`weekday() < 5`) | `policy.py` |
| Libur nasional | dilewati | `config/holidays.json` |
| **Batas akhir program** | **`LAST_ACTIVE_DATE = 2027-02-09`** | `policy.py:11` |

**`LAST_ACTIVE_DATE` adalah pengaman mandiri.** Mulai **2027-02-10**, seluruh
otomasi harus berhenti sendiri (tanpa submit, tanpa membuka apa pun) meski
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
**hari ini**, padahal tanggal target bisa berbeda, sehingga tanggal keliru
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
cadangan tidak membuka browser lagi. Web app punya DB, simpan padanannya
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
> - `src/lib/report-policy.ts`, aturan "kapan boleh submit" (hari kerja,
>   libur, `LAST_ACTIVE_DATE`, validasi 100 kar.), **sudah pasti & teruji**.
> - `src/lib/monev-submit.ts`, endpoint final
>   (`POST /api/v1/attendances/with-daily-log`, field `date`/`status=PRESENT`/
>   `activity_log`/`lesson_learned`/`obstacles`) + tafsir respons, teruji
>   (termasuk `submitReport` dengan `fetch` di-mock, tanpa jaringan nyata).
> - `src/lib/submit-service.ts`, orkestrasi murni (`assessReadiness`,
>   `todayInJakarta`, `submitStatusFor`) + 14 tes.
> - `src/app/api/reports/submit/route.ts`, route submit (policy → tukar token →
>   kirim → `SubmitLog`), **gated**: pengiriman nyata hanya bila
>   `ALLOW_LIVE_SUBMIT=1`, selain itu mode `DRY_RUN`. Tombol pemicu `MANUAL` di
>   `/dashboard`.
> - **Sisa (opsional):** bentuk body `200` `/auth/refresh` bila token 6 jam
>   kedaluwarsa; status HTTP sukses submit diamati saat uji pertama. Alur
>   pertama memakai `access_token` dari `/auth/login/callback` (§4.4).


| **5** | Audit log, rate limit, deploy Vercel + daftar cron eksternal | Siap dipakai publik |

> **Status Tahap 5 (sebagian, sedang berjalan):**
> - `src/lib/audit-log.ts` + `src/app/(app)/history/page.tsx`, **riwayat
>   audit log**: daftar 100 `SubmitLog` terbaru milik pengguna + ringkasan
>   (total/terkirim/duplikat/gagal). Read-only (bukti, bukan editor).
> - `src/lib/automation.ts`, aturan jadwal murni & teruji (`generateWebhookKey`,
>   `isValidSchedule`, `minutesUntilNext`, `describeNextRun`, memakai
>   `Intl` Asia/Jakarta, bukan zona server).
> - `src/app/api/automation/route.ts`, GET/PUT `AutomationConfig`; `webhookKey`
>   dibuat acak 32 byte saat pertama dan **dipertahankan** pada setiap update,
>   kecuali rotasi eksplisit lewat `action: "rotate-key"` (VERIFY-002).
> - `src/app/api/cron/submit/route.ts`, webhook cron **gated**: dijaga header
>   `Authorization: Bearer <webhookKey>` (dianjurkan) atau `?key=<webhookKey>`
>   (cara lama, kompatibilitas mundur, **dijadwalkan dihapus 1 Jan 2026**;
>   401 generik bila salah), hormati
>   `isEnabled` dan `ALLOW_LIVE_SUBMIT`, policy libur/akhir program diperiksa
>   lebih dulu, semua percobaan dicatat dengan `trigger: CRON` (ditentukan
>   server, bukan klien).
> - `src/app/(app)/automation/page.tsx` + form, atur jam/menit, sakelar,
>   dan salin URL webhook untuk cron-job.org.
> - **Rate limit (SPEC §8/§10 poin 6), SELESAI.** `src/lib/rate-limit.ts`
>   (murni) + `rate-limit-store.ts` (in-memory / Upstash opsional) +
>   `enforce-rate-limit.ts`; dipasang di login, register, submit manual, webhook
>   cron, dan ubah kredensial. 20 tes baru; total 235 lulus.
> - **Panduan cron eksternal, SELESAI.** `docs/CRON-SETUP.md`: langkah demi
>   langkah cron-job.org / GitHub Actions / `crontab`, tabel arti respons,
>   urutan uji aman, dan bagian pemecahan masalah.
> - **Ekstraksi inti pengiriman, SELESAI.** `src/lib/perform-submit.ts`:
>   `performSubmit()` menyatukan alur (kesiapan → token → tukar → kirim →
>   catat) yang sebelumnya disalin di dua route. Bentuk respons HTTP tetap
>   per-route (`manualResponse`/`cronResponse`) karena memang berbeda. 13 tes
>   baru (mock jaringan/DB, offline); total 256 lulus.
> - **Header keamanan, SELESAI.** `src/lib/security-headers.ts` dipakai
>   `next.config.ts`; diverifikasi nyata (curl + Playwright, 0 pelanggaran CSP).
> - **Jalur re-auth yang jelas, SELESAI (SPEC §397).** Dua celah ditutup:
>   (1) `performSubmit` kini menandai kredensial `INVALID` saat `SESSION_DEAD`
>, sebelumnya hanya `POST /credentials/verify` yang melakukannya, jadi status
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
| 1 | Database | **Neon sejak awal** (bukan SQLite lokal), lihat §14 |
| 2 | Provider AI | **DICABUT oleh pemilik.** Awalnya AI dihapus sepenuhnya (lihat baris 7); pemilik kemudian memutuskan memakai **LLM gratis** (Google Gemini) dengan **1 API key milik admin untuk semua pengguna**. Implementasi: `src/lib/report-draft-llm.ts` (server-only, key di header, bukan query string) dengan **fallback otomatis** ke penyusun lokal `src/lib/report-draft.ts`. Kontrak `ReportDrafter` + `getDrafter()`/`draftWithFallback()` menjaga agar penggantian provider tidak menyentuh UI/rute. Bila `GEMINI_API_KEY` kosong, fitur **tetap jalan** memakai lokal. **Pilihan model ditentukan hasil pengujian nyata ke API** (bukan asumsi): nama versi spesifik (`gemini-2.0-flash`, `gemini-2.5-flash`) semuanya 404 karena dihapus Google; `gemini-flash-latest` hanya berkuota **20 permintaan/hari**, terlalu kecil untuk key bersama; yang dipakai **`gemini-flash-lite-latest`** (alias stabil + kuota lebih lega). Endpoint **hanya `/v1beta`** — asumsi lama bahwa key `AQ.` butuh `/v1` salah dan menyebabkan 404 berkepanjangan. Kegagalan LLM **dicatat ke log server** (`console.warn`) supaya salah konfigurasi tidak tersembunyi di balik fallback. **Jawaban LLM divalidasi dua lapis:** `checkReportField` (panjang & placeholder) DAN `isIndonesianText` (bahasa). Lapis kedua wajib karena teks Inggris yang panjang **lolos** `checkReportField` — tanpa itu, laporan berbahasa Inggris bisa masuk ke form (dibuktikan dengan tes, bukan dugaan). Pemeriksa bahasa memakai **bukti positif** (kata fungsi Indonesia hadir) alih-alih daftar hitam kata asing, supaya istilah teknis yang wajar di laporan IT (`deploy`, `bug`, `React`) tidak membuat draf yang sah ikut ditolak. Diagnosis cepat: `npx tsx scripts/uji-gemini.ts`. |
| 3 | Pemicu jadwal | **cron-job.org** |
| 4 | Domain | **`maganghub-autoabsen.my.id`** (aktif). Awalnya pakai domain Vercel (`*.vercel.app`); kini domain khusus, jadi URL produksi berbentuk `https://maganghub-autoabsen.my.id` |
| 5 | Akses pendaftaran | **Terbuka bebas**, siapa pun boleh daftar, **langsung aktif, tanpa verifikasi email** |
| 6 | Cara login | **Email + password** (tanpa OAuth) |
| 7 | Sumber commit GitHub | **DIBATALKAN**, tidak ada integrasi GitHub. Uraian aktivitas diisi dari 3 template siap pakai |
| 8 | Admin pertama | **`ADMIN_EMAIL` di env** (opsi 1), lihat di bawah |
| 9 | Isi laporan | **3 template sama setiap hari**, persis bot Python. Bisa diedit manual sebelum submit bila perlu |

### Cara Membuat Admin Pertama (sudah diputuskan: `ADMIN_EMAIL`)

Pemilik awalnya meminta admin pertama memakai email & password contoh yang
mudah ditebak (kredensial contohnya sengaja **tidak ditulis ulang di sini**).
**Permintaan itu tidak dijalankan**, kredensial contoh tidak ditulis ke kode,
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
- Kalau `ADMIN_EMAIL` kosong, aplikasi tetap jalan, hanya tidak ada admin
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
    lewat penggantian manual oleh admin, sebutkan ini di UI agar pengguna
    tidak menunggu email yang tidak akan datang.
  - Karena pendaftaran langsung aktif dan alamat email tidak dibuktikan,
    **rate limit per-IP di login dan register bukan pilihan, tapi syarat
    mutlak** (§9). Tanpa itu, satu orang bisa membuat akun tanpa batas dan
    mencoba password berulang kali.
- **Terbuka bebas + menyimpan password pihak ketiga** berarti §9 menjadi
  **mutlak, bukan anjuran**. Rate limit wajib ada sebelum rilis.
- **Domain khusus** (`maganghub-autoabsen.my.id`) menggantikan domain Vercel
  bawaan. URL produksi berbentuk `https://maganghub-autoabsen.my.id`. Ini
  **sudah HTTPS**, jadi syarat cookie aman terpenuhi. Karena sekarang
  memakai domain sendiri, `NEXTAUTH_URL` dan env terkait (mis. secret
  `APP_URL` di GitHub Actions) harus diset ke domain ini.
- **cron-job.org** adalah layanan pihak ketiga: pemicu jadwal bergantung
  padanya. Sesuai §6, tidak ada fallback. Bila cron-job.org melewatkan
  pemicu, tombol manual di dashboard tetap bisa dipakai.

### 15B. Cron massal (dispatcher), mengurangi setup per user

**Keputusan (Tahap 6):** selain model "satu cron per user" (USER menyalin
`webhookKey` lalu memasang cron sendiri), tersedia **dispatcher massal**:
satu pemicu admin memanggil `GET /api/cron/run-all` tiap jam, dan server
mengabsen **semua** user yang jadwalnya jatuh pada jam itu.

- **Dijaga `CRON_SECRET`** (header `Authorization: Bearer ...`, dibanding
  *timing-safe*). Kosong → `503`; salah → `401`.
- **Pemicu:** GitHub Actions (`.github/workflows/absensi-dispatch.yml`,
  `*/15 * * * *`) memanggil endpoint. Rahasia (`APP_URL`, `CRON_SECRET`) di
  GitHub Secrets, aman meski repo publik. Frekuensi 4x/jam (bukan 1x) dipilih
  karena penjadwal GitHub tidak tepat waktu dan bisa telat/menghilang; dengan
  satu pemicu per jam, keterlambatan melewati batas jam membuat absensi hari itu
  tak terkirim.
- **Jadwal per-user tetap dihormati:** disaring lewat `cron-dispatch.ts`
  (murni, teruji). **Menit diabaikan**, cron per jam, jadi jadwal `07:30`
  diproses kapan saja dalam 07:00–07:59 WIB.
- **Konkurensi berbatas** (10) + tenggat 50s + `maxDuration = 60` supaya 20
  user tidak menembus batas waktu fungsi. Satu user gagal tidak menggagalkan
  yang lain.
- **Inti pengiriman tetap satu sumber:** dispatcher memanggil `performSubmit`
  yang sama dengan route manual & webhook per-user, tidak ada logika
  pengiriman yang diduplikasi.
- **Mengapa GitHub Actions, bukan Vercel Cron:** Hobby hanya mengizinkan cron
  **sekali per hari**, ekspresi per-jam gagal saat deploy. GitHub Actions tidak
  terbatas frekuensi, jadi inilah pemicu per-jam yang bisa dipakai di paket
  gratis. (Catatan kuota: Active CPU hanya ditagih saat kode jalan, bukan saat
  menunggu I/O, lihat `docs/CRON-BULK.md` §7.)
- **Pemicu alternatif/manual:** admin yang login dapat menekan **Jalankan
  sekarang** di Panel Admin → `POST /api/admin/dispatch` (sesi + role ADMIN,
  memakai `runDispatch` yang sama). Tidak butuh `CRON_SECRET`, jadi bisa dipakai
  untuk menguji sebelum GitHub Secrets diisi.
- **Jalankan satu user terpilih:** tombol **Jalankan** pada baris user di Panel
  Admin → `POST /api/admin/dispatch/user` (`runOne`), memaksa jalankan otomasi
  user itu tanpa memandang jam jadwalnya. Tetap lewat `performSubmit` yang sama,
  jadi kebijakan laporan tidak dilanggar. Tabel admin juga menampilkan jadwal
  (HH:MM WIB) dan status "hari ini" tiap user (lihat §4).
- Panduan: `docs/CRON-BULK.md`. Model per-user lama tetap ada
  (`docs/CRON-SETUP.md`) bagi yang ingin ketepatan menit (cron-job.org).


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
- Rate limit per-IP di `/api/register` (5/10 menit) dan `/api/login`
  (mis. 10/15 menit), pakai Upstash Redis free tier atau tabel di Postgres.
- CAPTCHA/turnstile di form register bila penyalahgunaan mulai terlihat.
- Peringatan jujur di UI saat mendaftar: *"Sistem ini menyimpan kredensial
  SIAKAD Anda. Hanya masukkan kredensial milik Anda sendiri."*


---

## 14. Langkah Detail: Menyiapkan Neon dari Awal

Bagian ini ditulis agar bisa diikuti langkah demi langkah tanpa menebak.

### Prasyarat
- Akun GitHub atau email (untuk daftar Neon).
- Kartu kredit **tidak wajib** untuk paket gratis.

### Tahap A, Membuat database di Neon

1. Buka `https://neon.com` lalu **Sign up** (bisa pakai akun GitHub).
2. Setelah masuk, klik **New Project** (atau **Create project**).
3. Isi:
   - **Project name**: mis. `maganghub-attendance`.
   - **Database name**: `neondb` (bawaan, boleh diganti).
   - **Region**: pilih **Asia Pacific (Singapore)**, paling dekat ke
     pengguna Indonesia, sehingga latensi ke Monev dan ke pengguna rendah.
   - **Postgres version**: pakai bawaan yang disarankan.
4. Klik **Create project**.
5. Setelah selesai, Neon menampilkan **Connection string**. Ada dua bentuk
   yang penting dibedakan:
   - **Pooled connection**, host-nya memuat `-pooler`. Dipakai aplikasi saat
     berjalan (serverless, banyak koneksi pendek).
   - **Direct connection**, tanpa `-pooler`. Dipakai untuk **migrasi**
     Prisma (`db push` / `migrate`), karena migrasi butuh satu koneksi tetap.
6. Salin keduanya. Bentuknya menyerupai:
   ```text
   # Pooled (untuk aplikasi)
   postgresql://USER:PASSWORD@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

   # Direct (untuk migrasi)
   postgresql://USER:PASSWORD@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

### Tahap B, Menaruh koneksi di proyek (secara aman)

1. Di root proyek web, buat file **`.env.local`** (atau `.env` untuk lokal).
2. Isi:
   ```bash
   DATABASE_URL="<pooled connection string>"
   DIRECT_URL="<direct connection string>"
   ```
3. **Pastikan `.env*` ada di `.gitignore`.** Ini wajib, koneksi string
   memuat password database. Jangan sampai ter-commit.
4. Di `prisma/schema.prisma`:
   - **Prisma 6 ke bawah**, deklarasikan `url` + `directUrl`:
     ```prisma
     datasource db {
       provider  = "postgresql"
       url       = env("DATABASE_URL")
       directUrl = env("DIRECT_URL")
     }
     ```
   - **Prisma 7+**, `url` **tidak lagi ada di schema**. Koneksi dipindah ke
     `prisma.config.ts` + driver adapter. Lihat Tahap C.

### Tahap C, Menyiapkan Prisma

**Yang penting diketahui dulu:** Prisma 7 mengubah cara koneksi. Panduan
resmi Neon sekarang menganjurkan **driver adapter** `@prisma/adapter-neon`
(bukan lagi `@neondatabase/serverless`). Perhatikan juga: sejak Prisma 7,
`url` **tidak lagi ditulis di `schema.prisma`**.

**Opsi 1, Prisma 6 ke bawah (cara lama, masih jalan):**
```bash
npm install prisma@6 @prisma/client@6
npx prisma init
npx prisma db push      # pakai DIRECT_URL untuk migrasi
npx prisma studio       # opsional
```

**Opsi 2, Prisma 7+ (disarankan Neon):**
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

> **Untuk proyek ini, ikuti versi Prisma yang benar-benar terpasang**,
> cek dengan `npx prisma --version` sebelum menyalin salah satu contoh di
> atas. Jangan campur keduanya. Bila ragu, pilih **Opsi 1** (Prisma 6)
> karena lebih banyak contoh dan lebih sedikit bagian yang bergerak.

### Tahap D, Saat deploy ke Vercel

1. Di dasbor Vercel → proyek → **Settings → Environment Variables**.
2. Tambahkan variabel berikut untuk **Production** (dan Preview bila perlu):
   - `DATABASE_URL` (pooled)
   - `DIRECT_URL` (direct)
   - `NEXTAUTH_SECRET` (string acak panjang, jangan yang contoh)
   - `NEXTAUTH_URL` (`https://maganghub-autoabsen.my.id`)
   - `ENCRYPTION_KEY` (32 byte acak dalam hex, lihat §9)
   - `ADMIN_EMAIL` (bila memilih opsi 1 di §13, email admin pertama)
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

