"use client";

import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Pesan error di bawah sebuah kolom input.
 *
 * Kenapa komponen (bukan `<p className="text-destructive">` di tiap form):
 * pesan validasi dulu bervariasi, ada yang pakai `text-xs`, ada `text-sm`,
 * dan tak satu pun punya ikon. Akibatnya pengguna yang tidak bisa membedakan
 * warna merah tidak melihat penanda apa pun bahwa kolom salah. Dengan satu
 * komponen, semua form otomatis konsisten: ikon + warna token + ukuran sama.
 *
 * Kenapa `role="alert"`: pesan ini muncul *setelah* pengguna mengetik, bukan
 * saat halaman dimuat. `role="alert"` membuat pembaca layar mengumumkannya
 * begitu muncul, tanpa itu pengguna tidak sadar ada error baru.
 *
 * `id` diteruskan agar kolom bisa menunjuk ke sini lewat `aria-describedby`
 * (lihat docs/UI-LAYOUT.md §5b).
 */
function FieldError({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn("flex items-center gap-1 text-xs text-destructive", className)}
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export { FieldError };
