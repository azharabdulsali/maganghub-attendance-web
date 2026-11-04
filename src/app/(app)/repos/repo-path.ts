// src/app/(app)/repos/repo-path.ts: mengurai jalur repo dari URL clone.
//
// Dipisah dari `repo-form.tsx` supaya bisa diuji tanpa memasang React. Modul ini
// murni (tanpa I/O, tanpa `Date`), sama seperti `commit-learning.ts`.

/**
 * Ambil `owner/repo` dari URL clone yang salah tempel.
 *
 * Pengguna hampir selalu menyalin URL dari tombol "Clone" GitLab/GitHub,
 * padahal kolom ini minta jalur polos. Dua bentuk yang paling sering:
 *   git@gitlab.com:azhar/jadwal-app.git
 *   https://gitlab.com/azhar/jadwal-app.git
 *
 * Mengembalikan `null` bila teks sudah berupa jalur polos (tidak perlu diubah),
 * supaya pemanggil bisa membedakan "bukan URL" dari "URL yang berhasil diurai".
 * Sisa `.git` dibuang karena bukan bagian dari nama repo di API.
 */
export function repoPathFromCloneUrl(teks: string): string | null {
  const t = teks.trim();
  if (!t) return null;

  // Bentuk SSH: `git@host:owner/repo.git`
  const ssh = /^[\w.-]+@[^:/\s]+:(.+)$/.exec(t);
  let jalur: string | null = ssh ? ssh[1] : null;

  // Bentuk URL: `https://host/owner/repo.git` (host apa pun, agar GitLab
  // self-hosted tetap terbaca).
  if (!jalur && /^https?:\/\//i.test(t)) {
    try {
      const url = new URL(t);
      jalur = decodeURIComponent(url.pathname);
    } catch {
      return null;
    }
  }

  if (!jalur) return null;

  const bersih = jalur
    .replace(/^\/+/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  return bersih.includes("/") ? bersih : null;
}
