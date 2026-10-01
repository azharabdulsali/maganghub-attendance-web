import Link from "next/link";

// Navigasi halaman (Sebelumnya / Berikutnya + "Halaman X dari Y").
//
// Diekstrak karena pola HTML-nya identik di 3 tabel (admin ×2, riwayat) —
// menyalinnya lagi hanya menambah tempat yang bisa menyimpang satu sama lain.
// Komponen ini HANYA menyusun tautan; perhitungan halaman (jumlah halaman,
// penjepitan page di luar rentang) tetap dilakukan `paginate()` di
// src/lib/audit-log.ts yang murni & teruji.
//
// Kalau hanya ada satu halaman, komponen ini sengaja merender null: kontrol
// halaman yang tak bisa dipakai hanya menambah bising.
export default function Pagination({
  page,
  pageCount,
  buildHref,
  label,
}: {
  /** Halaman yang sedang tampil (1-based). */
  page: number;
  /** Total halaman; 1 berarti tidak ada navigasi. */
  pageCount: number;
  /** Susun URL untuk nomor halaman tertentu (mempertahankan filter aktif). */
  buildHref: (page: number) => string;
  /** Label aksesibilitas, mis. "Navigasi halaman audit". */
  label: string;
}) {
  if (pageCount <= 1) return null;

  const linkClass =
    "inline-flex items-center rounded-base border-2 border-border bg-secondary-background px-3 py-1 text-sm font-heading";

  return (
    <nav
      className="mt-4 flex items-center justify-between gap-3"
      aria-label={label}
    >
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className={linkClass}>
          ← Sebelumnya
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-foreground/60">
        Halaman {page} dari {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={buildHref(page + 1)} className={linkClass}>
          Berikutnya →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
