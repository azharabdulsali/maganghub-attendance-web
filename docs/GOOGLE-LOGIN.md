# docs/GOOGLE-LOGIN.md: Masuk dengan Google

Panduan mengaktifkan tombol **Masuk dengan Google**. Fitur ini **opsional**:
selama `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` kosong, aplikasi berjalan
normal dengan email + kata sandi dan tombol Google tidak dirender sama sekali.

Keputusan pemilik yang mengikat (lihat `SPEC.md` §5.1a):

1. Email Google yang **belum terdaftar** → akun dibuat otomatis (nama diambil
   dari Google). Tidak perlu mengisi form.
2. Email Google yang **sudah terdaftar** dengan kata sandi → akun lama langsung
   dihubungkan. Pengguna bisa masuk lewat Google **atau** kata sandi.
3. Akun Google **belum punya kata sandi**. Di `/settings` pengguna dapat
   **membuat** kata sandi (tanpa diminta sandi lama). Sebelum itu, ubah email
   dinonaktifkan karena endpoint itu memakai kata sandi sebagai bukti.
4. Email yang sama dengan `ADMIN_EMAIL` tetap menjadi ADMIN pada login pertama
   lewat Google.

---

## 1. Buat kredensial di Google Cloud Console

1. Buka <https://console.cloud.google.com/> lalu buat project (atau pilih yang
   sudah ada). Nama bebas, mis. `maganghub-attendance`.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Isi nama aplikasi, email dukungan, dan email developer.
   - Scopes: cukup `openid`, `email`, `profile` (bawaan saat login).
   - Selama status masih **Testing**, hanya email yang Anda tambahkan sebagai
     **Test user** yang bisa masuk. Untuk publik, tekan **Publish app**
     (verifikasi Google tidak diminta untuk scope dasar ini).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins** (boleh kosong, tapi aman diisi):
     - `http://localhost:3000`
     - `https://DOMAIN-PRODUKSI-ANDA`
   - **Authorized redirect URIs** — WAJIB persis, tanpa garis miring di akhir:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://DOMAIN-PRODUKSI-ANDA/api/auth/callback/google`
     - (tambahan bila memakai preview Vercel:
       `https://NAMA-PREVIEW.vercel.app/api/auth/callback/google`)
4. Salin **Client ID** dan **Client secret**.

> `DOMAIN-PRODUKSI-ANDA` harus host final di `NEXTAUTH_URL`, mis.
> `https://www.maganghub-autoabsen.my.id`. Bila domain di-redirect (non-`www` →
> `www`), pakai bentuk `www`; kalau tidak, Google mengembalikan
> `redirect_uri_mismatch`.

## 2. Isi environment

`.env.local` (lokal):

```dotenv
GOOGLE_CLIENT_ID="xxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxx"
NEXTAUTH_URL="http://localhost:3000"
```

Vercel (Settings → Environment Variables, Production **dan** Preview bila
dipakai): dua variabel di atas, dengan `NEXTAUTH_URL` = domain produksi.

**Jangan pernah** menulis Client Secret ke kode, commit, atau screenshot.

## 3. Selaraskan database

Kolom `User.passwordHash` kini **boleh NULL** (akun Google tidak punya sandi).
Jalankan sekali sebelum deploy kode ini:

```bash
npm run db:push
```

Urutannya penting: kalau kode baru dipakai sementara kolom masih `NOT NULL`,
pembuatan akun lewat Google akan gagal.

## 4. Uji

1. `npm run dev`, buka `/login`.
2. Tombol **Masuk dengan Google** muncul hanya bila kedua env terisi.
3. Masuk dengan akun Google yang belum terdaftar → langsung masuk ke
   `/dashboard`; di `/profile` emailnya sama dengan email Google.
4. Masuk dengan email yang sudah punya akun kata sandi → akun lama dipakai
   (periksa riwayat di `/history` masih ada).
5. Buka `/settings`: keterangan "Akun ini masuk lewat Google dan belum punya
   kata sandi", tombol **Buat kata sandi** tersedia. Setelah dibuat, login
   dengan email + kata sandi juga berhasil.

## 5. Batasan yang perlu diketahui

- **Tidak ada verifikasi email terpisah.** Email dari Google sudah
  terverifikasi Google, sehingga otomatis dianggap sah. Ini tidak mengubah
  pendaftaran manual yang tetap tanpa verifikasi (`SPEC.md` §13).
- **Tidak ada reset kata sandi lewat email** (tetap keputusan lama). Pemulihan
  akun hanya lewat admin.
- **Akun yang di-soft-delete tidak bisa masuk lewat Google.** Callback
  `signIn` memeriksa `deletedAt`; pesannya "Akun ini tidak diizinkan masuk."
- **Mencabut akses di sisi Google tidak menghapus akun** di aplikasi. Pengguna
  tetap ada, dan admin tetap bisa mengatur ulang kata sandinya.
- **Gambar profil Google tidak ditampilkan** di UI, jadi tidak ada permintaan
  ke `googleusercontent.com` dan CSP `img-src` tidak perlu diubah.
- **Rate limit login kata sandi tidak berlaku untuk jalur Google** (tidak ada
  kata sandi yang bisa ditebak). Pembuatan akun tetap dibatasi oleh aturan
  Google sendiri.

## 6. Pemecahan masalah

| Gejala | Sebab dan tindakan |
| --- | --- |
| `redirect_uri_mismatch` | URI di Google Console tidak sama persis dengan `NEXTAUTH_URL` + `/api/auth/callback/google`. Perhatikan `www`, `https`, dan garis miring di akhir. |
| `Access blocked: app not verified` | OAuth consent screen masih **Testing** dan email Anda belum masuk **Test user**. Tambahkan, atau **Publish app**. |
| Tombol Google tidak muncul | Salah satu env kosong (harus dua-duanya), server belum dimuat ulang, atau build belum memuat env baru. Cek `GET /api/auth/providers` — harus ada `"google"`. |
| `Configuration` di halaman login | Client ID/Secret salah atau tertukar antar-project Google. |
| Login berhasil di Google, lalu "Akses ditolak" | Email akun itu sedang di-soft-delete oleh admin (`deletedAt` terisi), atau `signIn` menolak karena email kosong. |
| "Akun ini belum punya kata sandi" saat ubah email | Benar dan disengaja: buat kata sandi dulu di kartu Kata sandi. |
| Login kata sandi tiba-tiba "Email atau password salah" untuk akun Google | Akun itu memang belum punya kata sandi. Masuk lewat Google, lalu buat sandi di `/settings`. |

## 7. Mematikan fitur lagi

Kosongkan kedua env lalu restart/deploy. Tombol hilang, dan login kata sandi
tetap berfungsi. Akun yang pernah dibuat lewat Google **tidak terhapus**; mereka
tetap bisa masuk setelah membuat kata sandi lewat admin (atur ulang sandi di
`/admin`) atau lewat sesi yang masih aktif.
