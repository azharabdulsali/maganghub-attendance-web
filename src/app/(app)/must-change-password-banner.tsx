// src/app/(app)/must-change-password-banner.tsx: spanduk wajib ganti sandi.
//
// Muncul ketika admin baru mengatur ulang kata sandi pengguna (`mustChangePassword`
// = true di DB, terbaca lewat sesi). Sifatnya mengingatkan, bukan memblokir:
// memblokir seluruh aplikasi menuntut penjagaan di middleware dan berisiko
// mengunci pengguna di luar halaman yang justru dibutuhkan. Yang penting pesan
// ini jelas dan tombolnya mengarah tepat ke formulir ganti kata sandi.

import Link from "next/link";

import { cn } from "@/lib/utils";

export function MustChangePasswordBanner() {
  return (
    <div
      role="status"
      className={cn(
        "border-b-2 border-border bg-yellow-100 px-4 py-3 text-sm text-black",
        "dark:bg-yellow-900/40 dark:text-yellow-50",
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-heading font-bold">
          Kata sandi Anda baru diatur ulang oleh admin.
        </span>
        <span>
          Demi keamanan, segera ganti dengan kata sandi pilihan Anda sendiri.
        </span>
        <Link
          href="/settings"
          className="rounded-base border-2 border-border bg-main px-3 py-1 font-heading text-sm text-main-foreground"
        >
          Ganti kata sandi
        </Link>
      </div>
    </div>
  );
}
