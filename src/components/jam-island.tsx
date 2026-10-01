"use client";

// src/components/jam-island.tsx: jam dinding bergaya "dynamic island" di tengah
// atas area konten. Terlihat oleh semua peran (user & admin), sticky.
//
// Keputusan penting:
//   - HANYA dirender SETELAH mount (`sekarang === null` sebelum efek jalan).
//     Waktu server ≠ waktu klien, jadi merender jam di HTML awal pasti memicu
//     mismatch hidrasi. Karena itu ada ruang cadangan (lihat di bawah).
//   - TIDAK menambah paket. Cukup `Intl.DateTimeFormat` + interval 1 detik
//     (lihat src/lib/jam-dinding.ts). AGENTS.md §2 melarang paket baru tanpa
//     alasan kuat.
//   - Zona dikunci ke WIB, bukan zona perangkat, supaya semua orang melihat
//     acuan waktu yang sama.
//   - Aksesibilitas: bagian visual berdetak tiap detik dan ditandai
//     `aria-hidden` — kalau tidak, pembaca layar akan mengumumkan detik tanpa
//     henti. Sebagai gantinya ada <span> tersembunyi berisi tanggal + jam:menit
//     yang hanya berubah tiap menit.
//   - `prefers-reduced-motion` dihormati: titik "hidup" berhenti berdenyut.

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { LABEL_ZONA, formatJamWib } from "@/lib/jam-dinding";

function JamIsland() {
  const [sekarang, setSekarang] = useState<Date | null>(null);

  useEffect(() => {
    // setState SENGAJA hanya dipanggil dari dalam callback interval, bukan
    // sinkron di body effect (aturan react-hooks/set-state-in-effect). Callback
    // tetap dijalankan sekali di awal lewat timeout 0 supaya jam tidak kosong
    // selama satu detik penuh setelah hidrasi.
    const tick = () => setSekarang(new Date());
    const awal = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(awal);
      window.clearInterval(id);
    };
  }, []);

  const bagian = sekarang ? formatJamWib(sekarang) : null;

  return (
    <div className="pt-safe sticky top-0 z-20 flex justify-center pointer-events-none">
      <div
        // Bentuk pil ala dynamic island: penuh melengkung, tepi tegas, sedikit
        // bayangan + blur latar supaya tetap terbaca saat konten lewat di balik.
        className={cn(
          "pointer-events-auto mt-2 inline-flex items-center gap-2",
          "rounded-full border-2 border-border bg-background/85 px-4 py-1.5",
          "font-heading text-xs tabular-nums shadow-sm backdrop-blur-md sm:text-sm",
        )}
      >
        {/* Bagian visual: berdetak tiap detik → disembunyikan dari pembaca layar. */}
        <span className="contents" aria-hidden="true">
          <span className="relative flex size-2 shrink-0">
            {/* Titik "hidup" ala indikator kamera Dynamic Island. */}
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-main opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-main" />
          </span>
          <span className="whitespace-nowrap">
            {bagian ? (
              <>
                <span className="text-muted-foreground">{bagian.tanggal}</span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                <span className="font-semibold text-foreground">{bagian.jam}</span>
                <span className="ml-1 text-muted-foreground">{LABEL_ZONA}</span>
              </>
            ) : (
              // Ruang cadangan agar lebar/tinggi pil tidak "melompat" saat jam
              // muncul setelah hidrasi (menghindari layout shift).
              <span>&nbsp;</span>
            )}
          </span>
        </span>

        {/* Versi pembaca layar: berubah per menit (tanpa detik), jadi tidak
            mengumumkan tanpa henti. */}
        <span className="sr-only">
          {bagian
            ? `Sekarang ${bagian.tanggal}, pukul ${bagian.jam.slice(0, 5)} ${LABEL_ZONA}`
            : "Memuat jam"}
        </span>
      </div>
    </div>
  );
}

export { JamIsland };
