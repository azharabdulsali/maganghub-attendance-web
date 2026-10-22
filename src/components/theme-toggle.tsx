"use client";

// src/components/theme-toggle.tsx: sakelar terang/gelap (R-21).
//
// Kenapa dibuat:
//   `globals.css` sudah punya palet gelap, tetapi sebelum ini tidak ada satu pun
//   jalan bagi pengguna untuk memicunya.
//
// Keputusan penting:
//   - TIDAK menambah paket (next-themes dll). Cukup class di <html> + cookie,
//     karena tema awal sudah diputuskan SERVER: RootLayout membaca cookie `tema`
//     dan memasang kelas `.light`/`.dark`, sedangkan `globals.css` menulis kedua
//     palet berdampingan lewat light-dark(). Jadi tidak ada <script> anti-flicker
//     dan tidak ada kedipan saat memuat ulang. Riwayat keputusan ada di
//     src/app/layout.tsx.
//   - Cookie ditulis di sini tiap kali tombol ditekan, supaya pemuatan halaman
//     BERIKUTNYA sudah benar sejak byte pertama (tanpa JS pra-paint).
//   - localStorage tetap ditulis sebagai cadangan untuk sinkronisasi antar-tab
//     (`storage` event tidak terpicu oleh perubahan cookie).
//   - Tidak ada mode "system": tanpa kelas/cookie, tema mengikuti OS lewat
//     `color-scheme: light dark` di globals.css.

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";

type Tema = "light" | "dark";

const KUNCI = "tema";

/** Pilihan tema yang sedang berlaku: kelas <html> dulu, lalu preferensi OS. */
function temaAktif(): Tema {
  if (typeof document === "undefined") return "light";
  const akar = document.documentElement;
  if (akar.classList.contains("dark")) return "dark";
  if (akar.classList.contains("light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function terapkan(baru: Tema) {
  const akar = document.documentElement;
  akar.classList.toggle("dark", baru === "dark");
  akar.classList.toggle("light", baru === "light");
}

/** Simpan pilihan agar server memasang kelas yang benar pada muat berikutnya. */
function simpanPilihan(tema: Tema) {
  try {
    window.localStorage.setItem(KUNCI, tema);
  } catch {
    // Mode privat / storage penuh: tema tetap berlaku untuk sesi ini.
  }
  // Cookie bukan rahasia dan bukan HttpOnly (ditulis JavaScript), 1 tahun.
  document.cookie = `${KUNCI}=${tema}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Pasang kelas `.theme-transition` sebentar, ganti tema, lalu lepas lagi.
 *
 * Kelasnya sengaja tidak permanen di <html>: tema sudah benar sejak paint
 * pertama (kelas `.light`/`.dark` dipasang server dari cookie), dan transisi
 * warna global saat itu akan "menganimasikan" pemuatan awal (justru
 * memunculkan kedipan). Dengan dipasang-lepas di sini, animasi hanya terjadi
 * ketika pengguna menekan tombol.
 */
function gantiTemaDenganTransisi(terapkan: () => void) {
  const akar = document.documentElement;
  const kurangiGerak = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (kurangiGerak) {
    terapkan();
    return;
  }
  akar.classList.add("theme-transition");
  terapkan();
  window.setTimeout(() => akar.classList.remove("theme-transition"), 240);
}

function ThemeToggle() {
  // TIDAK ada state React di sini. Server tidak tahu tema saat merender
  // komponen ini, jadi keadaan tema TIDAK boleh masuk output render: kalau
  // masuk, server menulis ikon terang sedangkan klien tahu gelap dan React
  // melaporkan "Hydration failed". Karena itu ikon dipilih CSS
  // (.ikon-tema-gelap / .ikon-tema-terang di globals.css) dan tombol hanya
  // memutar kelas <html> saat ditekan.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== KUNCI || !e.newValue) return;
      const baru: Tema = e.newValue === "dark" ? "dark" : "light";
      gantiTemaDenganTransisi(() => terapkan(baru));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ganti = useCallback(() => {
    const baru: Tema = temaAktif() === "dark" ? "light" : "dark";
    gantiTemaDenganTransisi(() => terapkan(baru));
    simpanPilihan(baru);
  }, []);

  return (
    <Button
      type="button"
      variant="neutral"
      size="icon-sm"
      onClick={ganti}
      aria-label="Ubah tema terang atau gelap"
      title="Ubah tema terang atau gelap"
    >
      <Moon className="ikon-tema-terang size-4" aria-hidden="true" />
      <Sun className="ikon-tema-gelap size-4" aria-hidden="true" />
    </Button>
  );
}

export { ThemeToggle };
