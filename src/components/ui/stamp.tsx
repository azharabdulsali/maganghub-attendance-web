import * as React from "react";

import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/admin";

/**
 * "Cap" status, satu-satunya elemen yang sengaja dimiringkan di aplikasi ini.
 *
 * Dipakai HANYA untuk status pengiriman (terkirim / belum / gagal), bukan
 * untuk label umum. Karena itu ia boleh memakai huruf kapital dan sedikit
 * rotasi: itu memang bentuk cap karet, bukan gaya yang dipakai berulang di
 * seluruh halaman. Bila dipakai untuk semua label, elemen ini kehilangan
 * maknanya dan berubah menjadi hiasan.
 */
const TONE_CLASS: Record<Tone, string> = {
  good: "text-success",
  bad: "text-destructive",
  neutral: "text-foreground",
};

export function Stamp({
  tone = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      data-slot="stamp"
      className={cn(
        "inline-flex -rotate-2 items-center gap-1.5 rounded-base border-2 border-current px-2.5 py-1 font-heading text-[0.6875rem] leading-none tracking-[0.14em] uppercase",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
