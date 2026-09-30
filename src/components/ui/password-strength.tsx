"use client";

import { cn } from "@/lib/utils";
import type { StrengthLevel } from "@/lib/password-strength";

/**
 * Bilah kekuatan kata sandi (empat blok) + saran singkat.
 *
 * Kenapa empat blok, bukan satu bilah bertingkat: mata lebih cepat menangkap
 * "berapa dari empat yang menyala" daripada panjang relatif sebuah bilah.
 *
 * Kenapa warnanya TOKEN, bukan hijau/merah mentah: agar ikut tema. `kuat`
 * memakai warna `success` yang sama dengan grafik tren, `lemah` memakai
 * `destructive`. Warna BUKAN satu-satunya penanda, ada juga teks label, jadi
 * pengguna dengan buta warna tetap dapat informasinya (docs/UI-LAYOUT.md §5b).
 */
const LEVEL_STYLE: Record<
  Exclude<StrengthLevel, "kosong">,
  { isi: string; teks: string; label: string }
> = {
  lemah: { isi: "bg-destructive", teks: "text-destructive", label: "Lemah" },
  sedang: { isi: "bg-main", teks: "text-foreground/70", label: "Sedang" },
  kuat: { isi: "bg-success", teks: "text-success", label: "Kuat" },
};

export function PasswordStrength({
  skor,
  level,
  saran,
}: {
  skor: number;
  level: StrengthLevel;
  saran: string;
}) {
  // Belum ada isian → jangan tampilkan apa-apa supaya form tidak berisik.
  if (level === "kosong") return null;

  const gaya = LEVEL_STYLE[level];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div
          className="flex flex-1 gap-1"
          role="presentation"
          aria-hidden
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < skor ? gaya.isi : "bg-foreground/15",
              )}
            />
          ))}
        </div>
        <span className={cn("text-xs font-medium", gaya.teks)}>{gaya.label}</span>
      </div>
      {/* Diucapkan pembaca layar saat berubah; teks saran juga terlihat mata. */}
      <p className="text-xs text-foreground/60" aria-live="polite">
        {saran}
      </p>
    </div>
  );
}
