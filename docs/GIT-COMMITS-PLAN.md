# Rencana: Auto Laporan dari Commit Git

> Status: **Fase 1–4 SELESAI** (kecuali dua butir yang menunggu pemilik, lihat
> §11). Draf rencana ini disetujui pemilik dan menjadi acuan resmi. Bila ada
> penyimpangan saat menulis kode, dokumen ini yang diperbarui lebih dulu, bukan
> dibiarkan diam-diam (AGENTS.md §2).

---

## 1. Latar belakang

Pengguna mengisi laporan harian Monev dengan 3 kolom tetap (Uraian Aktivitas,
Pembelajaran, Kendala). Selama ini isinya berasal dari template yang sama tiap
hari, atau diedit manual. Fitur ini menambahkan **sumber keempat**: pesan commit
git hari itu, yang dijadikan bahan konkret untuk menyusun draf.

Manfaat yang diharapkan: laporan mencerminkan pekerjaan yang benar-benar
dilakukan, tanpa mengetik ulang manual.

---

## 2. Keputusan pemilik (2026-06)

Empat keputusan ini diambil pemilik saat diskusi awal. Sifatnya mengikat.

| # | Aspek | Keputusan | Alasan |
| :--- | :--- | :--- | :--- |
| 1 | Dokumentasi | **Cabut resmi** keputusan "Integrasi GitHub dibatalkan" | Fitur kini diinginkan pemilik. Lihat §3. |
| 2 | Jumlah repo | **Satu repo per pengguna** (skema siap banyak) | Paling sederhana; banyak repo menyusul bila terbukti berguna |
| 3 | Otomasi | **Toggle per pengguna** di `/automation`, default **nonaktif** | Menjaga kendali di tangan pengguna (SPEC §1) |
| 4 | Provider | **GitHub + GitLab** sejak rilis pertama | Peserta magang memakai keduanya |

---

## 3. Pencabutan keputusan lama (WAJIB, bukan opsional)

Dokumen lama **berulang kali dan tegas** menolak integrasi GitHub. Menambahkan
fitur ini tanpa memperbaruinya berarti melanggar aturan proyek sendiri.
Ada preseden: larangan proxy dicabut resmi pada 2026-06 (SPEC §6).

### 3.1 Yang dicabut

| Berkas | Lokasi | Isi lama | Menjadi |
| :--- | :--- | :--- | :--- |
| `SPEC.md` | §13 tabel keputusan baris **#7** | "Sumber commit GitHub - **DIBATALKAN**" | "Sumber commit GitHub/GitLab - **DIIZINKAN** (opsional, opt-in)" |
| `SPEC.md` | §10 tabel "Dibuang dari rencana awal" | "Integrasi GitHub (ambil commit)" | Dipindah ke tabel "Diambil", dengan catatan batasnya |
| `SPEC.md` | §7 `SourceType` | hanya `TEMPLATE`, `MANUAL_EDIT` | bertambah `COMMITS` |
| `SPEC.md` | §8 Daftar endpoint | `/api/github/commits` tercatat **dihapus** | bertambah `/api/repos`, `/api/repos/preview` |
| `AGENTS.md` | §2 baris 47 | "Integrasi GitHub tetap dibatalkan." | Aturan baru di §3.2 di bawah |
| `README.md` | Tabel dokumen | belum menyebut dokumen ini | tambah baris `docs/GIT-COMMITS-PLAN.md` |

### 3.2 Aturan baru untuk `AGENTS.md` §2

Menggantikan kalimat "Integrasi GitHub tetap dibatalkan":

> - **KEPUTUSAN BARU (2026-06) - integrasi GitHub/GitLab DIIZINKAN untuk
>   mengambil commit.** Aturan lama ("integrasi GitHub dibatalkan") **dicabut
>   pemilik**. Batas yang TETAP berlaku:
>   (a) **token hanya boleh punya scope BACA** (fine-grained PAT `Contents:
>   Read` di GitHub; `read_api` di GitLab) - aplikasi ini tidak pernah menulis
>   ke repo siapa pun;
>   (b) **token tidak pernah dikembalikan ke klien**, tidak pernah masuk log
>   atau pesan error - perlakuan sama persis dengan password Monev;
>   (c) **URL API dibangun dari enum provider**, bukan dari input pengguna,
>   untuk menutup celah SSRF;
>   (d) **fallback lokal wajib tetap ada** - API git gagal atau tidak ada commit
>   tidak boleh membuat form laporan error;
>   (e) fitur ini **tidak pernah** menghalangi submit normal. Ia hanya bahan
>   draf.

---

## 4. Arsitektur

### 4.1 Alur data

```
  [commit hari ini di GitHub/GitLab]
              |
              |  (bearer token, terenkripsi di DB)
              v
  git-provider.ts  -->  adapter GitHub / GitLab  -->  commit[]
              |
              |  commitsToKeywords()  (MURNI, teruji)
              v
        keywords (teks ringkas)
              |
              v
   draftWithFallback()  --(sudah ada)-->  LLM Gemini, gagal -> lokal
              |
              v
   DraftResult { activity, learning, obstacles }
              |
              v
      form laporan (pengguna review, boleh edit)
```

**Poin penting:** fitur ini **tidak** membuat jalur penyusunan baru. Ia hanya
menambahkan **sumber `keywords`** ke penyusun yang sudah ada
(`src/lib/report-draft.ts`). Karena `ReportDrafter` sudah dirancang sebagai
kontrak yang bisa diganti-ganti, UI dan rute laporan **tidak perlu diubah**.

### 4.2 Mengapa tanpa dependensi baru

GitHub REST (`/repos/{owner}/{repo}/commits`) dan GitLab REST
(`/projects/{id}/repository/commits`) sama-sama bisa diakses dengan `fetch`.
`AGENTS.md` §2 melarang menambah paket tanpa alasan jelas; menambah SDK hanya
untuk dua endpoint tidak sepadan. **Tidak ada paket baru di rencana ini.**

---

## 5. Model data

```prisma
enum GitProvider {
  GITHUB
  GITLAB
}

/// Satu repo git per pengguna (keputusan #2). Kolom userId diberi @unique
/// SEKARANG, dihapus saat fitur banyak-repo diaktifkan kelak - bukan
/// migrasi ulang dari nol.
model GitRepoConfig {
  id       String      @id @default(cuid())
  userId   String      @unique
  provider GitProvider
  /// "owner/nama-repo" (GitHub) atau "grup/sub/proyek" (GitLab).
  /// Divalidasi ketat; TIDAK dipakai membangun URL tanpa sanitasi.
  repoPath String
  /// Branch yang dibaca. KOSONG = default branch repo menurut penyedia.
  /// Sengaja TIDAK lagi @default("main"): repo GitLab baru memakai "master",
  /// dan menebak "main" membuat commit di branch kerja tak pernah terlihat.
  /// Divalidasi sebelum masuk query string (lihat §16).
  branch   String      @default("")

  /// Token akses, SELALU terenkripsi AES-256-GCM.
  /// Pola sama dengan MaganghubCredential: hanya ciphertext + iv + authTag
  /// yang masuk DB. Plaintext tidak pernah disimpan.
  ciphertext String
  iv         String
  authTag    String

  enabled       Boolean   @default(true)
  lastFetchedAt DateTime?
  /// Pesan gagal terakhir, SUDAH disanitasi (tanpa token). NULL = tidak ada
  /// masalah. Ditampilkan di UI supaya pengguna tahu tokennya kedaluwarsa.
  lastError     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("git_repo_configs")
}
```

Tambahan pada enum yang sudah ada:

```prisma
enum SourceType {
  TEMPLATE
  MANUAL_EDIT
  COMMITS      // bertambah
}
```

`User` perlu relasi balik `gitRepoConfig GitRepoConfig?`.

### 5.1 Dampak ke database

- **Hanya menambah**: 1 tabel baru (`git_repo_configs`), 1 enum baru, 1 nilai
  enum. Tidak ada kolom lama yang diubah atau dihapus.
- Perlu `npm run db:push` **sebelum** deploy kode yang memakainya, karena
  query `User` akan gagal bila relasi belum ada di Neon.
- Catatan proyek: skema disinkronkan dengan `db push`, tanpa folder migrasi
  (README §4). Tetap disarankan menyalin database dulu sebelum push.

---

## 6. Keamanan (bagian paling ketat)

Aplikasi ini menyimpan akses ke repo orang lain. Perlakuannya disamakan
dengan password Monev (AGENTS.md §5).

| Ancaman | Mitigasi |
| :--- | :--- |
| Token bocor ke klien | `GET /api/repos` **tidak** memilih kolom token. `select` eksplisit, bukan seluruh baris. |
| Token masuk log/pesan error | Semua error API disanitasi lewat fungsi yang membuang header & URL. Dites dengan **negative case**. |
| SSRF (pengguna menunjuk URL internal) | URL API **dibangun dari enum `provider`**, tidak pernah dari input. `repoPath` divalidasi regex `^[\w.-]+/[\w.-]+$` (GitHub) dan pola GitLab. |
| Token berlebih kuasa | UI & dokumen mewajibkan PAT **read-only**. Server menolak provider yang tidak dikenal. |
| Brute force / spam | Rate limit scope baru `gitRepo` (20/10 menit). |
| Data commit terkirim ke pihak ketiga | Commit dikirim ke Gemini **hanya bila** `GEMINI_API_KEY` diisi. Bila kosong, penyusun lokal dipakai dan tidak ada data keluar. Ditulis di `/privacy` bagian 4. |
| Repo privat disalahgunakan | Pengguna hanya bisa menambah repo yang **tokennya memang bisa akses**. Tidak ada eskalasi: API git menolak sendiri. |

Aturan tambahan:

- **Token hanya dibaca saat menyusun draf**, lalu dilupakan (tidak disimpan di
  cache global).
- Bila token invalid (401), simpan `lastError` yang jelas ("Token kedaluwarsa,
  perbarui di halaman Repo"). **Jangan** diam-diam memakai draf template seolah
  semuanya beres. Pengguna harus tahu.

---

## 7. Berkas yang disentuh

### Baru

| Berkas | Isi |
| :--- | :--- |
| `src/lib/git-commits.ts` | MURNI: `commitsToKeywords()`, pemadatan judul/isi commit, batas panjang, deduplikasi |
| `src/lib/git-provider.ts` | Kontrak `GitClient` + `getGitClient(provider)`; URL dibangun dari enum |
| `src/lib/git-provider-github.ts` | `fetchCommits()` GitHub REST |
| `src/lib/git-provider-gitlab.ts` | `fetchCommits()` GitLab REST |
| `src/lib/git-repo-config.ts` | CRUD konfigurasi + enkripsi/dekripsi token |
| `src/lib/git-draft-source.ts` | Jembatan: config -> ambil commit -> keywords -> `DraftInput` |
| `src/app/api/repos/route.ts` | `GET`/`PUT`/`DELETE` konfigurasi repo |
| `src/app/api/repos/preview/route.ts` | `POST`: pratinjau commit hari ini (tanpa menyimpan) |
| `src/app/api/report-templates/generate/route.ts` | `POST`: susun draf; commit hari itu dipakai sebagai bahan bila kata kunci kosong |
| `src/app/(app)/repos/page.tsx` | Halaman kelola repo |
| `src/components/repos/repo-form.tsx` | Form provider + repoPath + branch + token |
| `src/lib/git-commits.test.ts` | Tes fungsi murni |
| `src/lib/git-provider.test.ts` | Tes adapter + sanitasi error |
| `src/lib/git-repo-config.test.ts` | Tes enkripsi & `select` eksplisit |

### Diubah

| Berkas | Perubahan |
| :--- | :--- |
| `prisma/schema.prisma` | Model + enum (§5) |
| `SPEC.md` | §5 (fitur), §7 (model), §8 (endpoint), §10, §13 #7 |
| `AGENTS.md` | §2 aturan baru (§3.2) |
| `README.md` | Tabel dokumen + variabel env opsional |
| `src/lib/env.ts` | `GIT_COMMITS_ENABLED` opsional (kill switch global) |
| `src/lib/report-draft.ts` | `DraftInput` menerima `commitSummary?: string` |
| `src/lib/nav.ts` | Menu "Repo" |
| `src/app/(app)/automation/page.tsx` | Toggle "Susun dari commit" |
| `src/app/privacy/page.tsx` | Bagian 4: sebutkan commit dikirim ke Google bila LLM aktif |
| `.env.example` | Dokumentasi variabel opsional |

---

## 8. Tahapan implementasi

### Fase 1 - Dokumentasi + skema (tanpa logika)

1. Perbarui `SPEC.md`, `AGENTS.md`, `README.md` (§3).
2. Tambah model + enum di `prisma/schema.prisma`.
3. Tulis `docs/GIT-COMMITS-PLAN.md` (dokumen ini).
4. **Berhenti.** Pemilik menjalankan `npm run db:push` dan meninjau.

> Fase ini tidak mengubah perilaku aplikasi sama sekali. Aman ditinjau.

### Fase 2 - Klien API (belum menyentuh UI)

1. `git-provider.ts` + dua adapter.
2. `git-commits.ts` (murni) + tes.
3. Tes memakai respons JSON **palsu** sebagai fixture. **Tidak ada panggilan
   jaringan sungguhan di dalam tes**.
4. Verifikasi negative case: 401, 404, rate limit 403, respons bukan-JSON,
   repo kosong.

### Fase 3 - Jembatan ke draf

1. `git-repo-config.ts` (enkripsi token, `select` eksplisit).
2. `git-draft-source.ts`: bila ada config & enabled & commit -> isi
   `DraftInput.keywords`; bila gagal -> `keywords` kosong + `lastError` terisi,
   penyusun lokal yang menyelesaikan.
3. Integrasi ke `draftWithFallback` tanpa mengubah kontrak `ReportDrafter`.
4. Tes: "commit ada -> keywords terisi", "API mati -> draf tetap jadi",
   "token tidak pernah muncul di hasil".

**Status: SELESAI, dengan dua penyesuaian yang disengaja.**

- Nama berkas menjadi `src/lib/git-repo-service.ts` (bukan dua berkas
  `git-repo-config.ts` + `git-draft-source.ts`). Alasannya: fungsi dekripsi
  token dan pengambilan commit dipakai bersama oleh rute dan UI; memecahnya
  menjadi dua modul hanya menambah lapisan tanpa memisahkan tanggung jawab
  nyata. Logika murni tetap terpisah di `git-commits.ts` (Fase 2).
- Integrasi **tidak** dimasukkan ke dalam `draftWithFallback`. Commit disuntikkan
  sebagai `DraftInput.keywords` oleh pemanggil (`/api/repos/preview` dan
  `/api/report-templates/generate`), lalu draf disusun lewat `draftWithFallback`/
  `getDrafter()`. Dengan begitu penyusun lokal dan LLM tidak perlu tahu apa pun
  tentang git, dan kontrak `ReportDrafter` tetap utuh.
- Kolom **"Pembelajaran yang Diperoleh"** tidak diisi dari commit. Commit
  menunjukkan *apa yang dikerjakan*, bukan *apa yang dipelajari*; mengisinya
  otomatis berarti mengarang. Respons draf menandai `learningNeedsReview: true`
  dan UI menyuruh pengguna menyuntingnya.

### Fase 4 - UI + otomasi

1. Halaman `/repos` (DESIGN.md: token warna, `ConfirmDialog` untuk hapus,
   tombol ikon + `aria-label`).
2. Pratinjau commit hari ini (memakai zona `Asia/Jakarta`, bukan UTC).
3. Toggle di `/automation`, default **nonaktif**.
4. Perbarui `/privacy`.
5. Jalankan `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Status: SEBAGIAN SELESAI.** Sudah dikerjakan bersamaan dengan Fase 3 karena
rute API tanpa UI tidak bisa dipakai pemilik untuk menguji:

- `/repos` (halaman + form) sudah ada, termasuk `ConfirmDialog` untuk hapus,
  pratinjau commit hari itu, dan peringatan bahwa kolom pembelajaran harus
  disunting sendiri.
- `/privacy` sudah diperbarui: data repo yang disimpan, token hanya untuk
  membaca, tidak ada push, dan keterbatasan enkripsi dua arah.
- `GIT_COMMITS_ENABLED` sudah masuk `src/lib/env.ts` (opsional, default aktif
  karena opt-in per pengguna sudah dijaga `GitRepoConfig`).
- Menu sidebar "Repo Git" sudah ditambahkan.

**Belum dikerjakan:** tidak ada. Butir 3 (sakelar) selesai di `/repos`, bukan
`/automation` — lihat catatan penyimpangan di bawah.

> **Celah yang ditemukan & ditutup setelah Fase 4 "selesai".** Sampai saat itu
> commit hanya bisa dilihat lewat tombol "Uji ambil commit" di `/repos`.
> Tombol **"Generate draf"** di `/report-templates` sama sekali tidak memakai
> commit — jadi fitur ini belum menghemat waktu pengguna di tempat ia dipakai
> sehari-hari. Sekarang `POST /api/report-templates/generate` mengambil commit
> hari itu dan memakainya sebagai `keywords`:
>
> - **Kata kunci ketikan pengguna menang atas commit.** Pengguna yang mengetik
>   sedang menyatakan maksudnya secara sadar; menimpanya diam-diam membuat
>   laporan berisi hal yang tidak diminta.
> - **Kegagalan git tidak pernah menggagalkan draf** (SPEC §5.4a). Panggilan
>   `resolveCommits` dibungkus `.catch()` di rute, jadi janji "tidak melempar"
>   milik modul lain tidak menjadi titik gagal tombol Generate.
> - Balasan memuat `git: { status, commitCount, learningNeedsReview }` dengan
>   status `used` / `no-commits` / `unavailable` / `ignored`. Pesan galat git
>   **tidak** dikirim ke klien: pengguna tidak meminta fitur git di form
>   laporan, jadi kegagalannya bukan urusannya dan tidak boleh tampil sebagai

---

## 12. Menyambungkan commit ke alur kirim otomatis (Fase 5) — SUDAH DIPUTUSKAN

Sebelumnya commit hanya dipakai tombol **Generate draf** (manual). Cron tetap
mengirim template. Bagian ini menutup jarak itu.

### Keputusan pemilik (jangan diubah tanpa bertanya lagi)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Alur | **B** — draf dari commit disimpan sebagai template bertanggal, lalu dikirim |
| 2 | Tanpa commit | Pakai **template harian** (tetap kirim, tidak menahan laporan) |
| 3 | Kolom Pembelajaran | **Selalu terisi.** Ketiga kolom disusun dari sumber yang sama. Penyusun lokal menjamin panjang >= `MIN_REPORT_LENGTH`, jadi tidak ada kolom kosong yang ditolak portal |
| 4 | Jendela meninjau | **Tidak perlu meninjau.** Draf disusun sesaat sebelum kirim |
| 5 | Pemicu | **Satu cron saja** (jam yang sudah ada). Tidak menambah jadwal baru |

### Urutan sumber isi (berlaku di SEMUA jalur kirim)

```
commit hari itu  ->  template bertanggal  ->  template harian  ->  batal
```

Aturan ini ada di satu tempat, `chooseReportContent()`
(`src/lib/report-source.ts`), dan dipakai oleh **kedua** jalur cron:

- `src/lib/cron-dispatch-run.ts` — dispatcher massal (`/api/cron/run-all`)
- `src/app/api/cron/submit/route.ts` — cron per pengguna (`?key=<webhookKey>`)

Memasangnya di satu jalur saja akan membuat pengguna jalur lain terus mengirim
template selamanya — fitur tampak ada tetapi tidak pernah aktif.

### Cara kerja

1. Cron jalan (dipanggil berulang dalam jam jadwal; idempotensi sudah ada di
   `performSubmit`).
2. `prepareCommitDraft(userId, date)`:
   - template bertanggal hari itu **sudah ada** -> tidak menulis apa pun
     (`ALREADY_EXISTS`), **suntingan manusia tidak pernah ditimpa**;
   - ada commit -> susun 3 kolom -> simpan sebagai `DatedReportTemplate`
     (`SAVED`), sehingga bisa dibuka & disunting di `/report-templates`;
   - tidak ada commit / git gagal / penyusun gagal -> `NO_COMMITS` / `FAILED`,
     **tidak melempar**, alur lanjut ke template.
3. Isi terpilih dikirim lewat `performSubmit` seperti biasa.

### Jaminan yang dikunci tes

- Urutan sumber benar (`report-source.test.ts`, `cron-dispatch-run.test.ts`)
- Suntingan manusia tidak ditimpa; cek dilakukan **sebelum** memanggil API git
  (hemat kuota token) (`commit-draft-service.test.ts`)
- Draf setengah jadi (ada kolom kosong) **tidak** dikirim
- Kegagalan git/penyusun tidak menghalangi kirim; satu user gagal tidak
  menjatuhkan user lain
- Semua tes di atas dibuktikan **bisa gagal** (kode sengaja dirusak -> merah ->
  dikembalikan)

### Bug yang ditemukan & diperbaiki saat pengerjaan

`runDispatch(now)` memakai `now` untuk jam tetapi `new Date()` untuk tanggal.
Akibatnya jam 7 WIB bisa dipasangkan dengan tanggal yang salah di sekitar tengah
malam, dan fungsi itu tidak bisa diuji. Kini `todayInJakarta(now)`.

>   error merah. Ini dikunci tes `not.toContain("Token git ditolak")`.
> - Toast membedakan "Draf disusun dari commit hari ini (N commit)" dari
>   "Draf disusun", supaya draf lama tidak disangka berasal dari commit.
> - 9 tes di `src/app/api/report-templates/generate/route.test.ts`. Tes terbukti
>   bisa gagal: memaksa `bahanGit = null` menghasilkan 3 tes merah.

> **Penyimpangan butir 3, disengaja.** Rencana menyebut "toggle di
> `/automation`", tetapi sakelar diletakkan di halaman **`/repos`** karena di
> sanalah repo terlihat. Alasan lain: `GitRepoConfig.enabled` adalah kolom milik
> repo, sedangkan `/automation` mengurus jam kirim dan `webhookKey`; menaruh
> sakelar bahan draf di halaman jadwal membuatnya sulit ditemukan.
> Isinya tetap sejalan dengan SPEC.md §5.4a dan keputusan pemilik §2 butir 3:
> opt-in, default nonaktif, dikendalikan pengguna.
>
> **Temuan saat pengerjaan:** kolom `enabled` sebelumnya sudah ada di skema dan
> **sudah dihormati** `resolveCommits` (baris `if (!row.enabled)`), tetapi
> **tidak ada satu pun UI atau endpoint yang bisa mengubahnya** — form selalu
> menulis `enabled: true`. Artinya pengguna tidak punya cara mematikan fitur
> selain menghapus repo beserta tokennya. Sekarang ditutup:
> `PUT /api/repos` dengan `{ action: "toggle", enabled }` (skema
> `gitRepoToggleSchema`), dilayani `setRepoEnabled` yang **hanya** menulis kolom
> `enabled` sehingga token tidak tersentuh dan tidak perlu ditempel ulang.
> Tes `setRepoEnabled` mengunci hal ini dengan `expect(Object.keys(data)).toEqual(["enabled"])`.

---

## 9. Risiko yang diterima secara sadar

| Risiko | Penilaian |
| :--- | :--- |
| Pengguna memberi aplikasi akses baca repo | Diterima; token read-only + ditulis di `/privacy` + bisa dicabut kapan saja dari halaman Repo |
| Commit berisi informasi sensitif terkirim ke Gemini | Diterima; hanya bila key diisi, dan diumumkan. Matikan dengan mengosongkan key |
| Token kedaluwarsa membuat draf tidak akurat | Diterima; `lastError` ditampilkan jelas, tidak disembunyikan |
| Nama commit tidak cukup untuk mengisi 3 kolom | Diterima; penyusun lokal menambal panjang minimum, pengguna tetap bisa edit |
| `db push` mengubah Neon | Hanya menambah tabel/enum; tetap disarankan backup |

---

## 10. Yang TIDAK akan dikerjakan

Sengaja dibatasi, sesuai `AGENTS.md` §2 dan SPEC §10:

- **Tidak** memakai GitHub/GitLab OAuth. Cukup token tempel-manual, sama seperti
  jalur cadangan kredensial Monev.
- **Tidak** menulis, membuat issue, atau mengubah apa pun di repo pengguna.
- **Tidak** memakai webhook repo. Hanya tarik saat diminta.
- **Tidak** menambah dependensi baru.
- **Tidak** menyentuh folder `../maganghub-autoabsen/`.
- **Tidak** mengubah cara submit ke Monev. Fitur ini berhenti di draf.

---

## 11. Daftar periksa sebelum menyatakan selesai

- [x] `SPEC.md` dan `AGENTS.md` sudah diperbarui (pencabutan resmi tertulis)
- [ ] `npm run db:push` dijalankan pemilik — **belum dicatat di repo**; jalankan
      bila `GitRepoConfig` belum ada di DB Anda
- [x] `npm run lint` bersih
- [x] `npm run typecheck` bersih
- [x] `npm test` hijau, termasuk tes baru (1064 tes per 2026-11)
- [x] `npm run build` sukses
- [x] Dibuktikan bahwa tes baru **bisa gagal** (sengaja rusakkan kode -> merah
      -> kembalikan). Lihat AGENTS.md §7. Dilakukan pada `setRepoEnabled` dan
      pada integrasi commit -> tombol Generate draf, serta pada pemakaian
      `branch` (§16.1).
- [x] Token tidak muncul di satu pun respons API (dikunci tes `toRepoView` /
      `resolveCommits`; endpoint sakelar tidak menerima token sama sekali)
- [x] `/privacy` menyebut pengiriman commit ke Gemini
- [ ] Pemilik meninjau `git diff` lalu commit sendiri (agent tidak commit)
- [x] **Uji nyata dengan token asli** — **selesai**. Sebelumnya hanya sampai
      pesan "Tidak ada commit pada hari itu"; penyebabnya ternyata branch tidak
      pernah dikirim ke API (§16.1). Setelah diperbaiki, commit nyata pada
      branch `dev-zar` tertarik dan 3 kolom tersusun (§16).

**Butir terbuka yang butuh keputusan pemilik:**

1. Kolom **"Pembelajaran yang Diperoleh"** — sudah diisi dari bukti commit sejak
   §14.1, dan kini mengenali prefix `[TAG]:` (§16.2). Teksnya tetap ditandai
   `learningNeedsReview: true`; pengguna wajib menyesuaikan.
2. **Tanggal laporan mengikuti tanggal COMMIT**, bukan tanggal author. Commit
   hasil rebase karena itu muncul di tanggal commit. Ini bukan bug (§16.3),
   tetapi bila pemilik ingin mengikuti tanggal pengerjaan, itu keputusan produk
   baru yang perlu dibahas terpisah.

## 13. Tinjauan Menyeluruh (setelah Fase 5)

Pemeriksaan seluruh aplikasi, bukan hanya alur commit. Status alat: typecheck
bersih · lint bersih · **974 tes lulus** · build sukses.

### Diperbaiki di tinjauan ini

**1. Query template bertanggal memuat seluruh riwayat (ditemukan & dibatasi).**

Kedua jalur kirim membaca `datedTemplates` **tanpa `where`**, sehingga tiap
pemanggilan cron menarik *semua* baris bertanggal milik pengguna — bukan hanya
tanggal hari ini. Karena draf commit disimpan sebagai baris bertanggal setiap
hari, jumlahnya tumbuh terus (±90 baris/pengguna setelah 3 bulan), dan isinya
teks panjang. Di dispatcher massal dampaknya berlipat: satu query untuk semua
pengguna. Kini disaring `where: { date: hariIni }`, dengan tanggal WIB diturunkan
dari `now` **satu kali** dan dipakai ulang (dua perhitungan terpisah bisa
berbeda bila melewati tengah malam WIB). Indeks `(userId, date)` sudah ada,
jadi tidak perlu migrasi.

Dikunci 2 tes di `cron-dispatch-run.test.ts`. Dibuktikan bisa gagal: menghapus
`where` → 2 tes merah → dikembalikan.

**2. `SPEC.md` §5.6 bertentangan dengan kode.**

Tertulis "buat dari **template pengguna**", padahal alurnya kini
commit → bertanggal → harian. Diperbarui, dan §5.3b ditambahkan sebagai
sumber kebenaran urutan tersebut.

### Diperiksa dan dinilai aman (tidak diubah)

- **29 route API**: semuanya punya auth kecuali yang memang publik (`register`,
  `cron/*`, `auth`). Route template/profile tanpa rate limit dinilai wajar —
  operasi DB lokal milik sendiri, bukan aksi berisiko atau ke portal luar.
- **DB produksi (Neon)**: `dated_report_templates` dan `git_repo_configs`
  **sudah ada** dengan kolom benar dan indeks `(userId, date)`; tak perlu
  `db:push` untuk fitur ini.
- **Bukti fitur belum pernah jalan sungguhan**: `dated_report_templates` berisi
  **0 baris**. Konsisten dengan catatan bahwa semua pengujian masih memakai
  mock. Ini bukan bug, tetapi berarti jalur simpan draf commit belum terbukti
  di lingkungan nyata.

## 14. Dua keputusan yang tadinya ditunda — kini dikerjakan

Kedua butir yang di §13 dicatat "menunggu keputusan pemilik" sudah diputuskan
dan diimplementasikan.

### 14.1 Kolom "Pembelajaran yang Diperoleh" diisi dari BUKTI commit

Keputusan lama (§8 Fase 3) — *jangan isi otomatis karena commit menunjukkan
apa yang dikerjakan, bukan apa yang dipelajari* — **tetap dihormati**. Yang
ditambahkan bukan pengisian bebas, melainkan penurunan dari bukti:

- Modul murni baru `src/lib/commit-learning.ts`: `detectChangeKind()` membaca
  jenis perubahan dari prefix commit — Conventional Commits (`fix:`) **maupun
  kurung siku (`[FIX]:`, lihat §16.2)** — atau kata di judul; lalu
  `learningFromCommits()` merakit kalimat yang **hanya** merujuk pada jenis
  perubahan yang benar-benar ada + topik dari judul commit.
- **Guard yang menentukan**: bila tidak ada satu pun JENIS perubahan yang
  dikenali, fungsi mengembalikan `null` dan kolom dibiarkan kosong. Topik saja
  tidak cukup — judul biasa membuktikan apa yang dikerjakan, bukan bahwa ada
  yang dipelajari.
- `DraftInput` menerima `learning?`. Penyusun memakainya bila lolos
  `checkReportField`, selain itu tetap menyusun sendiri. Drafter tidak tahu
  soal git.
- `/api/repos/preview` menambah `learningSource: "DERIVED" | "EMPTY"` di
  samping `learningNeedsReview: true`. Keduanya tetap `needsReview`: teks
  derived wajib disesuaikan dengan pengalaman sebenarnya.

**Temuan saat menguji (penting).** Tes pertama untuk guard di atas **lulus
secara kebetulan**: dengan guard dihapus tes tetap hijau karena teks kosong
memang sudah ditolak `MIN_REPORT_LENGTH` (100). Tes seperti itu tidak menjaga
apa pun. Setelah diperbaiki dengan bahan yang cukup panjang, tes langsung merah
dan **menyingkap cacat desain nyata**: judul panjang tanpa sinyal jenis masih
menghasilkan kalimat "saya mempelajari penerapannya" — persis karangan yang
ingin dihindari. Guard diperketat dari `jenis === 0 && topik === 0` menjadi
`jenis === 0`.

Dikunci 12 tes di `commit-learning.test.ts`. Dibuktikan bisa gagal: menghapus
guard → 1 tes merah → dikembalikan.

### 14.2 Panel admin: ubah peran (Hapus sudah ada sejak awal)

- `checkRoleChange()` + pesan/status di `admin-user-actions.ts` (aturan murni,
  24 tes).
- `PATCH /api/admin/users/:id` di rute yang sama dengan `DELETE`, berbagi
  penjagaan admin + rate limit. Menaikkan `sessionVersion` supaya JWT lama
  tidak terus membawa peran lama.
- Enum `AdminActionType` bertambah `USER_CHANGE_ROLE`, sehingga perubahan peran
  masuk audit log yang sama. Diverifikasi langsung di DB produksi:
  `USER_DELETE, USER_RESET_PASSWORD, USER_TEST_LOGIN, USER_CHANGE_ROLE`.
- Tombol "Jadikan admin" (ikon `ShieldCheck`) di panel admin untuk pengguna
  biasa; akun sendiri dan admin lain tidak ditawari.

**Bug nyata yang tertangkap saat menulis.** Versi pertama `checkRoleChange`
dibangun di atas `checkAdminTarget`, yang menolak **semua** sasaran ber-peran
ADMIN tanpa melihat peran tujuan. Akibatnya promosi USER → ADMIN mustahil dan
fitur jadi tidak berguna. Aturan ditulis ulang agar memutuskan berdasarkan
peran TUJUAN; ada tes regresi khusus.

**Batas yang disengaja:** menurunkan ADMIN → USER belum didukung. Tanpa
jaminan "masih ada admin lain", menurunkan admin terakhir akan mengunci panel
admin tanpa jalan masuk. Server menolak terang-terangan (403) dan UI tidak
menawarkan tombolnya.

Baseline setelah perubahan: typecheck ✅ · lint ✅ · **997 tes lulus** (+23) ·
build ✅ · `prisma db push` ✅ (enum tersinkron).

## 15. Perbaikan setelah meninjau ulang hasil sendiri

Butir-butir di bawah ditemukan dengan membaca ulang diff, **bukan** dari tes
yang merah — semuanya lolos seluruh 997 tes pada saat itu. Dua di antaranya
adalah bug keamanan dan janji yang salah kepada pengguna.

### 15.1 KRITIS — peran sesi adalah potret saat login

Callback `jwt` pada permintaan biasa menyegarkan `sessionVersion`, `deletedAt`,
dan `mustChangePassword` dari DB, tetapi **tidak** `role`. Padahal semua
penjagaan admin (`/admin`, `/api/admin/*`, termasuk `PATCH` ubah peran) membaca
`session.user.role` yang berasal dari `token.role` — nilai saat login. Jadi
peran yang sudah dicabut tetap berlaku sampai token kedaluwarsa.

`sessionVersion++` di route ubah-peran memang mencabut sesi, sehingga celah ini
tidak bisa dieksploitasi lewat jalur tersebut. Tetapi klaim "JWT lama tidak
membawa peran lama" hanya benar karena efek samping itu, bukan karena sesi
menanyakan peran ke sumbernya. Pengguna yang **dinaikkan** juga ikut ter-logout
tanpa penjelasan — sesi tidak perlu dicabut saat promosi.

Perbaikan: `role` ikut `select` di callback `jwt`, keputusan diambil fungsi murni
baru `peranSesiEfektif()` (`session-version.ts`) — DB sebagai penentu, peran tak
dikenal tidak pernah menaikkan siapa pun menjadi ADMIN, dan tanpa peran yang
bisa dipakai hasilnya `USER` (menutup, bukan membuka).

**Tes lama tidak menjaga ini sama sekali.** Dengan perbaikan dimatikan lagi,
**997 tes tetap hijau**. Tes baru (6 kasus) ditulis lebih dulu, lalu dibuktikan
bisa gagal dengan merusak `peranSesiEfektif` → 1 merah → dikembalikan.

### 15.2 Kolom pembelajaran masih mengklaim isi kepala pengguna

Guard `jenis.length === 0` sudah benar, tetapi kalimat topiknya berbunyi
*"…, saya mempelajari penerapannya secara langsung, bukan hanya dari teori."*
Kalimat itu muncul untuk **setiap** commit yang punya topik dan tidak diturunkan
dari bukti apa pun — persis karangan yang jadi alasan modul ini ada. Ia lolos
karena semua tes memeriksa ada/tidaknya keluaran, bukan isinya.

Sekarang kalimat topik hanya melaporkan pekerjaan ("Pekerjaan hari ini mencakup
…"); klaim "mempelajari / saya belajar" hanya boleh datang dari
`PELAJARAN_PER_JENIS` yang punya dasar jenis perubahan. Dua tes baru mengunci
ini, dibuktikan bisa gagal: klaim lama dipulihkan → 2 merah → dikembalikan.

### 15.3 Saringan tanggal gagal secara senyap

`runDispatch` memakai `plainDateToUtcDate(date) ?? undefined`. Bila tanggal tak
terbaca, `where` menjadi `undefined` → Prisma mengabaikan saringan → query
kembali memuat **seluruh riwayat** template bertanggal semua pengguna, yaitu
persis pemborosan yang ingin dicegah, tanpa tanda apa pun. Sekarang gagal keras
dengan pesan jelas.

### 15.4 Kode mati di panel admin

`jalankanPeran()` menghitung `peranBaru = isAdmin ? "USER" : "ADMIN"` padahal
tombolnya tidak pernah aktif untuk sasaran admin (dan server menolak penurunan
peran). Cabang "turunkan ke USER" — termasuk pesan toast-nya — tidak akan pernah
tercapai. Diganti peran tujuan tetap `"ADMIN"` dengan komentar alasannya.

Baseline akhir: typecheck ✅ · lint ✅ · **1005 tes lulus** (+31) · build ✅.

---

## 16. Dua cacat yang membuat commit nyata tidak terpakai (2026-11)

Ditemukan saat menguji dengan repo sungguhan (`it-sigap/after-sales/laporan-bulanan`,
branch `dev-zar`). Keduanya lolos dari tes karena tes memakai data palsu yang
selalu "rapi".

### 16.1 KRITIS — branch tersimpan tetapi tidak pernah dipakai

`resolveCommits` membaca `row.branch` dari DB, tetapi `fetchCommits` tidak
menerimanya sama sekali. Akibatnya API selalu memakai **default branch repo**,
sehingga halaman `/repos` menampilkan branch `dev-zar` sementara commit yang
ditarik berasal dari branch lain. Gejalanya menyesatkan: "Tidak ada commit pada
hari itu", padahal commitnya ada.

Perbaikan:

- `FetchCommitsOptions` menerima `branch?`. Dipetakan ke nama parameter yang
  benar per penyedia: **`ref_name`** (GitLab) dan **`sha`** (GitHub). Dihilangkan
  sepenuhnya bila kosong, supaya default branch penyedia yang berlaku.
- **Kosong = default branch penyedia.** Tidak ada tebakan `main` di mana pun:
  skema, validasi, maupun form. Repo GitLab baru sering memakai `master`.
- Branch masuk query string, jadi diperlakukan sebagai input tidak tepercaya:
  `normalizeBranch` menolak selain `[A-Za-z0-9._/-]`, panjang >200, `..`, `//`,
  dan awalan `-`; melanggar → `GitApiError("INVALID_REPO")` **sebelum** jaringan.
- `branch` di skema kini `@default("")`, bukan `"main"`.

Dikunci 17 tes baru (`git-provider.test.ts`, `validate-git-repo.test.ts`,
`git-repo-service.test.ts`). Dibuktikan bisa gagal: mengembalikan kode lama →
2 tes merah.

### 16.2 Prefix `[FIX]:` tidak dikenali → jenis pekerjaan salah

`cleanCommitTitle` hanya membuang prefix Conventional Commits (`fix:`,
`feat(api):`), bukan gaya kurung siku. Judul nyata
`[FIX]: delete External ID and refactor documentation` tetap utuh, lalu
`detectChangeKind` jatuh ke pencocokan kata dan menemukan "refactor" lebih dulu
→ dikira **REFACTOR**. Kolom Pembelajaran pun berbunyi tentang *penataan ulang
kode*, padahal commitnya **perbaikan**.

Perbaikan:

- `cleanCommitTitle` membuang tiga gaya: `type(scope)!:`, `[TAG]:`, dan
  `[TAG] -`. Prefix berulang (`[FIX]: feat: subject`) dibuang bertahap.
- `detectChangeKind` mengenali `[TAG]` sebagai prefix, bukan hanya `type:`.
- **Dua batas yang disengaja**, keduanya dikunci tes:
  - Tag dibatasi 1–16 huruf/angka, agar kurung siku yang memang bagian judul
    (`[catatan panjang sekali]`) tidak terpotong.
  - Judul yang **seluruhnya** prefix (`[FIX]:`) dikembalikan utuh, bukan menjadi
    `":"`. Versi pertama regex menyisakan `":"`, sisa yang lolos
    `isGenericCommitTitle` dan bisa masuk laporan. Tes menangkapnya.

### 16.3 Dugaan yang TERBUKTI SALAH — filter tanggal

Catatan awal menduga GitLab memfilter `since`/`until` berdasarkan `authored_date`
sehingga commit hasil rebase terlewat, sementara GitHub memakai `committer_date`.
**Dugaan ini keliru dan tidak ada kode yang diubah karenanya.**

Bukti dari repo nyata (16 dari 100 commit punya tanggal author ≠ tanggal commit).
Tiga commit diuji pada rentang tanggal author dan tanggal commit-nya:

| Commit | authored | committed | Filter tgl author | Filter tgl commit |
| :--- | :--- | :--- | :--- | :--- |
| `0bfc93d5` | 3 Nov | 5 Nov | tidak ikut | **ikut** |
| `9cc8f68e` | 2 Nov | 5 Nov | tidak ikut | **ikut** |
| `d14ef0c9` | 28 Okt | 2 Nov | tidak ikut | **ikut** |

Ketiganya konsisten: GitLab memakai **tanggal commit**, sama seperti GitHub.
Konfirmasi tambahan: menyaring 2 Nov ikut memunculkan `12f18a20` yang tanggal
author-nya 30 Okt.

Karena `committedAt` yang ditampilkan juga diambil dari `committed_date`
(GitLab) / `committer.date` (GitHub), **tanggal yang ditarik dan yang ditampilkan
selalu sama** — tidak ada ketidakcocokan yang perlu ditutup.

**Konsekuensi yang perlu diketahui pengguna** (bukan bug): commit yang di-rebase
akan muncul pada tanggal commit, bukan tanggal pengerjaan. Contoh `d14ef0c9`
dikerjakan 28 Okt tetapi tercatat 2 Nov. Mengikuti tanggal pengerjaan adalah
keputusan produk berbeda — belum diminta, jadi belum diubah.

Baseline akhir: typecheck OK · lint OK · **1064 tes lulus**.
