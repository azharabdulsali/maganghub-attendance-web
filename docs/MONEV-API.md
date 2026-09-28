# MONEV-API.md — Kontrak API Portal Monev MagangHub Kemnaker

> **Status dokumen: RISET — belum diverifikasi menyeluruh.**
> Terakhir diperbarui: 2026-09-28.
>
> Dokumen ini mencatat kontrak HTTP portal Monev, hasil pengamatan dari
> DevTools pemilik akun. Tujuannya supaya `src/lib/monev-client.ts` punya
> satu acuan tunggal, bukan tebakan.
>
> **Dokumen ini TIDAK memuat satu pun nilai rahasia.** Semua token, cookie,
> dan kode di bawah disensor dengan `<...>`. Jangan pernah menempelkan nilai
> asli ke file ini atau ke commit.

---

## 0. Peringatan keamanan

Hal-hal berikut **tidak boleh** masuk ke repo, log, atau pesan:

| Nama | Kenapa berbahaya |
| :--- | :--- |
| `monev_refresh_token` | JWT masa berlaku **30 hari**; cukup untuk masuk tanpa password |
| `cf_clearance` | Token lolos Cloudflare; terikat IP + User-Agent |
| `code=` pada callback | Authorization code SSO, sekali pakai |
| `state=` / `monev_oauth_state` | CSRF state OAuth |
| `acw_tc` | Token WAF Alibaba |
| password Monev | Kredensial asli |

Bila salah satu di atas pernah tercatat di tempat yang bisa dibaca orang lain:
**logout dari portal** (mencabut refresh token di server), lalu login ulang
dari browser bersih.

---

## 1. Dua host berbeda

| Host | Peran |
| :--- | :--- |
| `monev.maganghub.kemnaker.go.id` | Frontend (Nuxt). Sumber `Origin`, menyajikan `version.json`. |
| `monev-api.maganghub.kemnaker.go.id` | Backend REST API. Semua endpoint di bawah `/api/v1/...`. |
| `account.kemnaker.go.id` | SSO Kemnaker. Halaman login sesungguhnya (di luar jangkauan kita). |

Semua panggilan API dikirim **cross-origin** dari frontend, dengan
`Origin: https://monev.maganghub.kemnaker.go.id`.

---

## 2. Header yang wajib disertakan

Setiap request ke `monev-api` membawa header berikut:

| Header | Contoh / catatan |
| :--- | :--- |
| `Origin` | `https://monev.maganghub.kemnaker.go.id` (**wajib**, jika tidak → CORS gagal) |
| `User-Agent` | `Mozilla/5.0 (Linux; Android 15; Pixel 9) ... Chrome/154.0.0.0 Mobile Safari/537.36` |
| `x-frontend-build-id` | `<build-id>-production` — lihat §3 |
| `cookie` | Berisi `acw_tc`, `cf_clearance`, dan cookie sesi — lihat §5 |
| `accept` | `*/*` |
| `sec-fetch-site` | `same-site` (callback/login) atau `same-origin` (versi frontend) |

### ⚠️ `User-Agent` terikat dengan `cf_clearance`

`cf_clearance` dibuat Cloudflare dengan sidik jari **IP + User-Agent**.
Mengubah salah satunya membuat token **tidak valid**. Jangan pernah
mengganti UA tanpa memperbarui `cf_clearance`.

---

## 3. `x-frontend-build-id` — ✅ TERJAWAB

Diambil dari endpoint publik:

```
GET https://monev.maganghub.kemnaker.go.id/version.json?t=<epoch-ms>
→ 200 {"build_id":"<hash-40-karakter>-production"}
```

Nilai `build_id` = persis nilai header `x-frontend-build-id`.
Endpoint ini **tidak butuh cookie maupun `cf_clearance`** (hanya men-set
`acw_tc`). **Kesimpulan:** klien harus mengambil build-id **secara dinamis**
saat start — nilainya akan berubah tiap deploy frontend.

**Sisa pertanyaan:** apakah header wajib? Belum diuji tanpa header, tapi
karena nilainya murah didapat, cukup selalu dikirim.

---


## 4. Alur login (OAuth 2.0 Authorization Code)

Tiga request yang teramati, berurutan:

### 4.1 `POST /api/v1/auth/refresh`

```
POST https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/refresh
content-length: 0
cookie: acw_tc=...; monev_refresh_token=<JWT>
x-frontend-build-id: <build-id>-production
```

Menukar cookie `monev_refresh_token` menjadi sesi yang valid.

**✅ Terverifikasi tanpa cookie (§7):**

```
401 Unauthorized
content-type: application/json
set-cookie: monev_refresh_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax

{"code":401,"error_code":"AUTHORIZATION_ERROR","status":"error",
 "message":"Sesi masuk tidak tersedia atau tidak valid. Silakan masuk kembali."}
```

Poin penting:
- **`401` JSON biasa → Cloudflare TIDAK memblokir API.** Ini membatalkan
  kekhawatiran §5/§7.
- Saat gagal, server **menghapus** cookie `monev_refresh_token` (auto-logout).
- Bentuk pesan error `401` di atas adalah **penanda sesi mati** yang bisa
  diandalkan (menjawab §6).

**Masih belum direkam:** respons **sukses** (`200`) — apakah ada body JSON?
Apakah men-set cookie access token baru?

### 4.2 `GET /api/v1/auth/login`

```
GET https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/login
```

**✅ Terverifikasi — `201 Created`, `content-type: text/plain`,** dan
**body-nya adalah URL SSO polos** (bukan redirect `302`):

```
https://account.kemnaker.go.id/auth
  ?client_id=79230891-cc02-43c8-964c-b525bce27857
  &redirect_uri=https%3A%2F%2Fmonev.maganghub.kemnaker.go.id%2Fsso%2Fcallback
  &response_type=code
  &scope=basic+email
  &state=<state>
```

Server juga men-set:

```
set-cookie: monev_oauth_state=<state>; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax
```

Catatan: `<state>` di body URL **harus sama** dengan `monev_oauth_state` cookie.
Parameter OAuth yang terkonfirmasi: `client_id`, `redirect_uri`
(`.../sso/callback`), `response_type=code`, `scope=basic email`.
`client_id` bersifat publik (terlihat di URL SSO).


**Belum diketahui:** apakah endpoint ini mengembalikan **redirect 302**
(beserta `Location:` ke SSO), atau **JSON** berisi URL SSO? Perlu direkam.

### 4.3 `GET /api/v1/auth/login/callback?code=<code>&state=<state>`

```
GET https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/login/callback?code=<code>&state=<state>
cookie: acw_tc=...; monev_oauth_state=<state-sama>; cf_clearance=...
```

**Status sukses: `201 Created`** (bukan 200 — penting untuk pengecekan).

Header respons yang relevan:

```
set-cookie: monev_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax
set-cookie: monev_refresh_token=<JWT>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax
content-type: application/json; charset=utf-8
access-control-expose-headers: Content-Disposition,X-Request-Id,X-Trace-Id,X-Authentication-Required
```

Arti:
- `monev_oauth_state` dihapus (`Max-Age=0`) — state OAuth sudah terpakai.
- `monev_refresh_token` diberikan (`Max-Age=2592000` = 30 hari, HttpOnly).
  **Inilah "hasil login"** — sesi disimpan sebagai cookie refresh token,
  bukan sebagai password.
- `content-length: 1154` → ada body JSON (~1 KB), **isinya belum direkam**.

> **Temuan penting:** karena `monev_refresh_token` adalah `HttpOnly`, JavaScript
> tidak bisa membacanya. Cookie diatur oleh browser dan dikirim otomatis pada
> request berikutnya via `credentials: "include"`.

---

## 5. Cookie sesi

| Cookie | Sumber | Sifat | Peran |
| :--- | :--- | :--- | :--- |
| `acw_tc` | WAF Alibaba | bebas dibaca | penanda WAF, biasanya dikelola otomatis |
| `cf_clearance` | Cloudflare | bebas dibaca | lolos challenge halaman; **tidak perlu untuk API** |
| `monev_oauth_state` | monev-api | HttpOnly | CSRF state OAuth, sementara (Max-Age 600) |
| `monev_refresh_token` | monev-api | **HttpOnly, Secure** | **sesi utama, 30 hari** |

### ✅ `cf_clearance` ternyata TIDAK diperlukan untuk API

Awalnya diduga penghambat utama. **Eksperimen §7 membuktikan sebaliknya:**
`monev-api` mengembalikan JSON normal tanpa cookie apa pun. Cookie ini
hanya relevan untuk halaman frontend. **Untuk seluruh alur API, cookie ini
tidak perlu dikirim** — sehingga tidak lagi menjadi kendala arsitektur.


---

## 6. Cek status sesi — ✅ PRAKTIS TERJAWAB

Tidak perlu endpoint `/auth/me` terpisah. Cara termurah & terverifikasi
mendeteksi sesi mati adalah **memanggil `/auth/refresh`**:

| Kondisi | Respons |
| :--- | :--- |
| Sesi **valid** | `200` (bentuk body belum direkam, lihat §4.1) |
| Sesi **mati/absen** | `401` + `error_code: "AUTHORIZATION_ERROR"` |

Karena `/auth/refresh` juga **menghapus** `monev_refresh_token` saat gagal,
memanggilnya sekaligus "membersihkan" cookie yang sudah tidak berguna.
**Inilah dasar fitur Tes Koneksi:** validasi refresh token → `200` = valid.


---

## 7. `cf_clearance` — ✅ TERBUKTI TIDAK MENGHALANGI API

**Hasil eksperimen (2026-09-28):** `POST /api/v1/auth/refresh` dikirim dari
**Node.js polos, tanpa satu pun cookie, tanpa `cf_clearance`**, dengan
`User-Agent` dasar → respons **`401` JSON biasa** (§4.1), **bukan** `403`
HTML challenge Cloudflare. `version.json` juga `200` tanpa cookie.

**Kesimpulan: Cloudflare hanya melindungi halaman frontend, bukan
`monev-api`.** Maka:

- ❌ Opsi A (Chromium headless) **tidak diperlukan**.
- ❌ Kekhawatiran "IP statis" **tidak berlaku**.
- ❌ `cf_clearance` **tidak perlu** untuk seluruh alur API.
- ✅ `SPEC.md` §6 "Direct REST API tanpa browser" **AMAN** dan bisa
  dijalankan dari server mana pun (termasuk serverless/Vercel).

### Yang masih tersisa: langkah SSO

Satu-satunya bagian yang butuh browser adalah **halaman SSO**
`account.kemnaker.go.id/auth` (tempat mengetik password). Itu **di luar
`monev-api`** dan kita **belum tahu** bentuk POST-nya.

### Opsi untuk mendapatkan sesi valid (pilih satu)

| Opsi | Cara | Catatan |
| :--- | :--- | :--- |
| **C1 — Tempel refresh token** | Pengguna login di browser sendiri, ambil `monev_refresh_token` (via DevTools), tempel ke dashboard (terenkripsi) | **Paling sederhana, aman, tidak butuh browser di server.** ⚠️ HttpOnly → harus disalin manual dari DevTools. |
| **A1 — Chromium headless untuk SSO** | Playwright hanya untuk langkah SSO, sisanya REST | Otomatis penuh, tapi bertentangan dengan semangat §6 dan butuh Chromium di server. |
| **B1 — Login di browser pengguna** | Klien melakukan login, cookie diteruskan | Sulit: cookie HttpOnly. |

**Catatan soal `fingerprint`:** JWT refresh token memuat klaim
`fingerprint` (hash). **Belum diketahui** apakah server memvalidasi
fingerprint terhadap IP/UA pemakai. Bila ya, refresh token dari satu
perangkat mungkin **ditolak** dari server lain — perlu diuji.

**Rekomendasi:** mulai dari **C1** (paling rendah risiko, tidak menyentuh
batas etika §9), sambil menguji apakah `fingerprint` menghalangi pemakaian
lintas-IP.

> **Status implementasi (diperbarui):** **Opsi C1 SUDAH DIIMPLEMENTASI.**
> Lihat `src/lib/monev-client.ts` (fungsi `fetchBuildId` + `verifySession`)
> dan endpoint `src/app/api/credentials/verify/route.ts`. Token disimpan
> terenkripsi AES-256-GCM di kolom terpisah (`tokenCiphertext`) pada
> `maganghub_credentials`, berdampingan dengan password asli yang tidak
> tersentuh. UI: kartu "Tes Koneksi" di
> `src/app/dashboard/credentials/page.tsx`.
>
> **Yang belum diuji terhadap portal sungguhan:** apakah klaim `fingerprint`
> di JWT refresh token divalidasi lintas-IP (butuh token asli dari pengguna).
> Bila hasilnya `401` padahal token baru, itu jawabannya; bila `200`, C1 aman
> lintas perangkat.


**Rekomendasi:** lihat hasil eksperimen di atas — masalah ini **sudah
terselesaikan**; lanjut ke §5 untuk detail cookie.

---



---

## 8. Endpoint submit laporan — BELUM DIKETAHUI

Diperlukan untuk fase berikutnya (bukan bagian dari tes koneksi).

**Perlu direkam dari browser (satu kali tekan `Simpan dan Kirim`):**
- Method + URL
- Nama field body (tiga kolom: Uraian Aktivitas, Pembelajaran, Kendala)
- Bentuk body: JSON atau form-encoded?

**Perilaku yang diharapkan (dari `SPEC.md` §2):**
- Sukses → status tertentu (200/201?)
- "Laporan sudah ada" → kemungkinan `409 Conflict`
- Belum pernah diverifikasi langsung.

---

## 9. Batas etika (dari `SPEC.md` §10)

- **Jangan** mengakali CAPTCHA, menembus OTP/MFA, memalsukan User-Agent
  (selain UA resmi pengguna), atau memakai proxy untuk melewati `403`.
- Bila muncul challenge → artinya **butuh intervensi manusia**, bukan diakali.
- Klien ini **hanya** melakukan login + submit laporan. Tidak ada aksi lain.
- **Tidak boleh mengirim apa pun** selama fase uji koneksi.

Catatan penting: karena **API tidak diblokir Cloudflare** (§7), tidak ada
kebutuhan sama sekali untuk "mengakali" apa pun. Batas etika ini otomatis
terpenuhi.

---

## 10. Ringkasan: yang sudah pasti vs belum

| ✅ Sudah pasti (terverifikasi) | ❓ Belum diketahui |
| :--- | :--- |
| Host API: `monev-api.maganghub.kemnaker.go.id` | Isi body sukses `/auth/refresh` (200) |
| **API TIDAK diblokir Cloudflare** — `401` JSON polos | Apakah klaim `fingerprint` divalidasi lintas-IP |
| `version.json` → `{"build_id":"...-production"}` | Bentuk POST halaman SSO `account.kemnaker.go.id` |
| `GET /auth/login` → `201`, body = **URL SSO polos** | Endpoint submit + nama field body |
| OAuth: `client_id`, `redirect_uri`, `scope=basic email` | Isi body callback (1 KB JSON) |
| Cookie: `monev_refresh_token` (HttpOnly, 30 hari) | Apakah `x-frontend-build-id` wajib |
| `/auth/refresh` gagal → **`401 AUTHORIZATION_ERROR`** | |
| `/auth/login/callback` sukses → **`201 Created`** | |
| Origin wajib: `https://monev.maganghub.kemnaker.go.id` | |

---

## 11. Langkah selanjutnya

1. ✅ **Uji pemblokiran Cloudflare** — SELESAI, hasil: **tidak diblokir** (§7).
2. **Rekam respons sukses `/auth/refresh`** (`200`) — untuk tahu bentuk sesi.
3. **Rekam satu kali submit laporan** (`Simpan dan Kirim`) — untuk §8.
4. **Uji `fingerprint`:** pakai refresh token dari perangkat A di perangkat B
   (IP berbeda) — apakah diterima?
5. ✅ **Tulis `src/lib/monev-client.ts` + endpoint Tes Koneksi
   (`POST /api/credentials/verify`), memakai Opsi C1** — SELESAI. Tinggal diuji
   dengan token asli oleh pemilik akun (tidak boleh diuji otomatis di sini).

---

## 12. Silang dari proyek Python lama (`maganghub-autoabsen`)

Bagian ini bukan hasil reverse-engineering kita, melainkan **pengetahuan
yang sudah terverifikasi live** oleh bot Python lama. Sumbernya:
`../maganghub-autoabsen/docs/SELECTORS.md` (+ `src/maganghub.py`,
`src/policy.py`). Kita **membaca**, tidak menyentuh proyek itu (§2 SPEC).

### 12.1 Portal = Nuxt.js (Vue 3) + Vuetify

Dikonfirmasi dari `#__nuxt`, atribut `data-v-*`, dan class `v-*`. Ini
menjelaskan beberapa hal yang kita lihat di API:

- Render sisi server (SSR) → ada `version.json` / `x-frontend-build-id`.
- ID elemen seperti `input-v-7`, `checkbox-v-15` **auto-generated dan tidak
  stabil** — jangan pernah dijadikan selector.
- Tombol/field dikenali lewat **label / role / text**, bukan ID.

### 12.2 Halaman & alur yang dipakai bot lama

| Hal | Nilai terverifikasi |
| :--- | :--- |
| Halaman riwayat | `https://monev.maganghub.kemnaker.go.id/dashboard/riwayat` |
| Halaman login SSO | `account.kemnaker.go.id` → `input#username`, `input#password`, tombol "Masuk" |
| **CAPTCHA** | **Tidak ditemukan** (terverifikasi) |
| Form hari ini | klik `td.today-highlight button.calendar-day-button` |
| Tombol submit | role `button`, name **`Simpan dan Kirim`** |
| Field teks | label: `Uraian aktivitas`, `Pembelajaran yang diperoleh`, `Kendala yang dialami` |
| Checkbox | label pernyataan "Saya menyatakan telah meninjau…" |
| Dropdown Kehadiran | `<select>` native **tersembunyi**; nilainya di-set via JS (`value='1'` = Hadir) |

### 12.3 ⚠️ Enum status — dan jebakan `.status-dot`

Status laporan hanya boleh dibaca dari **`aria-label`** kalender hari ini
(format `"{Hari}, {Tanggal}, {Status}"`):

| Teks status | Arti |
| :--- | :--- |
| `Belum Diisi` | belum ada laporan |
| `Menunggu Persetujuan` | terkirim, belum disetujui ✅ bukti sukses |
| `Disetujui` | disetujui mentor ✅ bukti sukses |
| `Disubmit` / `Sudah Diisi` | varian lain yang ikut diterima |

**JEBAKAN (mahal, sudah dibayar):** elemen `<i class="status-dot">` **muncul
juga pada hari kosong** (`status-dot--ring`). Menjadikannya penanda "sudah
absen" → **selalu sukses palsu**. Ini pernah menjadi bug di bot lama.
**Aturan: hanya teks `aria-label` yang sah sebagai bukti; dot tidak boleh.**

### 12.4 Kelas `<td>` kalender

| Class | Arti |
| :--- | :--- |
| `clickable-day` | hari kerja, bisa diklik |
| `today-highlight` | hari ini |
| `greyout-clickable-day` | hari lewat, masih bisa diklik |
| `holiday-detail-day api-holiday` | hari libur |

### 12.5 Yang TIDAK diberikan repo Python

**Endpoint REST submit laporan tetap belum diketahui.** Bot lama **mengklik
DOM lewat Playwright**; sepanjang kode tidak ada satu pun pemanggilan HTTP
submit. Jadi §8 tetap terbuka. Satu-satunya cara mengisinya: **rekam satu
kali `POST` saat menekan `Simpan dan Kirim` dari DevTools.**

### 12.6 Peringatan lintas-sistem (dari `AGENTS.md` repo Python)

> Jangan pernah mengirim untuk hari yang sama dari kedua sistem. Portal
> menolak yang kedua dengan **`409 Presensi sudah ada`**.

Karena bot Python lama **tetap berjalan di produksi**, fitur submit web
**wajib** memeriksa status hari ini lebih dulu dan berhenti bila sudah ada.
Ini melengkapi kesimpulan §8 kita: `409` adalah bentuk duplikatnya.

---

## 12.7 Bukti dari log produksi (`data/app.log`)

Bukan teori — ini jejak **run nyata** bot lama yang berhasil submit.
Ini menutup beberapa pertanyaan yang tersisa dan memunculkan peringatan baru.

### 12.7.1 Submit itu XHR cepat, bukan navigasi halaman

Satu run sukses utuh (2026-09-22) tercatat:

| Langkah | Waktu | Selisih |
| :--- | :--- | :--- |
| Buka portal | `08:08:22.857` | — |
| Baca status (`Belum Diisi`) | `08:08:25.115` | +2,3 s |
| Isi form + cek tombol aktif | `08:08:25.617` | +0,5 s |
| **Submit terkirim** | `08:08:25.673` | **+56 ms** |

**Total dari buka halaman ke sukses ≈ 2,8 detik.** Submit sendiri **56 ms** —
terlalu cepat untuk navigasi halaman. **Ini membuktikan endpoint submit
adalah panggilan XHR/REST**, konsisten dengan keputusan §6 (Direct REST API).
Endpoint itu ada; kita hanya belum tahu nama & bentuk body-nya (§8).

### 12.7.2 ⚠️ Laporan kehadiran ("Hadir") WAJIB ikut dikirim

Bot lama **tidak** mengandalkan `<select>` native (element-nya tersembunyi —
`select_option` timeout 30 s pada 2026-09-07). Ia memaksa nilai lewat JS:
`el.value = '1'` (Hadir) + dispatch `input`/`change`.

**Implikasi untuk web:** saat merekam `POST` submit dari DevTools, pastikan
**field kehadiran ikut ada di body**. Bila kita lupa mengirimnya, laporan
bisa tercatat sebagai **"Tidak Hadir"** — kesalahan yang tidak bisa dianggap
remeh. Ini belum pernah dibahas sebelum temuan log ini.

### 12.7.3 ⚠️ Ambil status untuk TANGGAL YANG DIMINTA, bukan "hari ini"

Log mengungkap **bug laten** di bot lama:

```
[run dengan tanggal argumen 2027-02-09, portal menunjukkan 22 Sep]
Today's aria-label: 'Selasa, 22 September 2026, Menunggu Persetujuan'
Report already exists. No action taken.
Recorded verified submission for 2027-02-09   <-- SALAH
```

`_detect_attendance_status` selalu membaca **kalender hari ini**
(`td.today-highlight`), bukan tanggal yang diminta. Bot lama tidak celaka
karena hanya jalan untuk tanggal hari ini. **Web multi-user bisa submit
tanggal mundur — jadi wajib memverifikasi tanggal yang benar-benar diminta.**

Aturan untuk web: verifikasi harus **cocokkan tanggal target**, jangan
sekadar "ada laporan".

### 12.7.4 Bukti empiris: `.status-dot` memang menyesatkan

Dua peringatan nyata di log, membenarkan §12.3 dengan bukti, bukan dugaan:

```
2026-09-07 | WARNING | Found status dot but aria-label doesn't match known statuses.
2026-09-21 | WARNING | Ambiguous status. dot=True label='...Belum Diisi'
```

**Kesimpulan tegas: `aria-label` satu-satunya sumber status. Jangan pakai dot.**

### 12.7.5 Sesi bisa kedaluwarsa — siapkan alur re-auth

```
2026-09-21 | ERROR | Not logged in. Chrome session expired; manual login required.
```

Sesi hilang meski pakai profil persisten. Artinya **`monev_refresh_token`
30 hari pun akan mati** — web harus punya jalur "hubungkan ulang akun", bukan
sekadar gagal dengan error mentah.

### 12.7.6 `PROGRAM_ENDED` terbukti berjalan

```
2027-02-10 → PROGRAM_ENDED | ... past the end of the program; nothing to do.
```

Keluar **tanpa membuka browser**. Pengaman `LAST_ACTIVE_DATE` (SPEC §11B)
terbukti bekerja; web wajib menegakkan hal yang sama di sisi server.



