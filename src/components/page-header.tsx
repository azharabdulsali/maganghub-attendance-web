import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Judul halaman yang dipakai SEMUA halaman di dalam aplikasi.
 *
 * Sebelumnya setiap halaman menulis ulang pola yang sama
 * (`h1 text-2xl sm:text-3xl` + satu paragraf `text-muted-foreground`), sehingga
 * semua halaman terasa seperti template yang sama. Komponen ini menyatukan
 * pola itu menjadi satu "kepala buku absen": judul besar, satu garis tebal di
 * bawahnya, dan ruang untuk aksi di kanan.
 *
 * Garis bawah BUKAN hiasan: ia memisahkan identitas halaman dari isinya,
 * seperti garis pada formulir cetak, dan membuat judul tidak perlu bayangan
 * atau warna tambahan untuk terasa penting.
 */
export function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
}: {
  title: string;
  description?: string;
  /** Penanda kecil di samping judul, mis. lencana "Admin". */
  badge?: React.ReactNode;
  /** Aksi kanan (tautan, tombol). Tidak wajib. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 border-b-2 border-border pb-5", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl leading-[1.05] sm:text-4xl">
              {title}
            </h1>
            {badge}
          </div>
          {description ? (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
