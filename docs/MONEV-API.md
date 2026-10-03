# MONEV-API.md: Kontrak API Portal Monev MagangHub Kemnaker

> **Status dokumen: RISET, belum diverifikasi menyeluruh.**
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
| `authorization` | `Bearer <access token>` (**wajib untuk endpoint data**: submit, daily-logs, attendances, lihat §8) |
| `User-Agent` | `Mozilla/5.0 (Linux; Android 15; Pixel 9) ... Chrome/154.0.0.0 Mobile Safari/537.36` |
| `x-frontend-build-id` | `<build-id>-production`, lihat §3 |
| `cookie` | Berisi `acw_tc`, `cf_clearance`, dan cookie sesi, lihat §5 |
| `accept` | `*/*` |
| `sec-fetch-site` | `same-site` (callback/login) atau `same-origin` (versi frontend) |

### ⚠️ `User-Agent` terikat dengan `cf_clearance`

`cf_clearance` dibuat Cloudflare dengan sidik jari **IP + User-Agent**.
Mengubah salah satunya membuat token **tidak valid**. Jangan pernah
mengganti UA tanpa memperbarui `cf_clearance`.

---

## 3. `x-frontend-build-id`, ✅ TERJAWAB

Diambil dari endpoint publik:

```
GET https://monev.maganghub.kemnaker.go.id/version.json?t=<epoch-ms>
→ 200 {"build_id":"<hash-40-karakter>-production"}
```

Nilai `build_id` = persis nilai header `x-frontend-build-id`.
Endpoint ini **tidak butuh cookie maupun `cf_clearance`** (hanya men-set
`acw_tc`). **Kesimpulan:** klien harus mengambil build-id **secara dinamis**
saat start, nilainya akan berubah tiap deploy frontend.

**Sisa pertanyaan:** apakah header wajib? Belum diuji tanpa header, tapi
karena nilainya murah didapat, cukup selalu dikirim.

---


## 4. Alur login (OAuth 2.0 Authorization Code)

> **✅ ALUR LENGKAP TERJAWAB (2026-09-28).** Sebelumnya kita hanya tahu
> potongan-potongannya. Rekaman terakhir menyatukan semuanya, lihat §4.0.
> Ringkasnya: `code` dari SSO ditukar ke sesi lewat **`POST /api/v1/auth/login`
> dengan body JSON `{code, state}`**. Yang **masih belum terekam**: **respons**
> dari langkah-langkah ini (khususnya apakah ada access token terpisah, §4.4).

### 4.0 Alur penuh (end-to-end), ✅ LENGKAP & TERVERIFIKASI

```
(0) Klik "Masuk"

(1) GET  https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/login
        → set-cookie: monev_oauth_state=<STATE>   (state anti-CSRF)
        → BODY = URL authorize SSO (bukan 302!)

(2) GET  https://account.kemnaker.go.id/auth?client_id=...&state=<STATE>&...
        (halaman login SSO, di sini pengguna mengetik kredensial)

(2a) POST https://account.kemnaker.go.id/auth/login
        content-type: application/json;charset=UTF-8
        x-csrf-token: <TOKEN>   x-requested-with: XMLHttpRequest
        body: {"username":"<USER>","password":"<PASS>"}
        → 200 { data: { authenticated: true, redirect_uri: "http://account.kemnaker.go.id/auth?..." } }

(2b) ikuti `redirect_uri` di atas → halaman SSO meloloskan ke callback dengan
     `?code=<CODE>&state=<STATE>`  (code bernilai panjang, mirip JWT)

(3) GET  https://monev.maganghub.kemnaker.go.id/sso/callback?code=<CODE>&state=<STATE>
        (ini halaman FRONTEND, jembatan, bukan API)

(4) ✅ GET https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/login/callback
        ?code=<CODE>&state=<STATE>
        cookie: monev_oauth_state=<STATE>; ...
        x-frontend-build-id: <build-id>-production
        → 200 { "access_token":"eyJ...", "user_id":"...", "name":"..." }
                ▲ INI SUMBER `Bearer <access token>` (§4.4 TERJAWAB)

(5) Sesi dipakai: GET .../api/v1/users/me/home
        authorization: Bearer <access_token dari langkah (4)>
```

**Endpoint penukaran = `GET /api/v1/auth/login/callback`** (⚠️ **bukan**
`POST /api/v1/auth/login` seperti dugaan awal). `code` & `state` dikirim
sebagai **query string**, bukan body. Method `GET`.

**Respons (1), ✅ TERVERIFIKASI.** Body-nya adalah **URL SSO**:

```
https://account.kemnaker.go.id/auth
  ?client_id=79230891-cc02-43c8-964c-b525bce27857
  &redirect_uri=https%3A%2F%2Fmonev.maganghub.kemnaker.go.id%2Fsso%2Fcallback
  &response_type=code
  &scope=basic+email
  &state=<STATE>
```

Artinya `GET /auth/login` **tidak** melakukan `302` ke SSO; ia **mengembalikan
URL authorize** supaya klien (frontend) yang mengarahkan.

**Respons (4), ✅ TERVERIFIKASI. Inilah kunci `Bearer`:**

```json
{ "access_token": "eyJ0eXAi...", "user_id": "<UUID>", "name": "<NAMA>" }
```

- **`access_token` langsung dipakai sebagai `authorization: Bearer <...>`** di
  endpoint API monev (§8.1, §4.5). **Tidak perlu** memanggil `/auth/refresh`
  untuk mendapatkannya.
- Payload JWT-nya: `ttl: 21600` (6 jam), `client: 79230891-...`,
  `fingerprint: 71c61cbb...`, **identik** dengan Bearer di `/users/me/home`,
  jadi cocok secara kriptografis.
- Bonus: `user_id` & `name` → untuk verifikasi identitas akun.

**Parameter OAuth yang diketahui:**
| Param | Nilai | Catatan |
| :-- | :-- | :-- |
| `client_id` | `79230891-cc02-43c8-964c-b525bce27857` | **Publik**, cocok klaim `client`/`aud` JWT. Aman dicatat. |
| `redirect_uri` | `https://monev.maganghub.kemnaker.go.id/sso/callback` | Halaman frontend (langkah 3). |
| `response_type` | `code` | Alur authorization-code. |
| `scope` | `basic email` | - |
| `state` | disamarkan `<STATE>` | **Berubah tiap login** → jangan dicatat nilainya. |

**Titik penting yang mudah keliru:**
- Ada **tiga** endpoint mirip: `GET /api/v1/auth/login` (mulai, langkah 1),
  `POST /api/v1/auth/login` (§4.2, baca-saja?), dan
  **`GET /api/v1/auth/login/callback`** (tukar code, langkah 4). Jangan tertukar.
- `state` harus **konsisten** antara cookie `monev_oauth_state`, `?state=` di
  callback, dan request langkah (4).
- Langkah (2)/(2a)/(2b)/(3) ada di domain **`account.kemnaker.go.id` /
  frontend**, di luar `monev-api`. Yang benar-benar perlu ditiru klien REST:
  (1) → [SSO] → (3) → (4) → (5).
- **Langkah (2a) memegang password asli.** Lihat §7 untuk aturan keamanannya.

**Implementasi orkestrasi, ✅ TERPASANG, gated.** Keempat langkah yang bisa
dilakukan tanpa browser dirangkai jadi satu di `src/lib/monev-login.ts`:

| Fungsi | Langkah | Gerbang? |
| :-- | :-- | :-- |
| `startOAuthFlow` (`monev-client`) | (1) `GET /auth/login` → `state` + URL SSO | ✅ |
| `primeSsoSession` (`monev-login`) | (2) `GET account.kemnaker.go.id/auth` → `x-csrf-token` + cookie | ✅ |
| `loginToSso` (`kemnaker-sso`) | (3) `POST .../auth/login` → `authenticated` + `redirect_uri` | ✅ |
| `catchOAuthCode` (`kemnaker-sso`) | (3b) **ikuti rantai redirect halaman SSO** → `code` dari `Location` | ✅ |
| `exchangeCodeForSession` (`monev-client`) | (4) `GET /auth/login/callback?code=&state=` → `access_token` | ✅ |
| **`runLoginFlow`** (`monev-login`) | **(1)→(2)→(3)→(3b)→(4) sekaligus** | ✅ |

- `interpretSsoPrimeResponse` (murni) + `summarizeLoginStep` (murni) teruji tanpa
  jaringan; `runLoginFlow` memeriksa gerbang **sekali di muka** sehingga tanpa
  `confirmLivePortalRequest: true` **tidak ada** panggilan jaringan sama sekali
  (ditegakkan tes: `fetch` di-mock dan diperiksa `not.toHaveBeenCalled()`).
- **⚠️ §4.6 mengoreksi asumsi lama:** `redirect_uri` yang dikembalikan
  `POST /auth/login` (langkah 3) **BUKAN** callback Monev. Ia menunjuk
  **halaman SSO** (`account.kemnaker.go.id/auth?...`), `code` **tidak ada** di
  sana. Karena itu langkah **(3b) WAJIB**: ikuti halaman SSO itu sampai `code`
  muncul.
- **🔴 BUG NYATA DITEMUKAN & DIPERBAIKI (langkah 3→3b):** `loginToSso` dahulu
  **membuang `set-cookie`** dari respons `POST /auth/login` yang sukses (hanya
  membaca `redirect_uri`). Akibatnya permintaan otorisasi (`authorizeUrl`) dikirim
  dengan cookie **anonim** (`prime.cookies`) → SSO melihat kita belum login dan
  membalas halaman SPA `3214` byte, **bukan** redirect `code`. Perbaikan:
  `loginToSso` kini mengembalikan `setCookies`, dan `runLoginFlow` menggabungkannya
  (`mergeCookieHeader`) dengan cookie priming sebelum `catchOAuthCode`. Inilah
  kandidat utama penyebab `code` tak pernah terbit, sesi autentikasi tidak pernah
  dibawa ke permintaan otorisasi.
- **✅ (3b) TEREKAM & TERJAWAB (2026-09-28, trial live, DIREVISI FINAL):**
  mengikuti halaman SSO **tidak pernah** menghasilkan `code` lewat HTTP.
  Bukti berlapis dari beberapa jalankan:
  - Rantai `3xx` **selalu berakhir** di `200` pada
    `account.kemnaker.go.id`, **tanpa `code`** di `Location`, `res.url`, maupun
    HTML tiap hop.
  - Baik `authorizeUrl` (langkah 1) **maupun** `redirect_uri` (langkah 3)
    berakhir di **halaman yang identik**: `body 3214 byte (ada-<script src>,
    marker-framework)`. Dua target berbeda → halaman akhir sama persis ⇒ keduanya
    sudah **konvergen**, bukan "salah URL".
  - Halaman `3214`-byte itu **bukan** form login (`ada-form-password` tak ada),
    bukan OTP, bukan `<meta refresh>`, ia **shell SPA**: HTML hanya memuat
    `<script src>` + marker framework; isi sesungguhnya **dirakit JavaScript**.
  - Rantai **tidak pernah menyeberang** ke host callback
    (`monev.maganghub.kemnaker.go.id`), selalu `→account.kemnaker.go.id`.
  - **KESIMPULAN DEFINITIF:** `code` dihasilkan di **lapisan JS SPA**, **bukan**
    lewat redirect/fetch HTTP. Karena itu mengikuti rantai `3xx`, berapa kali
    pun, dengan target apa pun, **mustahil** menghasilkan `code`; ia selalu
    menabrak dinding `200` SPA yang sama. Ini **batas arsitektur**, bukan bug
    yang bisa diperbaiki dengan variasi HTTP.
  - **Konsekuensi:** penangkapan `code` end-to-end **butuh eksekusi JS**
    (mis. headless browser seperti Playwright) **atau** penangkapan manual dari
    browser asli. Automasi murni-HTTP **tidak dapat** menyelesaikan langkah ini.
- **🔧 Perbaikan yang tetap berlaku (tak sia-sia):**
  - `catchOAuthCode` mengikuti rantai redirect (`redirect: "manual"`, maks 8 hop,
    `maxHops` diatur), memeriksa `code` di **setiap** hop (`Location` → `res.url`
    → body HTML), dan resolve `Location` relatif ke absolut.
  - **Cookie jar antar-hop:** `set-cookie` tiap hop diserap & diteruskan ke hop
    berikutnya (perilaku browser asli), hop pertama `authorizeUrl` **terbukti**
    men-set `kemnaker_ri_session`, jadi ini tetap benar meski bukan (lagi) alasan
    kegagalan. (⚠️ Mengoreksi catatan lama yang menyebut cookie "tidak
    diperlukan".)
  - **Diagnostik aman diperkaya:** jejak hop `<status>@<host-asal>→<host-tujuan>`
    plus **petunjuk halaman akhir** `describeHtmlHint` (panjang body + kategori:
    `ada-form-password` / `ada-otp` / `nuansa-dashboard` / `ada-<script src>` /
    `ada-mount-spa` / `marker-framework`), inilah yang **membuktikan** sifat SPA.
    Tetap **tanpa** nilai `code`/token/kredensial.
  - `runLoginFlow` mencoba `authorizeUrl` (langkah 1) **lebih dulu**, lalu
    `redirect_uri` (langkah 3) sebagai cadangan, dan menggabungkan jejak **kedua**
    target di pesan galat.

- **Bila `code` tetap tak ketemu**, pesan `ERROR` memuat diagnostik **aman**
  berupa **jejak hop**: `[jejak hop: <status>@<host> -> <status>@<host>; set-cookie:
  <nama-nama saja>]`, **tanpa** nilai `code`/token. Kirim jejak itu untuk
  memastikan bentuk (3b), bukan menebak.
- **✅ Rute callback (4):** `GET
  /api/v1/auth/login/callback?code=<code>&state=<state>` (bukan `/sso/callback`, `/sso/callback` adalah halaman *frontend* jembatan, tak pernah dimuat karena
  `code` sudah ditangkap di (3b)). `access_token` dibaca dari **body JSON**.


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

**Masih belum direkam:** respons **sukses** (`200`), apakah ada body JSON?
Apakah men-set cookie access token baru?

### 4.4 Dari mana `Bearer <access token>` berasal?, ✅ TERJAWAB

**Jawaban: dari body respons `GET /api/v1/auth/login/callback` (langkah 4 §4.0).**

```json
{ "access_token": "eyJ0eXAi...", "user_id": "<UUID>", "name": "<NAMA>" }
```

`access_token` itu **langsung** dipakai sebagai `authorization: Bearer <...>`.
Jadi dari dua kemungkinan sebelumnya, **kemungkinan #2 yang benar**, tapi
**bukan** lewat `/auth/refresh`; lewat endpoint callback OAuth.

**Bukti kriptografis (dua token identik):**

| Klaim | `access_token` (langkah 4) | Bearer di `/users/me/home` |
| :-- | :-- | :-- |
| `alg` | RS512 | RS512 |
| `client` / `aud` | `79230891-cc02-43c8-964c-b525bce27857` | sama |
| `ttl` | `21600` (6 jam) | `21600` |
| `fingerprint` | `71c61cbb…` (disamarkan) | sama |

Kesamaan `fingerprint` + `client` + `ttl` → **token yang sama**, bukan kebetulan.

**Konsekuensi untuk implementasi:**
- `submitReport(accessToken, ...)` benar: pemanggil menyerahkan `access_token`
  dari langkah 4.
- `/auth/refresh` (§4.1) **bukan** jalur mendapat access token pertama. Ia
  untuk **mewujudkan ulang sesi** dari cookie `monev_refresh_token` (30 hari)
  saat access token (6 jam) sudah kedaluwarsa, perannya menyegarkan, bukan
  menukar pertama kali.
- `exchangeRefreshForAccess()` (§4.4 lama) tetap berguna, tapi **bukan** syarat
  mutlak alur utama; `interpretRefreshResponse()` sudah menangani
  `access_token` di body, yang **cocok** dengan bentuk respons callback ini.


### 4.5 `GET /api/v1/users/me/home`, endpoint data pertama yang terverifikasi

```
GET https://monev-api.maganghub.kemnaker.go.id/api/v1/users/me/home
authorization: Bearer <access token>
origin: https://monev.maganghub.kemnaker.go.id
```

Guna di proyek kita: **uji sesi alternatif**. Bila `/auth/refresh` ambigu,
`/users/me/home` dengan Bearer memberi tahu apakah sesi benar-benar hidup.
(Tetap baca-saja, tidak mengirim laporan.)

### 4.6 Respons `POST account.kemnaker.go.id/auth/login`, ✅ TERVERIFIKASI

Rekaman 2026-09-28 menunjukkan respons login SSO berbentuk **JSON** (bukan
`302`), dengan `authenticated: true` dan **`redirect_uri` baru**:

```json
{
  "data": {
    "authenticated": true,
    "redirect_uri": "http://account.kemnaker.go.id/auth?client_id=<ID>&redirect_uri=<CALLBACK>&response_type=code&scope=basic%20email&state=<STATE>"
  },
  "meta": { "hostname": "...", "client_ip": "<IP-KLIEN>" }
}
```

**Fakta penting:**
- `authenticated: true` = kredensial benar. Alur lanjut dengan **mengikuti
  `redirect_uri`** yang dikembalikan (menuju halaman `/auth`), bukan membaca
  `code` langsung dari respons ini.
- **`state` di sini BERBEDA dari `state` langkah (1).** Kedua rekaman berasal
  dari sesi login berbeda, jadi ini wajar, tapi menegaskan: **`state` tidak
  boleh di-hardcode**; selalu ambil yang terbaru.
- **Skema `http://` (polos!)** meski situs https. Jangan asumsikan https untuk
  URL ini; ikuti apa adanya. (Kemungkinan konfigurasi server / efek proxy.)
- `scope` di sini ter-encode `basic%20email` (langkah 1 pakai `basic+email`),
  server membangun ulang URL-nya sendiri.
- **`meta.client_ip`** → server **mencatat IP klien**. Ini sinyal (bukan bukti)
  bahwa `fingerprint` di JWT mungkin divalidasi terhadap IP/UA (§4.4).

**Yang masih belum terekam:** apakah mengikuti `redirect_uri` itu benar-benar
membawa `code`, dan **respons `POST /api/v1/auth/login {code,state}`** (§4.0
langkah 3) yang menuntaskan penukaran jadi sesi.


### 4.2 `GET /api/v1/auth/login`

```
GET https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/login
```

**✅ Terverifikasi, `201 Created`, `content-type: text/plain`,** dan
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

**Status sukses: `201 Created`** (bukan 200, penting untuk pengecekan).

Header respons yang relevan:

```
set-cookie: monev_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax
set-cookie: monev_refresh_token=<JWT>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax
content-type: application/json; charset=utf-8
access-control-expose-headers: Content-Disposition,X-Request-Id,X-Trace-Id,X-Authentication-Required
```

Arti:
- `monev_oauth_state` dihapus (`Max-Age=0`), state OAuth sudah terpakai.
- `monev_refresh_token` diberikan (`Max-Age=2592000` = 30 hari, HttpOnly).
  **Inilah "hasil login"**, sesi disimpan sebagai cookie refresh token,
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
tidak perlu dikirim**, sehingga tidak lagi menjadi kendala arsitektur.


---

## 6. Cek status sesi, ✅ PRAKTIS TERJAWAB

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

## 7. `cf_clearance`, ✅ TERBUKTI TIDAK MENGHALANGI API

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

### Langkah SSO, ⚠️ SEBAGIAN TERJAWAB (2026-09-28, DIREVISI)

Awalnya dikira "di luar jangkauan kita". Rekaman menunjukkan **SSO ternyata
REST biasa**, `POST` JSON biasa ke `account.kemnaker.go.id`. Bukan form HTML,
bukan CAPTCHA. Artinya **login otomatis penuh mungkin dilakukan tanpa browser**.

```
POST https://account.kemnaker.go.id/auth/login
content-type: application/json;charset=UTF-8
origin:   https://account.kemnaker.go.id
referer:  https://account.kemnaker.go.id/auth/login
x-csrf-token: <token CSRF>     ← ASAL BELUM TEREKAM (lihat catatan)
x-requested-with: XMLHttpRequest
cookie: acw_tc=...; kemnaker_ri_session=...; cf_clearance=...
```

> ⚠️ **KOREKSI, dari mana token CSRF diambil? (masih TERBUKA)**
>
> Versi dokumen sebelumnya menyiratkan `x-csrf-token` didapat dari **respons
> `GET /auth`** (header). **Uji lapangan membuktikan itu SALAH:** header
> respons `GET /auth` **tidak** memuat `x-csrf-token` → alur berhenti di
> langkah (2) dengan pesan "token CSRF tidak ditemukan".
>
> Dugaan paling kuat sekarang: `GET /auth` mengembalikan **HTML**, dan token
> ditanam di **markup** (`<meta name="csrf-token">`, `<input name="_csrf">`,
> atau state JS), persis seperti halaman login pada umumnya. Namun **bentuk
> halaman ini BELUM direkam**, jadi ini masih dugaan.
>
> **Tindakan yang diperlukan:** rekam satu kali `GET /auth` (atau
> `GET /auth?client_id=...&state=...`) → simpan **HTML lengkap** + seluruh
> `set-cookie`. Dari situ tentukan asal token yang benar, lalu persempit
> `extractCsrfTokenFromHtml` ke pola nyata dan hapus tebakan yang tak terpakai.
>
> **Status kode:** `primeSsoSession` kini (a) menembak **authorizeUrl lengkap**
> dari langkah (1) (bukan `/auth` polos tanpa query) dan (b) memindai token
> di **tiga sumber berurutan**: header `x-csrf-token` → cookie
> `csrf_token`/`XSRF-TOKEN`/`_csrf` → **HTML body**. Ini tahan banting, tapi
> **belum tervalidasi di portal sungguhan** sampai rekaman di atas ada.
>
> **🔎 Alat diagnosa 403 (ditambahkan).** Bila langkah (2) menerima non-2xx
> (mis. `403`), fungsi murni `diagnosePrimeRejection` (`src/lib/monev-login.ts`)
> menyusun **diagnostik non-rahasia** dari respons: header `server`,
> `cf-mitigated`, `cf-ray`, `content-type`, `content-length`, dan **kategori
> halaman** (via `describeHtmlHint`). Ini membedakan:
> - **challenge Cloudflare/WAF** (ada `cf-mitigated`/`server: cloudflare`) →
>   artinya permintaan non-browser diblokir, **bukan** kredensial salah.
>   Penanganannya: lewatkan jalur SSO ini via proxy residensial
>   (`MAGANGHUB_PROXY_URL`, lihat §9 & `SPEC.md` §6) supaya request datang dari
>   IP residensial tempat challenge lolos wajar. UA tetap jujur, **bukan**
>   di-spoof.
> - **halaman HTML biasa** tanpa penanda → kemungkinan `/auth` polos dipakai
>   (perlu `authorizeUrl` lengkap) atau bentuk halaman berubah → butuh rekaman.
> Tidak ada nilai token/cookie/password yang masuk ke diagnostik ini.
> **Catatan penting:** `403` terjadi di langkah (2) **sebelum** password
> dikirim, jadi `403` **tidak** berarti email/password salah.
>
> **👤 Pesan untuk pengguna ≠ diagnostik (pemisahan ditambahkan).** Teks
> diagnostik di atas penuh istilah teknis (`cf-mitigated`, jumlah byte, URL
> OAuth) dan **membingungkan** bila tampil apa adanya di layar. Karena itu
> `interpretSsoPrimeResponse` memisahkan dua hal:
> - **`message`** — dari `describeLoginErrorForUser` (MURNI). Bahasa awam,
>   satu–dua kalimat, selalu menyebut langkah berikutnya (mis. "Portal menolak
>   permintaan dari server kami karena proteksi anti-bot, **bukan** karena
>   email & password Anda salah. Gunakan cara tempel token di bawah."). Ini
>   yang dirender di UI.
> - **`diagnostic`** — teks teknis penuh (`Priming SSO gagal (HTTP 403). …`).
>   Hanya dicatat ke log server (`console.warn` di `POST
>   /api/credentials/login`), **tidak pernah** dikirim ke klien.
> - **`prime`** — ringkasan terstruktur **NON-RAHASIA** (`buildPrimeRejectionInfo`,
>   MURNI) dari respons yang menolak: `{ httpCode, kind, server?,
>   cfMitigated?, contentType?, finalUrl? }`. Ini **beda** dari `diagnostic`:
>   `prime` sengaja **boleh** mengalir server → klien (`POST
>   /api/credentials/login` menyertakannya di JSON) dan ditampilkan pada
>   `<details>` \"Detail teknis penolakan\" di `/credentials`, supaya penyebab
>   `403` bisa didiagnosis dari sisi pengguna tanpa membuka log Vercel.
>   Aman: **tidak** memuat token, cookie, password, atau isi body HTML (hanya
>   kategori/header). Body HTML mentah tetap hanya hidup di `diagnostic`
>   (server-only).
>
> **↩️ Fallback UI (ditambahkan).** Kategori penolakan (`waf`/`page`/`unknown`)
> kini ikut mengalir server → UI lewat `kind` (`classifyPrimeRejection` MURNI,
> dipakai bareng `diagnosePrimeRejection` agar tak mungkin bertentangan). Bila
> `kind === "waf"`, kartu "Hubungkan sesi Monev" menampilkan panduan kontekstual:
> **"ini bukan soal kredensial Anda"** + langkah tempel `monev_refresh_token`
> (Opsi C1). Halaman `/credentials` kini punya **form "Tempel token manual"**
> yang memanggil `POST /api/credentials/verify`, jadi instruksi fallback benar
> bisa diikuti tanpa jalan buntu. Tautan panduan:
> `/panduan/ambil-token-monev-devtools`. Tidak ada spoofing UA — proxy
> residensial (opsional) memakai `MAGANGHUB_PROXY_URL` (§9).
>
> **🧱 TEMUAN FINAL (bukti lapangan, `cf-mitigated: challenge`).** Pada uji
> nyata `/credentials`, Langkah 2 dijawab:
>
> ```
> http=403  kategori=waf  server=cloudflare  cf-mitigated=challenge
> content-type=text/html; charset=UTF-8
> url=https://account.kemnaker.go.id/auth?client_id=…&redirect_uri=…&response_type=code&scope=…&state=…
> ```
>
> `cf-mitigated: challenge` **hanya** dikirim Cloudflare saat ia menyajikan
> **Managed Challenge** ("Verify you are human"): halaman menuntut eksekusi
> **JavaScript + proof-of-work**, lalu menaruh cookie `cf_clearance`. Server
> Node (undici) **tidak menjalankan JS**, jadi **secara desain** ia tak akan
> pernah lewat — tidak peduli header `Referer`/UA/`Origin` yang kita set.
> URL yang ditolak pun **sudah benar** (authorizeUrl lengkap dengan
> `client_id`/`state`), jadi bukan soal langkah (1). Artinya:
>
> - **Login otomatis (Opsi A) dari IP datacenter TIDAK BISA** selama portal
>   memakai Managed Challenge dan **tanpa proxy**. Ini bukan bug yang bisa
>   "diperbaiki dengan header".
> - Jalan keluar yang tersedia:
>   - **Proxy residensial (DIIZINKAN, 2026-06).** `MAGANGHUB_PROXY_URL` membuat
>     request login SSO datang dari IP residensial tempat challenge lolos wajar
>     — sama seperti browser pengguna. Ini **bukan** mengakali proteksi
>     (`SPEC.md` §6 diperbarui; `AGENTS.md` §73 diperbarui). Terbukti dipakai
>     repo referensi `maganghub-bot-attendance`.
>   - **Headless browser** untuk "melarutkan" challenge (memecahkan JS/PoW)
>     tetap **terlarang** — itu mengakali anti-bot, bukan meniru klien wajar.
>   - **Pinjam `cf_clearance`** orang lain tetap **terlarang** (terikat IP +
>     sidik jari, dan itu menyamar sebagai sesi orang lain).
>   - **Tempel token (Opsi C1)** tetap ada sebagai fallback bila proxy tidak
>     tersedia/diblokir, dan UI tetap menyatakannya **jujur**. Ketika
>     `cf-mitigated=challenge`, kartu "Login otomatis" menyebut bahwa cara ini
>     butuh proxy (`isUnsolvableCloudflareChallenge`, MURNI) dan mengarahkan ke
>     tempel token. **Dengan proxy aktif, langkah tempel token tidak lagi wajib.**
>
> Deteksi ini dipisah sebagai fungsi murni `isUnsolvableCloudflareChallenge`
> (`src/lib/monev-login.ts`) yang hanya bernilai `true` untuk
> `cf-mitigated=challenge` — `403` WAF biasa **tanpa** `challenge` sengaja
> **tidak** diklaim mustahil (masih mungkin ada perbaikan sah). Ini menjaga
> kejujuran dua arah: tak menyuruh pengguna mencoba hal mustahil, tak pula
> menyerah pada `403` yang sebenarnya bisa dilewati.

Body (JSON): dua field, **`username`** (email) dan **`password`**. Nilai
sengaja **TIDAK dicatat** di dokumen ini.

> ⚠️ **Ini satu-satunya tempat kita memegang password asli.** Prinsip yang
> dipegang keras:
> - Password **tidak pernah** ditulis ke docs, kode, log, atau pesan.
> - Password hanya hidup **terenkripsi** di DB (kolom `ciphertext`/`iv`/
>   `authTag`, sama seperti sejak awal) dan **hanya didekripsi sesaat** untuk
>   satu panggilan login.
> - `kemnaker_ri_session` diperoleh dari **`GET /auth`** (halaman login) lebih
>   dulu; berumur pendek. Asal token CSRF **belum pasti** (lihat koreksi di atas).

**Yang belum direkam:** respons sukses (`200`?) dan bagaimana `code` OAuth
mengalir balik (`account.kemnaker.go.id` → `.../sso/callback?code=...`).
Perlu satu rekaman lagi: tekan "Masuk" sekali, lihat request `POST /auth/login`
**beserta respons**, dan request lanjutan ke `redirect_uri`.

### Opsi untuk mendapatkan sesi valid

Dengan SSO kini diketahui REST, ada dua jalur, dan keduanya **bukan** lagi
"Chromium headless":

| Opsi | Cara | Catatan |
| :--- | :--- | :--- |
| **C1, Tempel refresh token** | Pengguna ambil `monev_refresh_token` via DevTools, tempel ke dashboard (terenkripsi) | Aman, tidak menyentuh password. **Sudah diimplementasi.** |
| **A, Login otomatis (SSO REST)** | Server POST `username`+`password` ke SSO → ikuti OAuth → dapat `monev_refresh_token` | Otomatis penuh, **tanpa browser** (SSO = JSON API). Butuh menangani `x-csrf-token`. Belum dijalankan. |

**Rekomendasi:** C1 tetap jalur default (paling rendah risiko). Opsi A sudah
**tersusun sebagai kode gated** (`runLoginFlow` di `src/lib/monev-login.ts`,
§4.0): seluruh alur (1)→(2)→(3)→(4) siap, tetapi **tidak dieksekusi** dan hanya
aktif dengan `confirmLivePortalRequest: true`. Pemilik tetap yang memutuskan
risiko "password diamankan-server" sebelum mengaktifkannya.
Menaruh password di server yang bisa didekripsi memang memperbesar tanggung
jawab, karena itu tetap **opt-in**, bukan pengganti C1.

> **Status implementasi (diperbarui 2):** **Opsi A SUDAH DIAKTIFKAN** sebagai
> jalur utama, setelah pemilik memutuskan menerima risiko password terenkripsi
> di server. Titik masuk: `POST /api/credentials/login`
> (`src/app/api/credentials/login/route.ts`), satu-satunya tempat yang
> melewatkan `confirmLivePortalRequest: true`. Penyimpanan sesi:
> `src/lib/credential-session.ts` (+ `credential-session-policy.ts` yang murni),
> kolom `accessCiphertext`/`accessIv`/`accessAuthTag`/`accessExpiresAt` di
> `maganghub_credentials` (terpisah dari kolom refresh token). Rate limit
> `credentialsLogin`. UI: kartu "Hubungkan sesi Monev" di
> `src/app/(app)/credentials/page.tsx`. Opsi C1 (tempel token) tetap
> tersedia sebagai cadangan.
>
> **Konsumsi access token (diperbarui):** jalur submit
> (`src/lib/perform-submit.ts`) memakai access token tersimpan **langsung** bila
> masih segar (`isAccessTokenFresh`, margin 1 menit), melewati tukar refresh
> token sepenuhnya. Bila access token tidak ada/kedaluwarsa, baru fallback ke
> `exchangeRefreshForAccess(refreshToken)`. Artinya: meski portal **tidak**
> mengirim refresh token, sesi login otomatis tetap bisa dipakai untuk submit
> selama ±6 jam.
>
> **Yang MASIH belum diuji ke portal sungguhan:** (a) apakah `code` OAuth
> muncul di `redirect_uri` respons login SSO; (b) apakah callback
> `GET /api/v1/auth/login/callback` mengirim `monev_refresh_token` via
> Set-Cookie. Kode menerima kedua kemungkinan: bila `code` tak ketemu → `ERROR`
> jujur; bila refresh token tak ada → hanya access token yang disimpan.
> Perlu diuji pemilik akun sekali untuk menutup celah ini.

**Catatan soal `fingerprint`:** JWT refresh token memuat klaim
`fingerprint` (hash). **Belum diketahui** apakah server memvalidasi
fingerprint terhadap IP/UA pemakai. Bila ya, refresh token dari satu
perangkat mungkin **ditolak** dari server lain, perlu diuji.

> **Status implementasi (diperbarui):** **Opsi C1 SUDAH DIIMPLEMENTASI.**
> Lihat `src/lib/monev-client.ts` (`fetchBuildId` + `verifySession`) dan
> `src/app/api/credentials/verify/route.ts`. Token disimpan terenkripsi
> AES-256-GCM di kolom terpisah (`tokenCiphertext`) pada
> `maganghub_credentials`, berdampingan dengan password asli yang tidak
> tersentuh. UI: kartu "Tes Koneksi" di
> `src/app/(app)/credentials/page.tsx`.
>
> **Yang belum diuji terhadap portal sungguhan:** apakah klaim `fingerprint`
> di JWT refresh token divalidasi lintas-IP (butuh token asli dari pengguna).

---



---

## 8. Endpoint submit laporan, ✅ TERJAWAB (2026-09-28)

**Bukti:** rekaman "Copy as cURL" dari pemilik akun (satu tekan `Simpan dan
Kirim`). Terekam **tiga** permintaan sekaligus, submit + dua pembacaan status.
Nilai rahasia disensor di bawah.

### 8.1 Submit, `POST /api/v1/attendances/with-daily-log`

| Hal | Nilai |
| :--- | :--- |
| Method | `POST` |
| Path | `/api/v1/attendances/with-daily-log` |
| Auth | **`authorization: Bearer <access token>`** (JWT akses, `ttl` 6 jam), *bukan* cukup `monev_refresh_token` saja |
| Content-Type | `application/json` |
| Origin | wajib `https://monev.maganghub.kemnaker.go.id` |
| Field: tanggal | `date` → `"2026-09-28"` (`YYYY-MM-DD`) |
| Field: kehadiran | **`status` → `"PRESENT"`** (enum, bukan `"1"`) |
| Field: aktivitas | `activity_log` |
| Field: pembelajaran | `lesson_learned` (bukan "learning") |
| Field: kendala | `obstacles` |

Contoh body (terverifikasi):

```json
{
  "date": "2026-09-28",
  "status": "PRESENT",
  "activity_log": "…",
  "lesson_learned": "…",
  "obstacles": "…"
}
```

> **Penting (SPEC §11B, §12.7.2):** "kehadiran Hadir" TIDAK dikirim sebagai
> `attendance: "1"` seperti dugaan awal, melainkan lewat field **`status`**
> bernilai **`"PRESENT"`**. Ini field wajib; kalau terlewat, laporan bisa
> tercatat "Tidak Hadir". Nilai "Hadir" = `PRESENT`.

### 8.2 Cek duplikasi (RB-03), `GET /api/v1/daily-logs`

| Hal | Nilai |
| :--- | :--- |
| Method | `GET` |
| Path | `/api/v1/daily-logs?date=<YYYY-MM-DD>&participant_id=<uuid>&limit=100` |
| Auth | `authorization: Bearer <access token>` |
| Guna | Periksa apakah `date` itu **sudah punya** daily-log → `ALREADY_SUBMITTED` |

### 8.3 Baca status kalender, `GET /api/v1/attendances`

| Hal | Nilai |
| :--- | :--- |
| Method | `GET` |
| Path | `/api/v1/attendances?participant_id=<uuid>&start_date=<YYYY-MM-DD>&end_date=<YYYY-MM-DD>` |
| Auth | `authorization: Bearer <access token>` |
| Guna | Ambil status per tanggal (verifikasi pasca-submit / RB-06, §12.7.3) |

> ⚠️ **Jebakan tanggal (SPEC §11B, §12.7.3):** verifikasi pasca-submit HARUS
> memakai rentang yang **memuat tanggal target** (`start_date`/`end_date`), lalu
> **cocokkan tanggal target**, bukan membaca "hari ini". Ini persis bug laten
> bot lama.

### 8.4 ⚠️ Token: Bearer akses ≠ refresh token

Temuan penting: API submit **tidak** membaca `monev_refresh_token` langsung.
Rekaman memakai header `authorization: Bearer <access token>` dengan `ttl` 6 jam.
Artinya, **sebelum submit** kita perlu menukar `monev_refresh_token` menjadi
access token, kemungkinan lewat `POST /api/v1/auth/refresh` (§4.1) yang
`200`-nya berisi access token baru.

> **Status:** bentuk body sukses `/auth/refresh` **belum terekam** (§10). Ini
> satu-satunya bagian yang masih menggantung untuk Tahap 4.

### 8.5 Kerangka yang sudah diisi

`src/lib/monev-submit.ts`, `TODO §8` kini diisi dari §8.1 (lihat tabel di
sana). **Status HTTP sudah TERVERIFIKASI lewat uji nyata (2026-09-28):**
`409 Conflict` = laporan tanggal itu sudah ada (terlihat di `/history`
sebagai `HTTP 409` + status `DUPLICATE`). Karena tanggal uji sudah pernah diabsen,
inilah respons pertama yang bisa direkam; **kode sukses (`200`/`201`) masih perlu
direkam** pada kirim sungguhan pertama untuk tanggal yang belum ada. Fungsi murni
(`buildSubmitBody`, `interpretSubmitResponse`) + tesnya tetap hijau. Saat `409`
membawa body JSON, pesan portal kini dipakai di audit log (fallback ke teks
internal bila body kosong/HTML).

### 8.5a ✅ Pra-cek duplikat (RB-03) SUDAH DIIMPLEMENTASI

Sesuai §12.6 dan SPEC §11B, sebelum setiap pengiriman nyata kita **membaca dulu**
`GET /api/v1/daily-logs?date=<target>` dan **berhenti bila laporan tanggal itu
sudah ada** — jangan bergantung pada `409` saja. Alasannya konkret: portal
**tidak** menolak submit ulang untuk tanggal yang sudah diisi lewat **UI portal
(jalur manual pengguna)**; `409` hanya muncul bila endpoint API ini dipanggil dua
kali. Tanpa pra-cek, cron bisa **menimpa** laporan manual (kejadian nyata:
laporan manual 18:00 lalu cron 18:52 membalas `201`).

Titik pemasangan: `src/lib/monev-submit.ts` menyediakan `checkDailyLogExists()`
(jaringan) + `interpretDailyLogs()`/`duplicateGuardAllows()` (murni), dan
`src/lib/perform-submit.ts` memanggilnya **setelah access token diperoleh, sebelum
`submitReport`**. Kebijakan default-**aman**: hanya `ABSENT` yang mengizinkan
kirim; `EXISTS` → `ALREADY_SUBMITTED` (dicatat `DUPLICATE`); `UNKNOWN` (jaringan
gagal / 401 / bentuk respons tak dikenal) **juga membatalkan** (dicatat `FAILED`)
— melewatkan sehari jauh lebih ringan daripada menghapus tulisan pengguna.
Pengecekan dilewati saat dry-run (tidak menyentuh jaringan). Pencocokan
memakai **tanggal target**, bukan sekadar "ada log" (§12.7.3).

### 8.5b Route submit (Tahap 4), ✅ TERPASANG, gated

`src/app/api/reports/submit/route.ts` menyatukan alur penuh:

1. `assessReadiness()` (`src/lib/submit-service.ts`, **murni**), cek policy
   (`decide()`) + kelengkapan (template & token). Libur/akhir program → batal
   **sebelum** jaringan disentuh.
2. Tukar refresh token tersimpan → access token (`exchangeRefreshForAccess`).
3. `submitReport()` → `POST /api/v1/attendances/with-daily-log`.
4. Selalu tulis `SubmitLog` (`MANUAL`/`CRON`), sukses, duplikat, maupun gagal
   (kegagalan tulis log sengaja ditelan; bukan alasan menggagalkan respons).

**Gerbang keselamatan:** pengiriman nyata hanya aktif bila `ALLOW_LIVE_SUBMIT=1`
(lihat `.env.example`). Tanpa itu → mode latihan (`DRY_RUN`): seluruh keputusan
dihitung, portal **tidak disentuh**. Tombol pemicu ada di `/dashboard`
("Kirim Absen", trigger `MANUAL`). Tanggal target dihitung server dalam zona
Asia/Jakarta (`todayInJakarta`), bukan zona perangkat.

### 8.6 Alat diagnostik (untuk rekaman berikutnya)

Halaman `/dev-tools` (khusus ADMIN) + `POST /api/dev-tools/analyze-capture`
memakai `src/lib/har-capture.ts` (murni): tempel "Copy as cURL"/HAR → langsung
terbaca method/path/field, rahasia disembunyikan. **Tidak mengirim** apa pun ke
portal.

### 8.7 Yang masih perlu direkam (opsional)

Bentuk body `200` dari `POST /api/v1/auth/refresh` (§4.1), **tidak lagi
mem-blocking**: alur pertama memakai `access_token` dari `/auth/login/callback`
(§4.4, sudah terverifikasi). Penukaran refresh hanya perlu bila token 6 jam
kedaluwarsa; bentuk responsnya belum terekam sehingga
`interpretRefreshResponse` masih toleran dua kemungkinan (body JSON *atau*
`set-cookie`) dan **tidak menebak**.

**Status HTTP submit** (`200`/`201` vs `409` duplikat) juga belum terekam,
diamati saat uji pertama sebelum `ALLOW_LIVE_SUBMIT=1`.


---

## 9. Batas etika (dari `SPEC.md` §10)

- **Jangan** mengakali CAPTCHA, menembus OTP/MFA, atau memalsukan identitas
  orang lain.
- Bila muncul challenge → artinya **butuh intervensi manusia**, bukan diakali.
  **✅ KEPUTUSAN BARU (2026-06, DIPERBARUI): proxy residensial DIIZINKAN untuk
  jalur login SSO.** Larangan lama ("proxy dibatalkan") **dicabut pemilik**
  setelah terbukti repo referensi `maganghub-bot-attendance` berhasil login
  lewat proxy residensial (`HttpsProxyAgent` + `MAGANGHUB_PROXY_URL`). Yang
  dijaga Cloudflare Managed Challenge **hanya** halaman login SSO
  (`account.kemnaker.go.id`); proxy membuat request datang dari IP residensial
  — tempat challenge lolos **secara wajar**, sama seperti browser pengguna.
  Ini bukan "menerobos proteksi", melainkan tampil sebagai klien yang wajar.
  Lihat `SPEC.md` §6, `AGENTS.md` §73.
- **Cara pakai:** set `MAGANGHUB_PROXY_URL` di `.env` (opsional). Implementasi
  terpusat di `src/lib/proxy-fetch.ts` (`fetchPortal`, memakai
  `undici.ProxyAgent`). Bila env kosong → `fetch` biasa, perilaku lama utuh.
- Klien ini **hanya** melakukan login + submit laporan. Tidak ada aksi lain.
- **Tidak boleh mengirim apa pun** selama fase uji koneksi.

Catatan penting: karena **API Monev tidak diblokir Cloudflare** (§7), jalur data
(code-exchange, `refresh`, submit) **tidak** lewat proxy — hanya jalur yang
menyentuh `account.kemnaker.go.id` (SSO) yang lewat proxy, dan itu diatur
otomatis oleh `fetchPortal` (proxy hanya aktif di pemanggil yang memakainya).
Jalur "tempel token" di `/credentials` tetap ada sebagai fallback bila proxy
tidak tersedia/diblokir.

---

## 10. Ringkasan: yang sudah pasti vs belum

| ✅ Sudah pasti (terverifikasi) | ❓ Belum diketahui |
| :--- | :--- |
| Host API: `monev-api.maganghub.kemnaker.go.id` | Isi body sukses `/auth/refresh` (200), nama field access token |
| **API TIDAK diblokir Cloudflare**, `401` JSON polos | Apakah klaim `fingerprint` divalidasi lintas-IP |
| `version.json` → `{"build_id":"...-production"}` | Bentuk POST halaman SSO `account.kemnaker.go.id` |
| `GET /auth/login` → `201`, body = **URL SSO polos** | Apakah `x-frontend-build-id` wajib |
| OAuth: `client_id`, `redirect_uri`, `scope=basic email` | Isi body callback (1 KB JSON) |
| Cookie: `monev_refresh_token` (HttpOnly, 30 hari) | |
| `/auth/refresh` gagal → **`401 AUTHORIZATION_ERROR`** | |
| `/auth/login/callback` sukses → **`201 Created`** | |
| Origin wajib: `https://monev.maganghub.kemnaker.go.id` | |
| **Submit = `POST /attendances/with-daily-log`**, field `date`/`status=PRESENT`/`activity_log`/`lesson_learned`/`obstacles` (§8) | |
| Endpoint baca: `GET /daily-logs`, `GET /attendances` (§8) | |
| Submit butuh `authorization: Bearer <access>` (bukan refresh cookie) | |
| Kerangka submit + policy siap (`monev-submit.ts`, `report-policy.ts`) | |
| **Route submit Tahap 4 terpasang, gated by `ALLOW_LIVE_SUBMIT`** (§8.5b) | Status HTTP sukses submit belum terekam |

---

## 11. Langkah selanjutnya

1. ✅ **Uji pemblokiran Cloudflare**, SELESAI, hasil: **tidak diblokir** (§7).
2. **Rekam respons sukses `/auth/refresh`** (`200`), untuk tahu nama field
   **access token**. Ini satu-satunya yang tersisa untuk membuka submit.
3. ✅ **Rekam satu kali submit laporan**, SELESAI (2026-09-28). Endpoint &
   field terbaca → §8.
4. **Uji `fingerprint`:** pakai refresh token dari perangkat A di perangkat B
   (IP berbeda), apakah diterima?
5. ✅ **Tulis `src/lib/monev-client.ts` + endpoint Tes Koneksi
   (`POST /api/credentials/verify`), memakai Opsi C1**, SELESAI. Tinggal diuji
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
  stabil**, jangan pernah dijadikan selector.
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

### 12.3 ⚠️ Enum status, dan jebakan `.status-dot`

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

Bukan teori, ini jejak **run nyata** bot lama yang berhasil submit.
Ini menutup beberapa pertanyaan yang tersisa dan memunculkan peringatan baru.

### 12.7.1 Submit itu XHR cepat, bukan navigasi halaman

Satu run sukses utuh (2026-09-22) tercatat:

| Langkah | Waktu | Selisih |
| :--- | :--- | :--- |
| Buka portal | `08:08:22.857` | - |
| Baca status (`Belum Diisi`) | `08:08:25.115` | +2,3 s |
| Isi form + cek tombol aktif | `08:08:25.617` | +0,5 s |
| **Submit terkirim** | `08:08:25.673` | **+56 ms** |

**Total dari buka halaman ke sukses ≈ 2,8 detik.** Submit sendiri **56 ms**,
terlalu cepat untuk navigasi halaman. **Ini membuktikan endpoint submit
adalah panggilan XHR/REST**, konsisten dengan keputusan §6 (Direct REST API).
Endpoint itu ada; kita hanya belum tahu nama & bentuk body-nya (§8).

### 12.7.2 ⚠️ Laporan kehadiran ("Hadir") WAJIB ikut dikirim

Bot lama **tidak** mengandalkan `<select>` native (element-nya tersembunyi,
`select_option` timeout 30 s pada 2026-09-07). Ia memaksa nilai lewat JS:
`el.value = '1'` (Hadir) + dispatch `input`/`change`.

**Implikasi untuk web:** saat merekam `POST` submit dari DevTools, pastikan
**field kehadiran ikut ada di body**. Bila kita lupa mengirimnya, laporan
bisa tercatat sebagai **"Tidak Hadir"**, kesalahan yang tidak bisa dianggap
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
tanggal mundur, jadi wajib memverifikasi tanggal yang benar-benar diminta.**

Aturan untuk web: verifikasi harus **cocokkan tanggal target**, jangan
sekadar "ada laporan".

### 12.7.4 Bukti empiris: `.status-dot` memang menyesatkan

Dua peringatan nyata di log, membenarkan §12.3 dengan bukti, bukan dugaan:

```
2026-09-07 | WARNING | Found status dot but aria-label doesn't match known statuses.
2026-09-21 | WARNING | Ambiguous status. dot=True label='...Belum Diisi'
```

**Kesimpulan tegas: `aria-label` satu-satunya sumber status. Jangan pakai dot.**

### 12.7.5 Sesi bisa kedaluwarsa, siapkan alur re-auth

```
2026-09-21 | ERROR | Not logged in. Chrome session expired; manual login required.
```

Sesi hilang meski pakai profil persisten. Artinya **`monev_refresh_token`
30 hari pun akan mati**, web harus punya jalur "hubungkan ulang akun", bukan
sekadar gagal dengan error mentah.

### 12.7.6 `PROGRAM_ENDED` terbukti berjalan

```
2027-02-10 → PROGRAM_ENDED | ... past the end of the program; nothing to do.
```

Keluar **tanpa membuka browser**. Pengaman `LAST_ACTIVE_DATE` (SPEC §11B)
terbukti bekerja; web wajib menegakkan hal yang sama di sisi server.



