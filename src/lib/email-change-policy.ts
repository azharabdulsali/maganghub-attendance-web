// src/lib/email-change-policy.ts — aturan keputusan ubah email (MURNI).
//
// Kenapa dipisah: route `/api/account/email` bercampur dengan I/O (bcrypt, DB),
// sehingga sulit diuji tanpa menjalankan Prisma. Dua keputusan yang benar-benar
// menentukan keamanan diekstrak ke sini agar bisa diuji tuntas:
//
//   1. Normalisasi email — satu email harus punya SATU bentuk, sama seperti
//      jalur login (`auth.ts` memakai trim + lowercase). Kalau berbeda, akun
//      bisa tersimpan sebagai "Budi@X.com" lalu login gagal dengan "budi@x.com".
//   2. Guard eskalasi peran — pengguna non-admin TIDAK boleh menetapkan email
//      yang sama dengan ADMIN_EMAIL. Tanpa ini, mengganti email = menaikkan
//      diri jadi admin.
//
// Fungsi di sini tidak menyentuh DB atau rahasia; memanggilnya aman di mana saja.

/** Bentuk baku email untuk perbandingan & penyimpanan. */
export function normalisasiEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Bolehkah pemilik akun ini menetapkan `newEmail`?
 *
 * `isAdminEmailBaru` adalah hasil `isAdminEmail(newEmail)` dari lib/env.ts —
 * diteruskan sebagai boolean supaya fungsi ini tetap murni & mudah diuji tanpa
 * menyentuh env.
 */
export function bolehUbahKeEmail(
  role: string,
  isAdminEmailBaru: boolean,
): boolean {
  // Admin boleh ke email mana pun (termasuk ADMIN_EMAIL — bisa jadi dia sendiri).
  if (role === "ADMIN") return true;
  // Non-admin tidak boleh mengklaim email admin.
  return !isAdminEmailBaru;
}