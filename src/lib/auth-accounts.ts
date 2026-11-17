// src/lib/auth-accounts.ts: aturan murni akun tanpa kata sandi (login Google).
//
// Akun yang dibuat lewat Google tidak punya `passwordHash`. Dua hal bergantung
// pada fakta itu dan harus dinilai dengan aturan yang SAMA di semua jalur:
// login kata sandi, ubah kata sandi (boleh membuat sandi pertama), dan ubah
// email (butuh sandi sebagai bukti). Karena itu logikanya dipisah ke sini dan
// diuji tanpa DB, bukan ditulis ulang sebagai `if` di tiap route.

export type Peran = "USER" | "ADMIN";

/**
 * True bila akun ini punya kata sandi yang benar-benar bisa dipakai.
 * String kosong diperlakukan sebagai tidak ada (bukan sandi kosong yang sah).
 */
export function hasPassword(
  user: { passwordHash?: string | null } | null | undefined,
): boolean {
  return typeof user?.passwordHash === "string" && user.passwordHash.length > 0;
}

/**
 * Peran efektif untuk sebuah email saat login OAuth.
 *
 * Email yang cocok dengan ADMIN_EMAIL selalu menjadi ADMIN, termasuk akun yang
 * baru pertama kali masuk lewat Google. Email lain mempertahankan peran yang
 * sudah ada di DB (naik/turun peran oleh admin tidak boleh dibatalkan diam-diam
 * hanya karena orangnya memakai Google).
 */
export function effectiveRoleForEmail(
  email: string | null | undefined,
  isAdminEmail: (email: string) => boolean,
  currentRole: Peran | null | undefined,
): Peran {
  if (email && isAdminEmail(email.trim().toLowerCase())) return "ADMIN";
  return currentRole === "ADMIN" ? "ADMIN" : "USER";
}
