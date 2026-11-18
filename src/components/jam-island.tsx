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
//     `aria-hidden`, kalau tidak, pembaca layar akan mengumumkan detik tanpa
//     henti. Sebagai gantinya ada <span> tersembunyi berisi tanggal + jam:menit
//     yang hanya berubah tiap menit.
//   - Tidak ada animasi berulang di sini (dulu ada titik berdenyut). Cap waktu
//     yang berkedip terus-menerus di tepi layar menarik mata dari isi halaman,
//     dan `prefers-reduced-motion` jadi tidak perlu diurus sama sekali.

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
    <div
      // Satu-satunya elemen sticky di area konten (bilah header mobile kini
      // ikut tergulir, lihat src/components/app-sidebar.tsx). Menempel paling
      // atas di semua breakpoint. `pt-safe` + `top-0`: di perangkat berponi jam
      // tetap turun sejauh tinggi poni dan tidak tertutup. Lihat
      // docs/UI-LAYOUT.md §3b.
      className="pt-safe sticky top-0 z-20 flex justify-center pointer-events-none"
    >
      <div
        // Bentuknya sengaja datar: kotak bersudut `rounded-base`, latar penuh,
        // tanpa bayangan dan tanpa blur. Pil melengkung + kaca buram adalah pola
        // yang bisa dipakai aplikasi apa pun; di sini jam dibaca sebagai cap
        // waktu yang menempel di atas halaman, sejalan dengan sisa tampilan.
        className={cn(
          "pointer-events-auto mt-2 inline-flex items-center gap-2",
          "rounded-base border-2 border-border bg-secondary-background px-3 py-1",
          "font-heading text-xs tabular-nums sm:text-sm",
        )}
      >
        {/* Bagian visual: berdetak tiap detik → disembunyikan dari pembaca layar. */}
        <span className="contents" aria-hidden="true">
          {/* Penanda tetap, bukan titik berdenyut: cap waktu tidak perlu
              berkedip untuk membuktikan dirinya hidup. */}
          <span className="size-2 shrink-0 rounded-none bg-main" />
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
