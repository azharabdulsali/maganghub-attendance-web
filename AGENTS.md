# AGENTS.md — MagangHub Attendance Web

Panduan untuk AI agent (dan kontributor) yang bekerja di repo ini.

> **Baca ini dulu, lalu baca `SPEC.md`.** `SPEC.md` adalah sumber kebenaran
> untuk *apa* yang dibangun. File ini menjelaskan *bagaimana* bekerja di
> dalamnya tanpa merusak apa pun.

---

## 1. Apa Proyek Ini

Aplikasi web **multi-user** untuk mengelola presensi dan laporan harian magang
ke portal Monev MagangHub Kemnaker.

Tiga kemampuan inti:
1. Menyimpan kredensial Monev pengguna secara terenkripsi (AES-256-GCM).
2. Menyusun laporan harian dari **3 template tetap** (Uraian Aktivitas,
   Pembelajaran yang Diperoleh, Kendala) — **tanpa AI, tanpa integrasi GitHub**.
3. Mengirim laporan lewat **Direct REST API** — tanpa browser, tanpa worker,
   tanpa biaya bulanan.

**Status saat ini: Tahap 1 selesai** (fondasi autentikasi: register, login,
dashboard terlindungi). Lihat `SPEC.md` §13 untuk keputusan yang mengikat —
khususnya bahwa **AI dan integrasi GitHub sudah dibatalkan**.

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
- **Jangan log atau tampilkan password** dalam bentuk apa pun — tidak di
  console, tidak di audit log, tidak di pesan error.
- **Jangan memalsukan User-Agent** atau memakai proxy untuk menembus `403`
  portal. Batas etika ini ada di `SPEC.md` §6 dan §10.
- **Jangan menambahkan dependensi** tanpa alasan jelas. Setiap paket baru
  memperbesar permukaan serangan untuk aplikasi yang menyimpan password orang
  lain.

### Selalu
- **Validasi semua input dengan Zod di sisi server** sebelum menyentuh DB.
- **Enkripsi kredensial sebelum masuk database**; DB hanya boleh menyimpan
  ciphertext + IV + auth tag.
- **Setiap percobaan submit dicatat** ke tabel audit log.
- **Periksa `SPEC.md` dulu** sebelum mengambil keputusan arsitektur. Kalau
  ingin menyimpang, tulis alasannya di `SPEC.md`, jangan diam-diam.
- **Jalankan `npm run lint`, `npm run typecheck`, dan `npm run build`** sebelum
  menyatakan selesai. (`npm test` belum terpasang — lihat §7.)

---

## 3. Tech Stack

| Layer | Teknologi |
| :--- | :--- |
| Framework | Next.js (App Router), TypeScript |
| Styling | Tailwind CSS v4 + **neobrutalism.dev** (via shadcn CLI) |
| UI base | **Base UI** (`@base-ui/react`) — komponen neobrutalism memakai ini |
| Database | PostgreSQL (Neon) |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-neon`) |
| Auth | NextAuth.js v5 (**email/password saja** — tanpa OAuth) |
| Enkripsi | AES-256-GCM (`node:crypto`) |
| AI | **Tidak dipakai** — template tetap menggantikan peringkasan AI |
| Test | Vitest (belum terpasang) |
| Deploy | Vercel (serverless, paket gratis) |

Detail dan alasan tiap pilihan ada di `SPEC.md` §3.

### Aturan UI (penting)

- Komponen ada di `src/components/ui/` — **jangan diedit gayanya sembarangan**;
  tambah komponen baru lewat `npx shadcn@latest add <url-neobrutalism>`.
- Komponen neobrutalism dibangun di atas **Base UI**, **bukan Radix**. Karena itu
  prop `asChild` **tidak ada**. Untuk merender `Button` sebagai link, pakai
  prop `render`:
  ```tsx
  <Button render={<Link href="/register" />}>Daftar</Button>
  ```
- Warna **wajib** pakai token, bukan warna mentah: `bg-main`,
  `text-main-foreground`, `bg-secondary-background`, `text-foreground`,
  `border-border`, `rounded-base`, `shadow-shadow`, `font-heading`, `font-base`.
  Hindari `slate-*`/`gray-*`/`rounded-md` — tidak mengenal tema neobrutalism.
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
├── .env              # RAHASIA — jangan pernah commit
└── SPEC.md / AGENTS.md
```

**Aturan penempatan:**
- Kode yang menyentuh rahasia (dekripsi, API key) hanya di `src/lib/` dan
  `src/services/`, tidak pernah di `components/`.
- Komponen UI tidak boleh mengimpor Prisma langsung — lewat server action.


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
- Jika menemukan kode yang menuliskan password ke log, itu **bug kritis** —
  perbaiki atau laporkan, jangan diabaikan.

### Aturan `ENCRYPTION_KEY` (jangan sampai salah)
- **64 karakter hex** (32 byte) untuk AES-256-GCM. `env.ts` memvalidasi ini
  lewat regex `^[0-9a-fA-F]{64}$`.
- Boleh ditulis **dengan atau tanpa tanda kutip** di `.env.local`; `dotenv`
  mengupas kutipnya otomatis, jadi yang dilihat kode tetap 64 karakter. (Kalau
  memeriksa bentuk kunci lewat PowerShell `Get-Content`, Anda melihat teks
  mentah — itu bisa tampak 66 karakter. Itu **bukan** bug. Verifikasi lewat
  nilai yang sudah dimuat `dotenv`, bukan teks mentah.)
- **Jangan pernah mengganti kunci ini setelah ada data kredensial tersimpan** —
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
> `@types/node` v22+, sedangkan proyek ini di `@types/node` v20 — `npm install
> vitest` polos akan gagal `ERESOLVE`. Selain itu `@vitejs/plugin-react`
> **bentrok** dengan `@babel/*` bawaan `shadcn`; plugin itu tidak dibutuhkan
> selama test hanya menguji fungsi Node (tanpa JSX).

Prioritas test:
1. ✅ **Enkripsi** (`src/lib/crypto.test.ts`, 14 test) — round-trip, IV selalu
   baru, anti-tamper (ciphertext & authTag diubah → gagal), kunci salah → gagal,
   `safeEqual`.
2. **Penegakan 100 karakter** pada laporan yang disusun dari template.
3. **Penggantian placeholder** template (mis. `{tanggal}`) saat menyusun draf.
4. **Penanganan error API Monev**: 409, 422, 403 tidak membuat sistem crash.

Untuk perubahan yang menyentuh kode rahasia, verifikasi **negative case**
(gagal seperti seharusnya), bukan hanya jalur sukses. **Wajib** membuktikan
test benar-benar bisa gagal (sengaja rusakkan kode → test harus merah → 
kembalikan), karena test yang selalu hijau belum tentu menguji apa pun.

### Catatan `npm audit`
`npm audit` melaporkan 6 kerentanan (`vitest`, `@vitest/mocker`, `deepmerge-ts`,
`mysql2`). Semuanya **dev/transitif** dan tidak masuk bundle produksi; `mysql2`
(driver MySQL) bahkan tidak pernah dirujuk karena proyek memakai Postgres.
**Jangan** jalankan `npm audit fix --force` — risikonya breaking change demi
paket yang tidak terpakai.


---

## 8. Git — Commit & Push Hanya oleh Pemilik

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
perubahan sebelum tercatat** — termasuk memastikan tidak ada rahasia yang
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
*"commit dan push sekarang"*. Kalau itu terjadi, agent **boleh** melakukannya
— tetapi tetap wajib:
- memeriksa `git status` dan `git diff` **sebelum** `git add`,
- memastikan **tidak ada** file `.env`, kredensial, atau rahasia yang ikut,
- memakai pesan commit yang jelas dan jujur (tidak melebih-lebihkan).

Tanpa instruksi eksplisit itu, **default-nya adalah tidak commit.**

---

## 9. Konvensi Perubahan

- Bahasa komentar & dokumen: **Indonesia**, sederhana.
- Bahasa kode (nama variabel/fungsi): Inggris, konsisten.
- TypeScript **strict**, hindari `any`. Kalau terpaksa, beri komentar alasannya.
- Satu perubahan = satu tujuan.
- Pesan commit (dibuat pemilik): `feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`.
- Kalau keputusan menyimpang dari `SPEC.md`, **perbarui `SPEC.md`** dalam
  perubahan yang sama.

---

## 10. Hubungan dengan Proyek Python Lama

| | `maganghub-autoabsen` | Proyek ini |
| :--- | :--- | :--- |
| Mesin submit | Playwright + Chromium | Direct REST API |
| Status | Produksi, tetap jalan | Baru, tahap rencana |

- **Tidak saling bergantung.** Proyek web tidak boleh mengimpor dari proyek
  Python, dan sebaliknya.
- **Jangan submit di hari yang sama** dari dua sistem (`409`).
- **Jangan menyalin file** dari proyek Python ke sini (bahasa & arsitektur
  berbeda; menyalin menimbulkan kode mati).
- Kalau ragu soal perilaku proyek lama, **baca** `../maganghub-autoabsen/AGENTS.md`
  — jangan mengubahnya.

---

## 11. Q&A Cepat untuk Agent

| Situasi | Tindakan |
| :--- | :--- |
| Selesai menulis kode | **Berhenti. Jangan commit.** Serahkan ke pemilik |
| Butuh nilai rahasia untuk test | Buat kunci acak sementara; jangan pakai nilai nyata |
| Ragu soal arsitektur | Baca `SPEC.md`; kalau menyimpang, catat di sana |
| Diminta menyentuh folder Python lama | **Tolak**, kecuali pemilik memerintahkan eksplisit |
| Kena `403` dari portal | Tampilkan pesannya; jangan spoof UA / proxy |
| Input dari pengguna | Validasi dengan Zod dulu, di server |
| Menyimpan kredensial | Enkripsi AES-256-GCM dulu, baru masuk DB |
| Gagal submit | Catat gagal apa adanya; jangan tandai sukses |
| Portal balas `409` | Sudah ada presensi hari itu — catat, jangan ulangi |
| Ragu perubahan aman | `npm test` + `npm run typecheck` + `npm run build` |

