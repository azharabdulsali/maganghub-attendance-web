// src/lib/session-version.ts: logika keputusan generasi sesi (MURNI).
//
// Kenapa dipisah: callback `jwt` di `src/lib/auth.ts` bercampur dengan I/O
// (query DB), sehingga sulit diuji tanpa menjalankan Prisma. Keputusan yang
// sebenarnya diambil, "token ini masih satu generasi dengan DB?" dan "nilai
// versi dari klien boleh dipercaya?", diekstrak ke sini sebagai fungsi murni
// supaya bisa diuji tuntas.
//
// Model ancaman yang dicegah:
//   - Setelah ganti kata sandi / "keluar dari semua perangkat", JWT lama harus
//     berhenti berlaku walau tanda tangannya masih valid (token belum
//     kedaluwarsa). Ini yang disebut "session invalidation".
//   - Klien boleh mengirim `sessionVersion` baru lewat `useSession().update()`
//     untuk memperbarui sesinya sendiri. Karena datang dari klien, nilainya
//     TIDAK dipercaya apa adanya, hanya angka bulat >= 0 yang diterima.

/**
 * Apakah token masih satu generasi dengan nilai di DB?
 *
 * Ketidakcocokan berarti sesi sudah dicabut dari tempat lain (ganti kata sandi
 * atau tombol "keluar dari semua perangkat").
 */
export function sesiMasihSah(
  versiToken: unknown,
  versiDb: number,
): boolean {
  return typeof versiToken === "number" && versiToken === versiDb;
}

/**
 * Ambil `sessionVersion` yang dikirim klien lewat `useSession().update(...)`.
 *
 * Mengembalikan angka bila valid, atau `null` bila tidak. Pemanggil sebaiknya
 * mengabaikan nilai `null` (biarkan token apa adanya), bukan menganggapnya 0,
 * karena itu justru bisa menurunkan generasi sesi.
 */
export function versiSesiDariKlien(session: unknown): number | null {
  const v = (session as { sessionVersion?: unknown } | null | undefined)
    ?.sessionVersion;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return null;
  return v;
}

/**
 * Ambil `mustChangePassword` yang dikirim klien lewat `useSession().update(...)`.
 *
 * Dipakai setelah pengguna berhasil mengganti kata sandinya sendiri: klien
 * mengirim `false` supaya spanduk "wajib ganti" hilang tanpa perlu login ulang.
 *
 * Karena datang dari klien, hanya nilai boolean yang diterima; selain itu
 * `null` (abaikan). Perhatikan arahnya yang AMAN: klien diizinkan menurunkan
 * flag ini (`true → false`) — itu memang yang diinginkan setelah ganti sandi —
 * sedangkan sumber kebenaran sesungguhnya tetap DB pada permintaan berikutnya
 * (callback `jwt` menimpa dari kolom setiap kali token diverifikasi).
 */
export function wajibGantiDariKlien(session: unknown): boolean | null {
  const v = (session as { mustChangePassword?: unknown } | null | undefined)
    ?.mustChangePassword;
  return typeof v === "boolean" ? v : null;
}
