# docs/UI-LAYOUT.md — Kerangka Tampilan (Sidebar, Profil, Struktur URL)

> Ringkasan putaran **UI/UX 1** (fondasi & navigasi). Keputusan resminya ada di
> `SPEC.md` §5.8. Dokumen ini menjelaskan *cara* semuanya disusun dan *apa yang
> harus dijaga* saat mengubahnya.

---

## 1. Struktur folder halaman

```
src/app/
├─ page.tsx                      # LANDING PUBLIK — URL: /
├─ login/  register/             # halaman publik
├─ api/                          # route API (tak terpengaruh)
└─ (app)/                        # ── route group, TIDAK muncul di URL ──
   ├─ layout.tsx                 # cek sesi + pasang sidebar SEKALI (SEMUA halaman)
   ├─ dashboard/                 # URL: /dashboard (beranda setelah login)
   │  ├─ page.tsx                # /dashboard
   │  └─ … komponen statistik di sini (stats-*, trend-chart, submit-report-button)
   ├─ calendar/                  # /calendar   (kalender kehadiran & laporan)
   ├─ profile/                   # /profile
   ├─ credentials/               # /credentials
   ├─ report-templates/          # /report-templates
   ├─ history/                   # /history
   ├─ automation/                # /automation
   ├─ admin/                     # /admin       (khusus ADMIN)
   └─ dev-tools/                 # /dev-tools   (khusus ADMIN)
```

> **Revisi (putaran 3):** dulu `layout.tsx` tinggal di `(app)/dashboard/` sehingga
> hanya membungkus `/dashboard/*`. Setelah halaman lain dipindah ke route root
> (`/calendar`, `/credentials`, …), `layout.tsx` **dinaikkan** ke `(app)/` agar
> sidebar & penjagaan sesi tetap membungkus SEMUA halaman. Hanya beranda yang
> masih di bawah `/dashboard`.

**Dua wilayah berbeda, jangan dicampur:**

| Wilayah | URL | Siapa yang boleh lihat | Dijaga oleh |
| :--- | :--- | :--- | :--- |
| **Publik** | `/` | Semua orang | — (landing biasa) |
| **Setelah login** | `/dashboard`, `/calendar`, `/credentials`, … | Hanya pengguna login | `(app)/layout.tsx` |

**Kenapa route group `(app)`?** Supaya sidebar dipasang **sekali** di
`(app)/layout.tsx`, bukan disalin ke tiap halaman. Tanda `(app)` adalah
konvensi Next.js: nama grup dalam tanda kurung **tidak** muncul di URL. Jadi
`src/app/(app)/dashboard/page.tsx` melayani `/dashboard`, bukan
`/(app)/dashboard`.

> **⚠️ Aturan penting — satu URL, satu file.** Pernah terjadi loop redirect tak
> berujung (`ERR_TOO_MANY_REDIRECTS`) karena `src/app/page.tsx` dan
> `src/app/(app)/page.tsx` sama-sama mengklaim `/`, sementara landing
> mengarahkan sesi aktif ke `/`. **Jangan pernah** menaruh `page.tsx` di dalam
> `(app)` langsung, dan **setelah login tujuannya wajib `/dashboard`**, bukan `/`.

---

## 2. Siapa yang menjaga apa

| Lapisan | Tanggung jawab |
| :--- | :--- |
| `(app)/layout.tsx` | Cek sesi (`auth()`). Belum login → `redirect("/login")`. Menyusun `user` (nama, email, peran) lalu menyerahkan ke sidebar. |
| `app-sidebar.tsx` | Menampilkan menu sesuai peran. **Hanya menyembunyikan tautan.** |
| Tiap `page.tsx` | Boleh punya pemeriksaan tambahan (mis. `dev-tools` menolak non-ADMIN). |

### Catatan keamanan (penting)

Menyembunyikan tautan di sidebar **bukan** pengaman. Siapa pun yang mengetik
`/dev-tools` langsung harus tetap ditolak **di server**. Karena itu halaman
`dev-tools/page.tsx` memeriksa peran sendiri dan `redirect("/")` bila bukan
ADMIN — jangan pernah menghapus pemeriksaan itu dengan alasan "toh tautannya
sudah disembunyikan".

Untuk halaman admin baru di masa depan: **selalu** pasang pemeriksaan peran di
`page.tsx`-nya, bukan hanya di sidebar.

---

## 3. Sidebar — dua tata letak, satu komponen

`src/components/app-sidebar.tsx` menangani:

- **Desktop (≥ `md`):** kolom tetap (`sticky`) selebar 64 (≈256px).
- **Mobile (< `md`):** bilah atas tipis + tombol hamburger yang membuka **laci
  geser**. Laci ditutup lewat tombol X atau menekan latar gelap.

Tidak ada dependensi baru: hanya state React + kelas Tailwind. Ini disengaja
(AGENTS.md §2 — jangan menambah paket tanpa alasan kuat).

Menu bersifat **data** (`MENU_UMUM`, `MENU_ADMIN`). Untuk menambah menu, cukup
tambahkan satu entri — tidak perlu mengubah tata letak:

```ts
const MENU_UMUM: MenuItem[] = [
  { href: "/calendar", label: "Kalender", icon: CalendarDays },
  { href: "/history", label: "Riwayat Absensi", icon: CalendarCheck },
  // tambahkan di sini
];
```

Ikon diambil dari `lucide-react` (sudah terpasang).

---

## 4. Profil

- Halaman: `src/app/(app)/profile/page.tsx` (server) + `profile-form.tsx` (klien)
  + `password-form.tsx` (klien, ubah kata sandi).
- **Yang bisa diubah pengguna:** nama tampilan, dan kata sandi sendiri.
- **Read-only:** email (identitas login), peran, tanggal bergabung.
- **Status kredensial Monev** ditampilkan sebagai *label* (`ACTIVE`,
  `UNVERIFIED`, `INVALID`) — **tidak pernah** isi token atau password.
- API: `PATCH /api/profile` (lihat `src/app/api/profile/route.ts`). `userId`
  diambil dari sesi, **bukan** dari body, supaya tidak bisa mengubah milik orang
  lain. Nama kosong disimpan sebagai `NULL`, bukan `""`.
- **Ubah kata sandi (C-13):** `POST /api/account/password`
  (`src/app/api/account/password/route.ts`). Dalam sesi, **tanpa email/token
  reset** — pembuktiannya kata sandi lama (`bcrypt.compare`). Rate limit scope
  `passwordChange` (5/10 menit per pengguna). Hash baru memakai bcrypt cost 12,
  sama dengan register & login. Respons tidak pernah mengembalikan hash.

---

## 5. Cara memeriksa setelah mengubah UI

```powershell
npm run typecheck   # tipe
npm run lint        # gaya
npm test            # 356 tes (logika tak berubah)
npm run build       # daftar rute harus benar
```

Saat `npm run build`, pastikan daftar rute memuat `/` (landing) dan
`/dashboard`, `/calendar`, `/profile`, `/credentials`,
`/report-templates`, `/history`, `/automation`, `/admin`,
`/dev-tools` (app). Tidak boleh ada rute `/(app)/...` yang tampil.

### Jebakan: logout

Tombol Keluar memakai Server Action di `src/components/sign-out-action.ts`
(`signOut({ redirectTo: "/" })`). **Jangan** kembalikan ke
`<form action="/api/auth/signout" method="post">` — tanpa CSRF token NextAuth
menolaknya dan sesi tidak benar-benar terhapus.

Jangan menulis `"use server"` inline di dalam file `"use client"` (seperti
`app-sidebar.tsx`): Turbopack gagal build dengan pesan menyesatkan soal
`"use client"`. Taruh action di file `.ts` terpisah.

### Jebakan: cache `.next` basi

Setelah memindah/rename file, `.next` bisa menyimpan rute dan tipe lama sehingga
`tsc`/`build` melaporkan error "module not found" untuk path yang sudah tidak
ada. Hapus `.next` lalu build ulang. Juga: tutup tab VS Code yang menunjuk file
yang sudah dipindah, kalau tidak editor melaporkan error hantu.

### Jebakan: encoding file

Jangan mengedit file `.tsx`/`.md` memakai `Set-Content` PowerShell **tanpa**
`-Encoding utf8`. Tanpa itu, karakter seperti `—` (em dash) bisa rusak menjadi
satu byte liar dan membuat `next build` gagal dengan pesan
`invalid utf-8 sequence`. Lebih aman memakai editor yang menyimpan UTF-8.

---

## 6. Yang belum dikerjakan (kandidat putaran berikutnya)

- Dashboard utama dengan **kartu statistik + tabel + grafik** (data sudah
  tersedia di `Report`/`SubmitLog`, tanpa migrasi).
- Halaman **admin**: daftar pengguna, audit log lintas pengguna.
- Foto avatar / bio / data magang (mis. NIM, periode) — **butuh migrasi Prisma**
  karena kolomnya belum ada.
