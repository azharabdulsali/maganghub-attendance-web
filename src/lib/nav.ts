// src/lib/nav.ts: logika penyorotan menu sidebar.
//
// Dipisah dari components/app-sidebar.tsx (Client Component) supaya bisa diuji
// tanpa merender React, dan supaya aturannya punya satu tempat yang jelas.
// Diuji di src/lib/nav.test.ts.

/** Item menu minimal yang dibutuhkan logika ini (hanya href). */
export type NavItem = { href: string };

/**
 * Apakah `href` cocok PERSIS dengan `pathname`, atau `pathname` berada DI
 * BAWAH `href` (segmen berikutnya). Contoh untuk pathname "/admin/holidays":
 *   - "/admin/holidays" → true (persis)
 *   - "/admin"          → true (induk)
 *   - "/adminx"         → false (bukan segmen, hanya awalan huruf)
 */
export function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Pilih SATU href menu yang paling spesifik cocok dengan `pathname`.
 *
 * Masalah yang dipecahkan: `/admin` dan `/admin/holidays` dua-duanya cocok saat
 * kita di `/admin/holidays` (karena yang kedua berada di bawah yang pertama).
 * Kalau tiap item diuji sendiri-sendiri, induk DAN anak sama-sama menyala.
 *
 * Aturannya "href terpanjang menang": untuk kasus di atas hanya
 * "/admin/holidays" yang menyala. Bila tak ada yang cocok → null.
 */
export function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    if (!matchesPath(pathname, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
