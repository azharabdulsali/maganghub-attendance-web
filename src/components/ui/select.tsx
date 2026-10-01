import * as React from "react";

import { cn } from "@/lib/utils";

// Select native (bukan komponen JS): di HP ia otomatis memakai pemilih bawaan
// OS (scroll wheel) yang paling nyaman, keyboard & screen reader dapat
// perilakunya gratis, dan tidak ada byte JS yang perlu dimuat.
//
// Satu-satunya JS yang kita tambahkan ada di pemanggil: `onChange` untuk
// auto-submit (lihat components/filter-bar.tsx). Karena itu filter BERGANTUNG
// pada JavaScript: bila JS mati, mengubah pilihan tidak mengirim apa pun. Tidak
// ada jalur cadangan <noscript>; lihat catatan trade-off di filter-bar.tsx.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        // `appearance-none` + latar panah sendiri supaya tampilannya seragam di
        // semua browser, tapi tetap <select> asli di mata keyboard/AT.
        "h-10 w-full appearance-none rounded-base border-2 border-border bg-secondary-background bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat px-3 py-2 pr-9 text-sm font-base text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{
        // Chevron digambar sebagai SVG inline (data URI) agar tidak perlu file
        // ikon/dependensi tambahan dan ikut warna `currentColor` via mask tidak
        // diperlukan karena panah cukup satu warna netral.
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    />
  );
}

export { Select };
