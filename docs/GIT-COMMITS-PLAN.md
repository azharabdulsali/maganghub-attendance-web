# Rencana: Auto Laporan dari Commit Git

> Status: **draf rencana, disetujui pemilik untuk ditulis sebagai acuan resmi.**
> Belum ada kode fitur yang ditulis. Dokumen ini yang jadi pegangan saat
> implementasi. Bila ada penyimpangan saat menulis kode, dokumen ini yang
> diperbarui lebih dulu, bukan dibiarkan diam-diam (AGENTS.md §2).

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
  branch   String      @default("main")

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
  sebagai `DraftInput.keywords` oleh pemanggil (`/api/repos/preview`), lalu
  draf disusun lewat `getDrafter()`. Dengan begitu penyusun lokal dan LLM tidak
  perlu tahu apa pun tentang git, dan kontrak `ReportDrafter` tetap utuh.
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

**Belum dikerjakan:** butir 3 (toggle di `/automation`). Menghubungkan repo di
`/repos` sudah menjadi opt-in yang efektif karena tanpa baris `GitRepoConfig`
tidak ada data yang diambil sama sekali, tetapi sakelar terpisah di
`/automation` tetap perlu agar sejalan dengan bunyi SPEC.md §5.4a.

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

- [ ] `SPEC.md` dan `AGENTS.md` sudah diperbarui (pencabutan resmi tertulis)
- [ ] `npm run db:push` dijalankan pemilik
- [ ] `npm run lint` bersih
- [ ] `npm run typecheck` bersih
- [ ] `npm test` hijau, termasuk tes baru
- [ ] `npm run build` sukses
- [ ] Dibuktikan bahwa tes baru **bisa gagal** (sengaja rusakkan kode -> merah
      -> kembalikan). Lihat AGENTS.md §7.
- [ ] Token tidak muncul di satu pun respons API (diperiksa manual)
- [ ] `/privacy` menyebut pengiriman commit ke Gemini
- [ ] Tidak ada `.env` atau rahasia yang ikut ter-commit
- [ ] Pemilik meninjau `git diff` lalu commit sendiri (agent tidak commit)
