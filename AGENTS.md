# AGENTS.md: MagangHub Attendance Web

Panduan untuk AI agent (dan kontributor) yang bekerja di repo ini.

> **Baca ini dulu, lalu baca `SPEC.md`.** `SPEC.md` adalah sumber kebenaran
> untuk _apa_ yang dibangun. File ini menjelaskan _bagaimana_ bekerja di
> dalamnya tanpa merusak apa pun.

---

## 1. Apa Proyek Ini

Aplikasi web **multi-user** untuk mengelola presensi dan laporan harian magang
ke portal Monev MagangHub Kemnaker.

Tiga kemampuan inti:

1. Menyimpan kredensial Monev pengguna secara terenkripsi (AES-256-GCM).
2. Menyusun laporan harian dari **3 kolom** (Uraian Aktivitas, Pembelajaran
   yang Diperoleh, Kendala). Kolom bisa diisi manual, atau disusun lewat tombol
   "Susun draf" yang memakai **LLM Gemini** (opsional, key admin) dengan
   **fallback otomatis** ke penyusun lokal. Tanpa integrasi GitHub.
3. Mengirim laporan lewat **Direct REST API**, tanpa browser, tanpa worker,
   tanpa biaya bulanan.

**Status saat ini: Tahap 1 selesai** (fondasi autentikasi: register, login,
dashboard terlindungi). Lihat `SPEC.md` §13 untuk keputusan yang mengikat.

> **Pembaruan keputusan AI:** keputusan lama "AI dibatalkan" sudah **dicabut
> pemilik**. Kini ada penyusun draf opsional berbasis Gemini gratis
> (`GEMINI_API_KEY`, key admin dipakai bersama semua pengguna). Lima aturan yang
> tidak boleh dilanggar saat menyentuh bagian ini:
> (a) **jangan pernah menghapus fallback lokal** — bila LLM gagal, pengguna
> tetap harus mendapat draf, bukan pesan error;
> (b) jawaban LLM **selalu** divalidasi dengan `checkReportField` sebelum
> dipakai, karena LLM tidak boleh bisa merusak validasi form;
> (c) jawaban LLM **juga selalu** diperiksa `isIndonesianText`. Ini penting dan
> mudah terlupakan: model kadang tetap menjawab bahasa Inggris walau prompt
> sudah meminta Indonesia, dan teks Inggris yang panjang **lolos**
> `checkReportField` karena fungsi itu hanya menghitung panjang. Tanpa langkah
> ini, laporan berbahasa Inggris bisa benar-benar masuk ke form (sudah
> dibuktikan, bukan dugaan);
> (d) **jangan memakai nama model versi spesifik** (`gemini-2.0-flash` dsb.) —
> semuanya 404 karena dihapus Google. Pakai alias `-latest`;
> (e) endpoint **hanya `/v1beta`**. `/v1` selalu 404 di sini, percobaan
> sebelumnya mengasumsikan sebaliknya dan membuat fitur mati selama-lamanya.
> Integrasi GitHub tetap dibatalkan.

> **Cara men-debug "kok masih pakai lokal?":** jalankan
> `npx tsx scripts/uji-gemini.ts`. Skrip itu memanggil API sungguhan dan
> mencetak status HTTP persis. Jangan menebak dari UI — UI sengaja menyembunyikan
> error dari pengguna, sehingga kesalahan konfigurasi tidak terlihat di sana.

---

## 2. Aturan Paling Penting

### Jangan pernah

- **Jangan menyentuh folder proyek Python `../maganghub-autoabsen/`.**
  Itu sistem produksi terpisah yang setiap hari mengirim absen. Satu perubahan
  yang tidak sengaja di sana bisa membuat absen bolong. Proyek ini berdiri
  sendiri: tidak boleh mengimpor, membaca, atau menulis ke folder itu.
- **Jangan commit atau push ke git. Itu urusan pemilik proyek.**
  Lihat §8. Agent **dilarang** menjalankan `git commit`, `git push`, `git tag`,
  atau operasi git yang mengubah riwayat. Menyiapkan file boleh; mencatatkan
  ke git tidak.
- **Jangan pernah menulis password, API key, atau `ENCRYPTION_KEY` ke dalam
  kode, test, log, atau commit.** Nilai rahasia hanya lewat `.env`, dan
  `.env` wajib ada di `.gitignore`.
- **Jangan log atau tampilkan password** dalam bentuk apa pun, tidak di
  console, tidak di audit log, tidak di pesan error.
- **Jangan memalsukan User-Agent** untuk menembus `403` portal. Batas etika ini
  ada di `SPEC.md` §6 dan §10.
  - **✅ KEPUTUSAN BARU (2026-06, DIPERBARUI) — proxy residensial DIIZINKAN
    untuk jalur login SSO.** Aturan lama ("jangan tambahkan proxy")
    **dicabut pemilik** setelah terbukti: repo referensi
    `maganghub-bot-attendance` berhasil login lewat proxy residensial
    (`HttpsProxyAgent` + `MAGANGHUB_PROXY_URL`). Yang dijaga Cloudflare Managed
    Challenge hanya **halaman login SSO** (`account.kemnaker.go.id`), dan proxy
    membuat request datang dari IP residensial — tempat challenge lolos
    **secara wajar** (sama seperti browser pengguna). Ini **bukan** mengecoh
    CAPTCHA/OTP/MFA dan **bukan** menyamar sebagai identitas orang lain.
  - **Cara pakai (opsional, tetap terjaga):** set `MAGANGHUB_PROXY_URL` (mis.
    `http://user:pass@host:port`) di `.env`. Bila kosong → perilaku lama
    (`fetch` biasa). Implementasi terpusat di `src/lib/proxy-fetch.ts`
    (`fetchPortal`) dan **hanya** dipakai di jalur yang menyentuh host SSO
    (`kemnaker-sso.ts`, `monev-login.ts` prime). **API Monev TIDAK lewat proxy**
    (tidak diblokir). Proxy URL **tidak pernah** ditulis ke log/pesan error.
    Di Vercel env var ini **WAJIB** diisi (IP datacenter diblokir CF); panduan
    langkah-demi-langkah di `docs/PROXY-SETUP.md`, uji cepat dengan
    `npx tsx scripts/uji-proxy.ts`.
  - **Batas yang TETAP berlaku:** jangan memalsukan UA, jangan mengakali
    CAPTCHA/OTP/MFA, jangan menyembunyikan kegagalan.
- **Jangan menambahkan dependensi** tanpa alasan jelas. Setiap paket baru
  memperbesar permukaan serangan untuk aplikasi yang menyimpan password orang
  lain.
- **Jangan mengganti bahasa balasan.** Seluruh balasan ke pemilik proyek
  **HARUS dalam Bahasa Indonesia** — termasuk saat menjalankan perintah
  terminal, membaca kode, atau berpikir. Jangan beralih ke Inggris, Mandarin,
  atau bahasa lain di tengah percakapan. Ini berlaku untuk pesan, ringkasan,
  komentar penjelasan, dan usulan.

### Selalu

- **Validasi semua input dengan Zod di sisi server** sebelum menyentuh DB.
- **Enkripsi kredensial sebelum masuk database**; DB hanya boleh menyimpan
  ciphertext + IV + auth tag.
- **Setiap percobaan submit dicatat** ke tabel audit log.
- **Periksa `SPEC.md` dulu** sebelum mengambil keputusan arsitektur. Kalau
  ingin menyimpang, tulis alasannya di `SPEC.md`, jangan diam-diam.
- **Jalankan `npm run lint`, `npm run typecheck`, dan `npm run build`** sebelum
  menyatakan selesai. (`npm test` belum terpasang, lihat §7.)
- **Balas dalam Bahasa Indonesia.** Seluruh komunikasi ke pemilik proyek
  memakai Bahasa Indonesia, konsisten sampai akhir — jangan berganti bahasa di
  tengah jalan. Lihat juga larangan di bagian "Jangan pernah" di atas.

---

## 3. Tech Stack

| Layer     | Teknologi                                                         |
| :-------- | :---------------------------------------------------------------- |
| Framework | Next.js (App Router), TypeScript                                  |
| Styling   | Tailwind CSS v4 + **neobrutalism.dev** (via shadcn CLI)           |
| UI base   | **Base UI** (`@base-ui/react`), komponen neobrutalism memakai ini |
| Database  | PostgreSQL (Neon)                                                 |
| ORM       | Prisma 7 (driver adapter `@prisma/adapter-neon`)                  |
| Auth      | NextAuth.js v5 (**email/password saja**, tanpa OAuth)             |
| Enkripsi  | AES-256-GCM (`node:crypto`)                                       |
| AI        | **Tidak dipakai**, template tetap menggantikan peringkasan AI     |
| Test      | Vitest 3.2.7 (environment `node`)                                 |
| Deploy    | Vercel (serverless, paket gratis)                                 |

Detail dan alasan tiap pilihan ada di `SPEC.md` §3.

### Aturan Prisma 7 (penting)

- **Prisma 7 WAJIB memakai driver adapter.** `new PrismaClient()` polos akan
  gagal: _"A driver adapter is required to connect to your database."_
  Selalu pakai instance bersama dari `src/lib/prisma.ts`.
  ```ts
  import { prisma } from "@/lib/prisma"; // BENAR
  ```
- Skema **tidak lagi** memuat `url` di `datasource`, koneksi diberikan lewat
  adapter `PrismaNeon({ connectionString: env.DATABASE_URL })`.
- **Menjalankan skrip di luar Next.js** (mis. `npx tsx scripts/foo.ts`):
  1. `tsx` **tidak** memuat `.env.local` otomatis (itu tugas Next.js), panggil
     `config({ path: ".env.local" })` dari `dotenv` **sebelum** mengimpor modul
     yang membaca env (`env.ts` melempar error kalau variabel kosong).
  2. Impor `prisma` dari `@/lib/prisma`, jangan `new PrismaClient()`.
  3. Kolom katalog Postgres bertipe `name` (mis. `table_name`) **tidak bisa**
     dideserialisasi Prisma, `SELECT table_name::text AS table_name`.
  4. **Top-level `await` tidak didukung**, `tsx` memakai output **CJS** di
     proyek ini, error: _"Top-level await is currently not supported with the
     cjs output format"_. Bungkus dalam `async function main()` lalu
     `main().catch(...).finally(() => prisma.$disconnect())`.
- Proyek ini memakai **`prisma db push`**, bukan migrasi (tidak ada folder
  `prisma/migrations`). Per 2026-09, **9 tabel sudah ada di Neon** dan cocok
  dengan 9 model di schema.
  - **Tambahan kolom (bukan tabel):** `User.sessionVersion` (fitur invalidasi
    sesi, SPEC.md §5.8b). Menambah kolom tetap butuh `npm run db:push` supaya
    schema Neon ikut berubah, jalankan **sebelum** deploy kode yang memakainya,
    kalau tidak semua query `User` akan gagal.
- Klien hasil generate berformat **TypeScript** di `src/generated/prisma/`
  (`client.ts`, bukan `index.js`).

### Aturan UI (penting)

- Komponen ada di `src/components/ui/`, **jangan diedit gayanya sembarangan**;
  tambah komponen baru lewat `npx shadcn@latest add <url-neobrutalism>`.
  **Semua primitif di sana sekarang berasal dari registry** (`alert-dialog`,
  `button`, `calendar`, `card`, `checkbox`, `input`, `label`,
  `native-select`, `pagination`, `popover`, `select`, `switch`, `textarea`,
  `toast`). Yang ditulis tangan hanya **komposisi** di atasnya:
  `date-picker.tsx` (Popover + Calendar), `confirm-dialog.tsx` (alert-dialog
  resmi + API tetap), plus komponen domain yang tidak punya padanan registry:
  `badge.tsx` (peta `Tone`), `message.tsx`, `field-error.tsx`,
  `password-input.tsx`, `password-strength.tsx`.
  **Jangan menjalankan ulang CLI `add` untuk komponen yang sudah ada tanpa
  meninjau diff-nya** — `button.tsx` pernah tertimpa dan kehilangan kustomisasi
  proyek. Jangan menulis ulang primitif dari nol; susun dari registry.
- Komponen neobrutalism dibangun di atas **Base UI**, **bukan Radix**. Karena itu
  prop `asChild` **tidak ada**. Untuk merender `Button` sebagai link, pakai
  prop `render`:
  ```tsx
  <Button render={<Link href="/register" />}>Daftar</Button>
  ```
- Warna **wajib** pakai token, bukan warna mentah: `bg-main`,
  `text-main-foreground`, `bg-secondary-background`, `text-foreground`,
  `border-border`, `rounded-base`, `shadow-shadow`, `font-heading`, `font-base`.
  Hindari `slate-*`/`gray-*`/`rounded-md`, tidak mengenal tema neobrutalism.
  Untuk warna semantik ada variant tombol **`danger`** (aksi merusak: hapus) dan
  **`success`** (aksi "menjalankan/aktifkan"). Keduanya memakai token
  `--destructive`/`--success` + `--destructive-foreground`/`--success-foreground`
  (didefinisikan di `globals.css` untuk mode terang & gelap), **bukan**
  `bg-red-500`. Jalankan `npx shadcn` untuk menambah komponen, bukan menambah
  kelas warna mentah.
- **Warna latar WAJIB berpasangan dengan foreground-nya.** Latar `bg-success`,
  `bg-destructive`, atau `bg-warning` selalu ditulis dengan
  `text-success-foreground` / `text-destructive-foreground` /
  `text-warning-foreground`; latar `bg-main` (aksen biru) selalu dengan
  `text-main-foreground`. **Jangan** `text-main-foreground` di atas hijau/merah/
  kuning, dan **jangan** `text-foreground`/`text-white`/`text-black` di atas
  `bg-main` — nilainya berbeda (di mode gelap `--main-foreground` gelap)
  sehingga teks jadi tidak terbaca. Bila latar berubah karena interaksi
  (`hover:`/`open:`/`data-[state=...]:`), perubahan foreground-nya WAJIB
  ditulis juga (`hover:text-main-foreground`, dst.), termasuk untuk anak
  ber-`group` (`group-hover:`/`group-open:`). Token `--warning`/
  `--warning-foreground` (kuning) ada untuk "perlu perhatian, tapi bukan
  gagal atau merusak" (mis. spanduk wajib ganti sandi).
- **Tombol aksi berulang pakai IKON + tooltip, bukan teks.** Tombol di dalam
  tabel/daftar (Ubah, Hapus, Salin, Jalankan, Buka) memakai `size="icon-sm"` +
  ikon `lucide-react` + `title` DAN `aria-label` (wajib; tanpa itu tombol ikon
  tak terbaca pembaca layar). Tombol aksi utama/form boleh ikon **plus** teks
  bila kejelasan lebih penting, tetapi tetap beri `title`/`aria-label`. Konvensi
  ikon: `Play` = jalankan (spinner `Loader2` saat proses), `Trash2` = hapus
  (variant `danger`), `Pencil` = ubah, `Copy`/`Check` = salin/tersalin,
  `Save`/`Plus` = simpan/tambah (variant `success`), `X` = batal/tutup.
  Teks label tetap di **dialog konfirmasi**, jadi aksi berbahaya tetap jelas
  sebelum dijalankan.
- **Semua teks yang dilihat pengguna wajib dimengerti orang awam.** Ini berlaku
  untuk pesan error API (`{ error: "..." }`), `message` hasil aksi, judul &
  isi toast, label tombol/badge, dan helper text. Pesan boleh bocor ke layar
  lewat `setError(data.error)` / `toast.error(judul, data.error)`, jadi **tulis
  seolah setiap pesan akan tampil di layar** — bahkan yang terasa "internal".
  Larangan keras: **jangan** tampilkan jargon ke pengguna — `HTTP 403`,
  `cf-mitigated`, `content-type`, `OAuth`, `csrf`, `access_token`, `state`,
  `JSON`, `body`, `payload`, nama field (`userId`), nama env (`CRON_SECRET`),
  atau potongan path (`/auth/login`). Sebut hal itu hanya di **log server**
  (`diagnostic`) dan `console.warn`, atau di dalam `<details>` "Detail teknis"
  yang sengaja dilipat untuk keperluan laporan.
  Pola pesan yang benar: **(a) apa yang terjadi → (b) apakah salah pengguna →
  (c) satu tindakan berikutnya**. Contoh: bukan `"Body bukan JSON."` tetapi
  `"Data permintaan tidak terbaca. Muat ulang halaman lalu coba lagi."`; bukan
  `"SSO menolak dengan HTTP 403."` tetapi `"Portal MagangHub menolak permintaan
  dari server kami karena proteksi anti-bot, bukan karena email & password
  Anda."`; bukan `"Respons /auth/login tidak memuat state."` tetapi
  `"Portal tidak memberi tautan login yang bisa diikuti. Coba lagi sebentar."`
  Sebutkan istilah teknis (mis. `monev_refresh_token`) **hanya** bila pengguna
  memang harus mencarinya sendiri di DevTools, dan selalu dengan langkah konkret.
  **Pisahkan pesan ramah dari detail teknis**: objek hasil internal membawa
  `message` (tampil ke pengguna) **dan** `diagnostic` (jejak hop/HTTP/kategori
  halaman, HANYA untuk log server). Jangan pernah menaruh jejak diagnostik di
  `message` — nilai itu bocor ke UI lewat `setError`/`toast`. Penjaga otomatis:
  `src/lib/user-facing-messages.test.ts` memindai literal setelah `message:`/
  `error:`/`toast.*(`/`setError(` dan menggagalkan build bila menemukan jargon
  (termasuk `HTTP`, `hop`, `gerbang '...'`, `redirect_uri`, `refresh_token`,
  rujukan `§`/`docs/MONEV-API`).
- **Responsif wajib** untuk tablet & HP (aplikasi ini web, tapi tetap dipakai di
  layar kecil). Uji di `sm:`, `md:`, `lg:`. Jangan buat layout yang hanya rapi
  di desktop.

---

## 4. Struktur yang Dituju

Mengikuti pola di `SPEC.md`. Saat menambah file, hormati pembagian ini:

```text
maganghub-attendance-web/
├── src/
│   ├── app/          # halaman & route (App Router)
│   │   ├── (auth)/       # login, register
│   │   ├── (dashboard)/  # dashboard, reports, settings, admin
│   │   ├── api/          # /api/cron/trigger, /api/reports/*, /api/auth/*
│   │   └── docs/         # halaman dokumentasi publik
│   ├── components/   # komponen UI (termasuk ui/ untuk primitif)
│   ├── actions/      # server actions
│   ├── services/     # logika bisnis (report, settings, template)
│   ├── schemas/      # skema Zod
│   ├── lib/          # crypto, maganghub-api, submit-orchestrator
│   ├── hooks/        # hook React
│   ├── types/        # tipe bersama
│   └── utils/        # fungsi kecil (cn, filter)
├── prisma/           # schema.prisma
├── tests/            # vitest
├── .env              # RAHASIA, jangan pernah commit
└── SPEC.md / AGENTS.md
```

**Aturan penempatan:**

- Kode yang menyentuh rahasia (dekripsi, API key) hanya di `src/lib/` dan
  `src/services/`, tidak pernah di `components/`.
- Komponen UI tidak boleh mengimpor Prisma langsung, lewat server action.

**Yang sudah ada (per 2026-09):**

- `src/lib/`, `env.ts`, `auth.ts`, `prisma.ts`, `crypto.ts` (+test),
  `validate.ts` (+test), `utils.ts`
- `src/app/api/`, `auth/[...nextauth]`, `register`, `credentials`,
  `profile`, `account/password`, `automation`, `cron/submit`, `cron/run-all`,
  `admin/dispatch`, `admin/dispatch/user`, `reports/submit`
- `src/app/(app)/`, rute terlindungi: `dashboard/` (beranda), `calendar/`,
  `credentials/`, `report-templates/`, `history/`, `automation/`, `admin/`,
  `dev-tools/`, `profile/`. Sidebar & cek sesi dipasang sekali di
  `src/app/(app)/layout.tsx`.

### Aturan penyimpanan kredensial Monev

- Password Monev **TIDAK di-hash** (beda dari password akun aplikasi), harus
  bisa dipakai ulang untuk login ke portal, jadi disimpan terenkripsi dua arah.
- **Jangan pernah mengembalikan password Monev ke klien.** `GET /api/credentials`
  hanya mengembalikan `emailMonev`, `status`, dan `updatedAt`, pemiliknya pun
  tidak bisa melihat password lama, hanya bisa menggantinya.
- Saat `SELECT` kredensial, pilih kolom spesifik (`select: {...}`), jangan
  seluruh baris, supaya `ciphertext`/`iv`/`authTag` tidak ikut terbawa.
- Endpoint memakai `upsert` (satu kredensial per user, `userId @unique`).
  Setiap penyimpanan menerbitkan IV baru, JANGAN pakai ulang IV lama.
- Status dimulai `UNVERIFIED`; naik ke `ACTIVE` hanya setelah berhasil dicoba
  ke portal Monev, `INVALID` kalau ditolak.
- Periksa otorisasi **sebelum** parsing body (sudah diterapkan), supaya
  penyerang tanpa sesi tidak bisa membedakan respons.

### Login otomatis ke Monev (Opsi A), jalur utama

- Pengguna cukup isi email+password Monev sekali; server yang login ke SSO
  memakai kredensial tersimpan, lalu menyimpan **access token** (6 jam) dan,
  bila portal mengirimkannya, **refresh token** (30 hari). Semua terenkripsi.
- Endpoint: `POST /api/credentials/login` (`src/app/api/credentials/login/route.ts`).
  Ini **satu-satunya** tempat yang sengaja mengaktifkan
  `confirmLivePortalRequest: true`. Jangan tambah tempat lain.
- Penyimpanan sesi: `src/lib/credential-session.ts` (menyentuh DB) +
  `src/lib/credential-session-policy.ts` (murni & teruji: `ACCESS_TTL_MS` = 6
  jam, `isAccessTokenFresh`). Kolom DB:
  `accessCiphertext`/`accessIv`/`accessAuthTag`/`accessExpiresAt`, TERPISAH
  dari kolom refresh token (`tokenCiphertext`/…).
- **Konsumsi di jalur submit** (`src/lib/perform-submit.ts`): bila access
  token tersimpan masih **segar** (`isAccessTokenFresh`, margin 1 menit),
  kirim **langsung** memakainya, tanpa menukar refresh token. Bila tidak
  segar, baru fallback ke `exchangeRefreshForAccess(refreshToken)`. Karena itu
  `SubmitCredential` memuat kolom access token, dan **kedua** pemanggil
  (`reports/submit`, `cron/submit`) wajib meng-`select`-nya.
- Rate limit scope `credentialsLogin` (6 / 10 menit), tiap percobaan
  mengirim kredensial ke portal sungguhan.
- **Cadangan**: tempel `monev_refresh_token` manual (`POST /api/credentials/verify`)
  tetap ada bila login otomatis tidak berhasil.
- ⚠️ **Belum diuji ke portal sungguhan.** Yang masih perlu dipastikan pemilik
  akun: apakah `code` muncul di `redirect_uri` respons login, dan apakah
  callback mengirim `monev_refresh_token` lewat Set-Cookie. Kode sudah jujur
  memberi `ERROR`/menyimpan apa adanya bila bentuknya berbeda.
- **Pengingat dini sesi hampir habis** (mitigasi celah "mati setelah 30 hari").
  Umur refresh token dibaca **dari klaim `exp` di dalam JWT-nya**, bukan dari
  kolom DB baru — proyek ini memakai `prisma db push`, jadi menambah kolom =
  operasi eksternal ke Neon yang tidak sepadan untuk sekadar pengingat.
  Helper MURNI & teruji: `src/lib/refresh-token-age.ts`
  (`refreshTokenExpiresAt`, `isRefreshTokenNearingExpiry`,
  `daysUntilRefreshExpiry`, ambang `REFRESH_EXPIRY_WARNING_MS` = 7 hari).
  Pembacaan sisi server: `refreshTokenHealth(userId)` di
  `credential-session.ts` (dekripsi sesaat, hanya baca `exp`, token mentah
  tidak pernah keluar). Dashboard menampilkan banner `neutral` "Sesi Monev
  segera berakhir" bila sisa <= 7 hari **dan** sesi tidak sedang bermasalah.
  Prinsip: bila `exp` tak dapat dipastikan (bukan JWT / kunci berubah),
  hasilnya `null` dan **tidak ada** banner — jangan menebak, jangan ada
  peringatan palsu.
- ⚠️ **Batas yang diketahui**: pengingat ini hanya **tampil di dashboard**,
  tidak mengirim email/notifikasi. Bila pengguna tidak membuka dashboard > 7
  hari sebelum token mati, ia akan tetap melewatkannya. Tidak ada login-ulang
  otomatis di cron — itu sengaja (menghindari password dipakai aktif tanpa
  pengawasan). Kalau nanti dibutuhkan penutup penuh, opsi yang lebih aman
  adalah notifikasi keluar, bukan menyimpan password untuk auto-login berkala.

---

## 5. Keamanan Kerja (rahasia & kredensial)

Berbeda dari proyek Python lama, aplikasi ini **menyimpan password milik
orang lain** dan **mengirim atas nama mereka**. Ini tanggung jawab serius.

Aturan praktis saat menulis kode:

- Jangan pernah menaruh nilai rahasia di kode contoh, test, atau komentar.
  Test yang butuh kunci enkripsi harus membuat kunci **acak sementara**.
- Deskripsi semua nilai contoh di kode sebagai placeholder yang jelas,
  mis. `ENCRYPTION_KEY="<generate-acak-32-byte>"`.
- Saat menangani error, **jangan sertakan payload request** yang mungkin
  memuat password ke dalam pesan error atau log.
- Setiap fungsi yang menerima kredensial harus mengembalikan objek tanpa
  field password.
- Jika menemukan kode yang menuliskan password ke log, itu **bug kritis**,
  perbaiki atau laporkan, jangan diabaikan.

### Aturan `ENCRYPTION_KEY` (jangan sampai salah)

- **64 karakter hex** (32 byte) untuk AES-256-GCM. `env.ts` memvalidasi ini
  lewat regex `^[0-9a-fA-F]{64}$`.
- Boleh ditulis **dengan atau tanpa tanda kutip** di `.env.local`; `dotenv`
  mengupas kutipnya otomatis, jadi yang dilihat kode tetap 64 karakter. (Kalau
  memeriksa bentuk kunci lewat PowerShell `Get-Content`, Anda melihat teks
  mentah, itu bisa tampak 66 karakter. Itu **bukan** bug. Verifikasi lewat
  nilai yang sudah dimuat `dotenv`, bukan teks mentah.)
- **Jangan pernah mengganti kunci ini setelah ada data kredensial tersimpan**,
  data lama menjadi tidak bisa didekripsi. Ganti hanya saat tabel kosong.

Kripto ada di `src/lib/crypto.ts` (AES-256-GCM, IV 12 byte acak per enkripsi,
auth tag 16 byte). Kolom DB: `ciphertext`, `iv`, `authTag` di
`maganghub_credentials`.

---

## 6. Alur Kerja Submit (jangan diubah tanpa alasan)

Urutan ini mengikat; lihat `SPEC.md` §6:

1. Ambil kredensial pengguna → dekripsi.
2. Cek apakah laporan untuk tanggal itu sudah ada.
3. Kalau belum: susun draf dari 3 template tetap → simpan draf.
4. Login ke SSO/Monev lewat HTTP.
5. Kirim laporan.
6. Catat respons asli portal (200/409/422) ke audit log.

**Prinsip:** kalau gagal, **katakan gagal** dengan pesan jelas. Jangan
menyembunyikan kegagalan atau menandainya "sukses" secara diam-diam.

**Penting:** jangan pernah mengaktifkan submit otomatis untuk hari yang sama
dari proyek Python lama. Portal akan menolak yang kedua (`409 Presensi sudah
ada`). Pilih salah satu per hari.

---

## 7. Testing & Verifikasi

```bash
npm test          # vitest run
npm run test:watch
npm run lint      # eslint (0 error, 0 warning)
npm run typecheck # tsc --noEmit
npm run build     # pastikan build produksi lolos
```

Sudah ada: **Vitest 3.2.7** (`vitest.config.ts`, environment `node`).

> **Jebakan versi:** pakai **Vitest 3**, JANGAN Vitest 5. Vitest 5 menuntut
> `@types/node` v22+, sedangkan proyek ini di `@types/node` v20, `npm install
vitest` polos akan gagal `ERESOLVE`. Selain itu `@vitejs/plugin-react`
> **bentrok** dengan `@babel/*` bawaan `shadcn`; plugin itu tidak dibutuhkan
> selama test hanya menguji fungsi Node (tanpa JSX).

Prioritas test:

1. ✅ **Enkripsi** (`src/lib/crypto.test.ts`, 14 test), round-trip, IV selalu
   baru, anti-tamper (ciphertext & authTag diubah → gagal), kunci salah → gagal,
   `safeEqual`.
2. ✅ **Validasi kredensial** (`src/lib/validate.test.ts`, 12 test).
3. ✅ **Aturan 100 karakter** (`src/lib/report-rules.test.ts`, 27 test) +
   skema template (`src/lib/validate.test.ts`, 15 test).
4. **Penggantian placeholder** template (mis. `{tanggal}`) saat menyusun draf.
5. **Penanganan error API Monev**: 409, 422, 403 tidak membuat sistem crash.

### Aturan 100 karakter laporan (dari bot Python & portal)

- Angka `100` dan `5000` adalah aturan **pihak ketiga**. Jangan diubah tanpa
  bukti dari portal. Sumber tunggal: `src/lib/report-rules.ts`.
- Perhitungan memakai **panjang setelah trim** (`len(value.strip()) < 100` di
  bot Python). Teks 100 karakter yang diapit spasi tetap sah.
- `trim()` di JS memangkas NBSP (U+00A0) dan ideographic space (U+3000),
  sudah diuji, penting karena pengguna sering menempel dari Word.
- Zero-width space (U+200B) **tidak** dipangkas dan tetap dihitung. Jangan
  membuangnya otomatis (itu mengubah isi tulisan orang).
- Akhir baris diseragamkan ke `\n` sebelum simpan (`normalizeReportText`),
  supaya teks sama dari Windows (CRLF) maupun perangkat lain (LF) benar-benar
  identik. Ini mencegah bug halus: jumlah karakter beda 1 per baris.

### Struktur data template

- `ReportTemplate` = **satu baris per user** (`userId @unique`) dengan **3
  kolom**: `activity`, `learning`, `obstacles`. Bukan banyak baris.
- Isi template **bukan rahasia**, boleh dikembalikan penuh ke klien (beda dari
  password Monev). Pengguna harus bisa melihat & menyuntingnya.
- Penghitung karakter di form memakai `countReportLength` yang **sama** dengan
  server, jadi angka di layar tidak mungkin berbeda dari yang divalidasi.
- `DatedReportTemplate` = **satu baris per (user, tanggal)** dengan 3 kolom yang
  sama. Ini **penimpa**: dipakai hanya untuk tanggalnya, tanggal lain tetap
  memakai `ReportTemplate`. Pemilihan ada di `src/lib/template-selection.ts`
  (`chooseTemplate`) dan dipanggil di **tiap** jalur kirim (manual/cron/dispatch),
  bukan di `performSubmit`, agar satu aturan untuk semua jalur.
- Template bertanggal **tidak** mengubah aturan libur: `decide()` di
  `report-policy.ts` tetap melewati Sabtu/Minggu/libur nasional/akhir program.
  Tanggal disimpan `@db.Date` dan dibandingkan sebagai string `YYYY-MM-DD`
  (leksikografis = kronologis) supaya tidak tergeser zona waktu.
- UI template = **satu form** (`report-templates-form.tsx`), bukan dua panel.
  Date picker kosong = mengedit template default (berlaku semua tanggal); pilih
  tanggal = mengedit penimpa untuk tanggal itu. Isi konteks disimpan di state
  saat berpindah (`pindah()`) agar ketikan tidak hilang. Satu tombol Simpan
  mengarah ke endpoint berbeda sesuai konteks (`/api/report-templates` vs
  `/api/report-templates/dated`).
- Daftar tanggal bertemplate khusus **tidak** lagi dijejalkan sebagai chip di
  dalam form. Ia punya tabel sendiri (`dated-templates-table.tsx`) di bawah form:
  **hanya** tanggal yang punya penimpa yang muncul, kolom = Tanggal + 3 isi
  template + aksi **Buka** & **Hapus**.
  - **"Buka" bukan lagi `<Link>` biasa** melainkan pulau klien `OpenDatedButton`:
    `<Link>` ke rute yang sama dengan `?date=` baru melakukan navigasi klien
    tanpa memasang ulang form, sehingga form tetap menampilkan tanggal lama —
    gejalanya "Buka tidak melakukan apa-apa". Tombol ini `router.push` ke
    `?date=YYYY-MM-DD`, lalu menggulir form (`id=report-templates-form`) ke
    pandangan. Di `page.tsx` form diberi `key={params.date ?? "default"}` supaya
    tanggal baru benar-benar **memasang ulang** form dengan state segar — cara
    idiomatik menyetel ulang state komponen (menghindari `setState` di dalam
    efek, yang dilarang lint `react-hooks/set-state-in-effect`). Tanggal tanpa
    penimpa terisi isi default (Simpan membuat penimpa baru).
  - **"Hapus"** membuang penimpa tanggal itu (DELETE `/api/report-templates/dated?date=...`)
    lewat `DeleteDatedButton` (klien + `<ConfirmDialog>`, bukan `window.confirm`),
    lalu `router.refresh()`; laporan yang pernah terkirim TIDAK ikut terhapus.
  - **Tabel ini server component dengan query Prisma sendiri**, jadi ia hanya
    mengambil data ulang saat halaman di-render. Setelah Simpan/Perbarui template
    tanggal, form memanggil `router.refresh()` agar baris baru langsung muncul
    tanpa refresh manual. `router.refresh()` TIDAK mengubah `key` (query sama),
    jadi state form yang sedang diketik tetap utuh.
    Kutipan lama "Riwayat Laporan Terakhir" dari `SubmitLog` dihapus dari halaman ini
    (riwayat percobaan kirim tetap lengkap di `/history`).
- **Date picker tanggal khusus = `DatePicker` sendiri** (`src/components/ui/date-picker.tsx`),
  bukan `<input type="date">` bawaan peramban: input bawaan tidak mengizinkan
  menonaktifkan tanggal tertentu, sedangkan tanggal LIBUR (Sabtu/Minggu + libur
  nasional) **dan tanggal LAMPAU** (sebelum hari ini) tidak boleh dipilih. Kini
  ia **menyusun** komponen resmi registry: `<Popover>` (`popover.tsx`) sebagai
  cangkang + `<Calendar>` (`calendar.tsx`, react-day-picker) sebagai kisi; aturan
  libur tetap memakai `isHoliday` yang SAMA dengan jalur kirim, jadi tanggal yang
  dinonaktifkan tidak mungkin berbeda dari yang benar-benar dilewati otomasi.
  **Pengecualian:** halaman `/admin/holidays` (yang justru MENGELOLA daftar
  libur) memakai `<DatePicker unrestricted>` — semua pembatas dilepas (tanggal
  lampau, Sabtu/Minggu, libur, dan batas bulan), karena di sana justru tanggal
  itulah yang mau didaftarkan. Karena `<DatePicker>` bukan kontrol form asli,
  `required` bawaan peramban tak berlaku; form di sana memeriksa "tanggal wajib
  dipilih" sendiri di `simpan()`.
- **Kisi picker TIDAK mengosongkan sel padding** (berbeda dari `/calendar`):
  hari dari bulan sebelah tetap ditampilkan redup agar kisi utuh (tak berlubang).
  Sumbernya `buildMonthGridWithAdjacent` (`src/lib/calendar.ts`), bukan
  `buildMonthGrid` yang tetap kosong untuk halaman `/calendar` (jangan satukan
  keduanya; halaman kalender punya perilaku & tesnya sendiri). Fungsi kisi tetap
  murni: ia hanya mengisi sel, sedangkan **aturan tanggal mana yang boleh
  dipilih** ada di komponen picker. Tanggal libur di bulan sebelah pun tetap
  nonaktif, jadi tidak ada jalan memilih hari libur.
- **Back date dilarang keras**: hanya hari ini & tanggal mendatang yang bisa
  dipilih. Tanggal sebelum hari ini diredupkan & `disabled` (tak bisa diklik),
  `pilih()` juga menolak tanggal lampau sebagai pagar kedua, dan panah "bulan
  sebelumnya" dimatikan begitu sudah di bulan berjalan. Ini cermin aturan server
  (laporan hanya sah untuk hari ini).
- `DatedReportTemplate` juga dipakai untuk **penanda hijau** di `/calendar`:
  tanggal dengan penimpa diberi dot hijau + label "Laporan Sudah Ada". Ini murni
  penanda baca; tidak mengubah `decide()` maupun jalur kirim.

#### Hari libur dikelola ADMIN (tabel `Holiday`)

- Sebelumnya daftar libur nasional hidup sebagai **data statis** di
  `src/lib/holidays.ts`. Kini admin dapat **menambah/mengubah/menghapus** libur
  lewat halaman `/admin/holidays` (rute admin baru, item sidebar grup
  `MENU_ADMIN`), dan datanya disimpan di tabel `holidays`
  (`prisma/schema.prisma`). `holidays.ts` tinggal jadi **nilai awal/seed** +
  fallback murni untuk pemanggil tanpa DB.
- **Sumber kebenaran runtime = tabel `holidays`**, diakses HANYA lewat
  `src/lib/holidays-repo.ts` (`loadHolidaySet()` untuk jalur kirim/kalender,
  `loadHolidayRows()` untuk tampilan). File itu SERVER-ONLY: jangan impor dari
  komponen klien (DatePicker dkk menerima daftar libur sebagai prop), karena
  Prisma tak boleh masuk bundle peramban.
- **AUTO-SEED & gagal-lunak**: `loadHolidaySet()` mengembalikan `undefined`
  (bukan himpunan kosong) bila tabel KOSONG; itu membuat `isHoliday` jatuh ke
  `LIBUR_NASIONAL` statis. Tanpa ini, go-live dengan tabel kosong akan
  menghilangkan libur nasional yang sudah dikenal (mis. 25 Des 2026) sehingga
  cron mengirim pada hari Natal. Begitu ada baris pertama, DB jadi kebenaran
  penuh (menghapus semua baris setelahnya = nol libur, bukan balik ke statis).
  Sama: `performSubmit()` membungkus pemuatan libur dengan `try/catch` —
  kegagalan baca DB libur TIDAK boleh mematikan seluruh otomasi; ia jatuh ke
  daftar statis. Kedua pagar ini diuji (butuh pembuktian test bisa merah).
- `report-policy.ts` tetap **MURNI**: `isHoliday(date, holidays?)`,
  `isWorkingDay`, dan `decide(date, holidays?)` menerima himpunan tanggal
  sebagai argumen opsional. `undefined` = pakai daftar statis (kompatibilitas
  & test). `holidayKindOf(iso, holidays?)` di `calendar.ts` juga menerima
  himpunan ini. **Himpunan kosong tidak pernah membuat Sabtu/Minggu jadi hari
  kerja** — pagar ini diuji.
- Jalur kirim: `performSubmit()` (dipakai manual, webhook cron, dispatch massal)
  memuat libur via `loadHolidaySet()` bila pemanggil tidak memberikannya, lalu
  meneruskannya ke `assessReadiness()` → `decide()`. Jadi **ketiga** jalur kirim
  memakai libur admin yang sama tanpa perubahan di masing-masing route.
- Validasi input libur (bentuk tanggal, tolak akhir pekan, tolak > masa
  program, nama wajib & panjangnya) ada di `src/lib/holiday-admin.ts` (MURNI,
  teruji di `holiday-admin.test.ts`). Endpoint `/api/admin/holidays`
  (GET/POST/PUT/DELETE) mengikuti pola admin lain: guard role di SERVER, rate
  limit `adminUserAction`, tanggal `@db.Date` dibandingkan sebagai string.
- **Anti-`setState` di efek** (lint `react-hooks/set-state-in-effect`): form
  libur (`holidays-manager.tsx`) tidak menyelaraskan state lewat `useEffect`.
  Halaman memberi `key` dari data server; `router.refresh()` yang mengubah
  `key` memasang ulang komponen dengan daftar segar (pola sama seperti form
  template).

#### Panel Admin: pantau jadwal & jalankan otomasi per-user

- **Kolom baru di tabel pengguna `/admin`**: `Jadwal` (jam:menit WIB dari
  `AutomationConfig.hour/minute`) dan `Hari ini` (badge apakah otomasi sudah
  dicoba hari itu). Tombol **Jalankan** per-baris memaksa jalankan otomasi
  seorang pengguna tanpa menunggu jam jadwalnya.
- **Aturan murni & teruji di `src/lib/admin-automation.ts`**:
  `jakartaDayRange(now)` (batas hari WIB sebagai `Date` UTC, offset dihitung
  dari `now` lewat `Intl` — bukan asumsi `+07:00` tetap),
  `scheduleLabel(hour, minute)`, dan `assessTodayRun(logs, now)`. "Sudah jalan
  hari ini" = ada `SubmitLog` APA PUN hari ini (SUCCESS/DUPLICATE/FAILED);
  bila ada, status log TERAKHIR yang menang (FAILED → `GAGAL`, selain itu
  `SELESAI`). Fungsi ini MURNI terhadap `now` (bisa diuji tanggal tetap).
- **Data**: `getAdminUsers(now?)` (`admin-query.ts`) kini juga menarik
  `automation.hour/minute` dan log hari ini (query bersyarat: hanya bila rentang
  hari sah). `AdminUserRow` (`src/lib/admin.ts`) bertambah `automationHour`,
  `automationMinute`, `todayRunStatus`, `todayRunAt`.
- **Eksekusi 1 user = `src/lib/admin-run-one.ts` (`runOne`)**, memakai
  `performSubmit` yang SAMA dengan dispatcher massal & webhook. Jadi **"paksa"
  berarti abaikan JAM jadwal, BUKAN abaikan kebijakan laporan** — libur/akhir
  pekan/akhir program, pra-cek duplikat (RB-03), dan gerbang `ALLOW_LIVE_SUBMIT`
  tetap berlaku. Pemicu dicatat sebagai `CRON` (tindakan sistem atas nama user,
  keputusan pemilik), `logOnNotReady: true` (konsisten dengan cron). Sasaran
  tak-ada / ter-soft-delete → `NOT_FOUND`/`DELETED` (route memetakan ke 404).
- **Endpoint `POST /api/admin/dispatch/user`** (`src/app/api/admin/dispatch/user/route.ts`):
  guard sesi + role ADMIN di SERVER, rate limit scope `adminUserAction`
  (20/10 menit per admin, sama kelas dengan aksi admin lain), body `{ userId }`
  divalidasi. Balasan TIDAK memuat rahasia — hanya `kind`, `label`,
  `succeeded`, `message` (lewat `summarizeRunOne`).
- **UI klien `src/app/(app)/admin/run-user-button.tsx`**: `useRouter` statis
  (BUKAN hook di dalam `useEffect`/`import()` dinamis — itu melanggar
  `react-hooks`), kirim `{ userId }`, tampilkan toast, lalu `router.refresh()`
  agar kolom "Hari ini" langsung memperbarui.
- **Kolom "Aksi" = tombol IKON, bukan teks.** Ketiga aksi baris memakai
  `lucide-react` + size `icon-sm`, dengan `title` DAN `aria-label` (wajib, kalau
  tidak tombol ikon jadi tak terbaca pembaca layar): `Play` = jalankan otomasi
  (spinner `Loader2` saat proses), `KeyRound` = atur ulang kata sandi,
  `Trash2` = hapus. Ikon diimpor langsung dari `lucide-react` (sudah jadi
  dependensi, dipakai `date-picker`/`password-input`). Teks label tetap di
  dalam dialog konfirmasi, jadi aksi berbahaya tetap jelas sebelum dijalankan.
- **`formatJakartaTimeOnly`** ditambahkan di `src/lib/audit-log.ts` (jam:menit
  WIB, `hourCycle: "h23"` supaya tengah malam `00:00` bukan `24:00`), teruji.

Untuk perubahan yang menyentuh kode rahasia, verifikasi **negative case**
(gagal seperti seharusnya), bukan hanya jalur sukses. **Wajib** membuktikan
test benar-benar bisa gagal (sengaja rusakkan kode → test harus merah →
kembalikan), karena test yang selalu hijau belum tentu menguji apa pun.

### Catatan `npm audit`

`npm audit` melaporkan 6 kerentanan (`vitest`, `@vitest/mocker`, `deepmerge-ts`,
`mysql2`). Semuanya **dev/transitif** dan tidak masuk bundle produksi; `mysql2`
(driver MySQL) bahkan tidak pernah dirujuk karena proyek memakai Postgres.
**Jangan** jalankan `npm audit fix --force`, risikonya breaking change demi
paket yang tidak terpakai.

---

## 8. Git, Commit & Push Hanya oleh Pemilik

**Aturan ini berlaku untuk SEMUA agent, tanpa terkecuali.**

Agent **boleh**: menulis file, mengedit kode, menjalankan test, menjalankan
build, memeriksa `git status` / `git diff` / `git log` (read-only).

Agent **TIDAK boleh**:

- `git commit`
- `git push` / `git push --force`
- `git tag`, `git merge`, `git rebase`, `git reset`
- `git init` (pemilik yang akan menginisialisasi repo bila perlu)
- mengubah konfigurasi git (nama, email, remote)

### Kenapa

Repo ini nanti memuat kode yang menyentuh kredensial orang lain dan melakukan
submit otomatis. Riwayat git adalah jejak audit. Pemilik ingin **melihat setiap
perubahan sebelum tercatat**, termasuk memastikan tidak ada rahasia yang
tidak sengaja ikut ter-commit.

### Cara kerja yang benar

1. Agent menyelesaikan perubahan file.
2. Agent **menyerahkan** ke pemilik (berhenti, tanpa commit).
3. Pemilik menjalankan sendiri:
   ```powershell
   git status
   git diff
   git add <file>
   git commit -m "pesan"
   git push
   ```

### Kalau pemilik secara eksplisit meminta commit

Pemilik tetap boleh memerintahkan commit untuk sesi tertentu, misalnya
_"commit dan push sekarang"_. Kalau itu terjadi, agent **boleh** melakukannya, tetapi tetap wajib:

- memeriksa `git status` dan `git diff` **sebelum** `git add`,
- memastikan **tidak ada** file `.env`, kredensial, atau rahasia yang ikut,
- memakai pesan commit yang jelas dan jujur (tidak melebih-lebihkan).

Tanpa instruksi eksplisit itu, **default-nya adalah tidak commit.**

---

## 9. Konvensi Perubahan

- Bahasa komentar, dokumen, **dan balasan ke pemilik**: **Indonesia**,
  sederhana. Balasan agent tidak boleh berganti ke Inggris/Mandarin/bahasa lain
  di tengah percakapan (lihat §2).
- Bahasa kode (nama variabel/fungsi): Inggris, konsisten.
- **Bahasa pesan pengguna: Indonesia, sederhana, tanpa jargon teknis.** Setiap
  teks yang bisa muncul di layar (error API, `message`, toast, label) harus
  dimengerti orang awam dan memberi satu tindakan berikutnya — lihat §3
  "Semua teks yang dilihat pengguna wajib dimengerti orang awam".
- TypeScript **strict**, hindari `any`. Kalau terpaksa, beri komentar alasannya.
- Satu perubahan = satu tujuan.
- Pesan commit (dibuat pemilik): `feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`.
- Kalau keputusan menyimpang dari `SPEC.md`, **perbarui `SPEC.md`** dalam
  perubahan yang sama.

---

## 10. Hubungan dengan Proyek Python Lama

|              | `maganghub-autoabsen` | Proyek ini          |
| :----------- | :-------------------- | :------------------ |
| Mesin submit | Playwright + Chromium | Direct REST API     |
| Status       | Produksi, tetap jalan | Baru, tahap rencana |

- **Tidak saling bergantung.** Proyek web tidak boleh mengimpor dari proyek
  Python, dan sebaliknya.
- **Jangan submit di hari yang sama** dari dua sistem (`409`).
- **Jangan menyalin file** dari proyek Python ke sini (bahasa & arsitektur
  berbeda; menyalin menimbulkan kode mati).
- Kalau ragu soal perilaku proyek lama, **baca** `../maganghub-autoabsen/AGENTS.md`, jangan mengubahnya.

---

## 11. Q&A Cepat untuk Agent

| Situasi                              | Tindakan                                            |
| :----------------------------------- | :-------------------------------------------------- |
| Selesai menulis kode                 | **Berhenti. Jangan commit.** Serahkan ke pemilik    |
| Butuh nilai rahasia untuk test       | Buat kunci acak sementara; jangan pakai nilai nyata |
| Ragu soal arsitektur                 | Baca `SPEC.md`; kalau menyimpang, catat di sana     |
| Diminta menyentuh folder Python lama | **Tolak**, kecuali pemilik memerintahkan eksplisit  |
| Kena `403` dari portal               | Tampilkan pesannya; jangan spoof UA. Untuk host SSO boleh lewat `MAGANGHUB_PROXY_URL` |
| Input dari pengguna                  | Validasi dengan Zod dulu, di server                 |
| Menyimpan kredensial                 | Enkripsi AES-256-GCM dulu, baru masuk DB            |
| Gagal submit                         | Catat gagal apa adanya; jangan tandai sukses        |
| Portal balas `409`                   | Sudah ada presensi hari itu, catat, jangan ulangi   |
| Ragu perubahan aman                  | `npm test` + `npm run typecheck` + `npm run build`  |
| Membalas ke pemilik                  | **Bahasa Indonesia saja**, jangan ganti bahasa di tengah percakapan |
