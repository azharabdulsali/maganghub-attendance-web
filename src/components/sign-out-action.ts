"use server";

// src/components/sign-out-action.ts — Server Action untuk keluar (logout).
//
// Kenapa dipisah ke file sendiri, bukan ditulis inline di app-sidebar.tsx:
//   app-sidebar.tsx adalah Client Component ("use client"). Menyisipkan
//   direktif "use server" di dalamnya membuat Turbopack bingung dan menolak
//   build dengan pesan menyesatkan ("'use client' directive must be placed
//   before other expressions"). Aturannya: satu file, satu direktif.
//
// Cara benar memanggil signOut NextAuth v5: lewat objek yang diekspor dari
// lib/auth (bukan POST mentah ke /api/auth/signout, yang akan ditolak karena
// tanpa CSRF sehingga sesi tidak benar-benar terhapus).
//
// `redirectTo: "/"` mengembalikan pengguna ke landing publik setelah keluar.

import { signOut } from "@/lib/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
