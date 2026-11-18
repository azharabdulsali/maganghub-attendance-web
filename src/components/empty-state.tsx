import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Keadaan kosong ("belum ada data") yang dipakai bersama.
 *
 * Kenapa dipisah: sebelumnya setiap halaman menulis sendiri kotak kosongnya,
 * dan hasilnya hanya satu baris teks abu-abu di dalam kotak bergaris putus-putus.
 * Di layar lebar itu terbaca seperti halaman yang GAGAL memuat, bukan halaman
 * yang memang belum punya data. Ikon + judul + satu kalimat penjelas membuat
 * bedanya jelas dalam sekali lihat, dan `action` memberi jalan keluar
 * (mis. tautan ke halaman yang harus diisi lebih dulu).
 *
 * Aturan tampilan: ikon memakai `text-muted-foreground` (bukan warna aksen),
 * karena keadaan kosong bukan peringatan dan bukan kesalahan. Jangan beri warna
 * merah/kuning di sini.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  /** Ikon lucide, mis. `<Inbox aria-hidden />`. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Satu tindakan berikutnya (tautan/tombol). Tidak wajib. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-base border-2 border-dashed border-border bg-secondary-background px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className="text-muted-foreground [&_svg]:size-8 [&_svg]:shrink-0"
        >
          {icon}
        </span>
      ) : null}
      <p className="font-heading text-base">{title}</p>
      {description ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
