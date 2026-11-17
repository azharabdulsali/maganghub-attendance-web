# docs/TURNSTILE.md: CAPTCHA Cloudflare Turnstile

Panduan mengaktifkan pemeriksaan anti-bot pada **pendaftaran** dan **login kata
sandi**. Fitur ini **opsional**: selama `TURNSTILE_SECRET_KEY` dan
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` kosong, widget tidak dirender dan server tidak
memeriksa apa pun — aplikasi berjalan persis seperti sebelumnya.

CAPTCHA melengkapi rate limit, bukan menggantikan. Rate limit mencegah satu IP
menembak berkali-kali; Turnstile menyaring permintaan yang datang dari bot
terdistribusi.

---

## 1. Ambil kunci di Cloudflare

1. Masuk <https://dash.cloudflare.com/> → menu **Turnstile** → **Add widget**.
2. Isi nama widget (mis. `maganghub-attendance`).
3. **Hostname** yang didaftarkan harus memuat semua alamat yang dipakai:
   - `localhost` (untuk pengembangan)
   - `www.maganghub-autoabsen.my.id` (produksi — pakai bentuk `www` karena
     domain tanpa `www` di-redirect ke sana)
   - (opsional) branch domain preview Vercel, mis.
     `maganghub-attendance-web-git-nama.vercel.app`
4. Widget mode: **Managed**.
5. Salin **Site Key** dan **Secret Key**.

Hostname yang tidak terdaftar membuat widget menampilkan galat; pengguna tidak
bisa mendaftar/masuk di alamat itu.

## 2. Isi environment

`.env.local`:

```dotenv
NEXT_PUBLIC_TURNSTILE_SITE_KEY="0x4AAAAAAA..."
TURNSTILE_SECRET_KEY="0x4AAAAAAA..."
```

Vercel: dua variabel yang sama untuk scope **Production** dan **Preview**.
Site key memang publik; secret key **tidak boleh** diberi awalan
`NEXT_PUBLIC_` dan tidak boleh masuk kode, commit, atau screenshot.

## 3. Aktif/matinya ditentukan oleh dua-duanya

`turnstileConfigured()` di `src/lib/env.ts` hanya mengembalikan `true` bila
**kedua** variabel terisi. Alasannya: secret saja akan membuat server menolak
semua permintaan sementara widget tidak pernah muncul, dan site key saja tidak
bisa diverifikasi. Salah satu kosong = fitur mati utuh, termasuk tidak ada
pemeriksaan di server.

## 4. Yang berubah di kode

| Berkas | Peran |
| --- | --- |
| `src/lib/turnstile.ts` | Verifikasi ke `/siteverify` (timeout 5 detik, tanpa dependensi baru). Kegagalan jaringan **tidak** dianggap lolos. |
| `src/components/turnstile-widget.tsx` | Widget; skrip dimuat sekali per halaman, `theme: auto`, `size: flexible`. |
| `src/app/api/register/route.ts` | Memeriksa token **sebelum** bcrypt dan sebelum query `User`. |
| `src/lib/auth.ts` | Memeriksa token di `authorize`, setelah rate limit dan sebelum query/bcrypt. Kegagalan memakai kode `CaptchaGagal`, bukan "email atau password salah". |
| `src/app/login/login-form.tsx`, `src/app/register/page.tsx` | Mengirim token; widget di-reset setiap submit gagal. |
| `src/lib/security-headers.ts` | CSP mengizinkan `https://challenges.cloudflare.com` di `script-src`, `frame-src`, `connect-src`. Tanpa ini widget tidak muncul. |
| `src/app/privacy/page.tsx` | Menjelaskan data yang diterima Cloudflare. |

## 5. Token sekali pakai

Token Turnstile berlaku 5 menit dan **hanya bisa dipakai satu kali**. Karena
itu setiap kegagalan submit menaikkan `resetSignal`, yang membuang widget lama
dan memasang yang baru. Jangan menghapus mekanisme ini: tanpa reset, percobaan
kedua selalu gagal.

## 6. Uji

Kunci uji resmi Cloudflare (jangan dipakai di produksi):

| Site key | Secret | Perilaku |
| --- | --- | --- |
| `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | selalu lolos |
| `2x00000000000000000000AB` | `1x0000000000000000000000000000000AA` | selalu gagal |

Langkah uji:

1. `npm run dev`, buka `/register`.
2. Widget muncul di atas tombol. Daftar akun → berhasil.
3. Buka `/login`, masuk dengan kata sandi → berhasil.
4. Ganti site key ke yang "selalu gagal", coba daftar: harus muncul pesan
   "Pemeriksaan keamanan tidak lolos", bukan pesan sukses palsu.
5. Kosongkan salah satu env, restart: widget hilang dan pendaftaran kembali
   tanpa pemeriksaan.
6. (Opsional) Blokir `challenges.cloudflare.com` di DevTools → permintaan harus
   DITOLAK dengan pesan "sedang tidak bisa dilakukan", bukan diloloskan.

## 7. Batasan yang perlu diketahui

- **Login Google tidak bisa diberi CAPTCHA.** Alurnya keluar ke Google, jadi
  tidak ada form kita yang bisa disisipi widget. Rate limit tetap berlaku.
- **Pengguna di jaringan yang memblokir Cloudflare tidak bisa mendaftar/masuk
  dengan kata sandi.** Ini konsekuensi wajar dari CAPTCHA; login Google masih
  bisa dipakai bila diaktifkan.
- **Kuota gratis 1 juta verifikasi/bulan.** Tidak ada biaya untuk pemakaian
  normal.
- **Preview Vercel** hanya bisa memakai widget bila hostname preview
  didaftarkan di Cloudflare. Alamat per-deploy berubah tiap commit; daftarkan
  branch domain yang stabil.
- **Verifikasi butuh jaringan keluar dari server** ke
  `challenges.cloudflare.com`. Bila server tidak bisa menjangkaunya, pengguna
  melihat pesan "sedang tidak bisa dilakukan" — disengaja, karena meloloskan
  permintaan saat pemeriksaan mati berarti CAPTCHA bisa dilewati.

## 8. Mematikan fitur

Kosongkan salah satu (atau kedua) variabel lalu redeploy. Widget hilang dan
pemeriksaan server berhenti. Tidak ada data pengguna yang terpengaruh.
