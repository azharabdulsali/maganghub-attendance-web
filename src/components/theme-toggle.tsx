"use client";

// src/components/theme-toggle.tsx: sakelar terang/gelap (R-21).
//
// Kenapa dibuat:
//   `globals.css` sudah punya blok `.dark` lewat `@custom-variant dark`, tetapi
//   sebelum ini tidak ada satu pun jalan bagi pengguna untuk memicunya, jadi
//   seluruh token gelap itu kode mati. Komponen ini menutup celah itu.
//
// Keputusan penting:
//   - TIDAK menambah paket (next-themes dll). AGENTS.md §2 melarang paket baru
//     tanpa alasan kuat; ini hanya butuh toggle class di <html> + localStorage,
//     yang bisa ditulis sendiri dalam ~40 baris.
//   - Preferensi BUKAN milik server. Nilai awal dibaca dari <script> anti-flicker
//     di layout (lihat src/app/layout.tsx). Komponen ini hanya menyinkronkan
//     state React ke class <html> dan localStorage.
//   - Item disimpan di localStorage dengan kunci "theme". Nilai "light"/"dark";
//     tidak ada "system" supaya perilaku bisa diprediksi dan tidak ada dua sumber
//     kebenaran (media query vs pilihan pengguna).

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Tema = "light" | "dark";

const KUNCI = "theme";

function temaAktif(): Tema {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function ThemeToggle() {
  // State awal meniru apa yang sudah dipasang skrip anti-flicker, jadi render
  // pertama klien cocok dengan DOM dan tidak ada mismatch hidrasi.
  const [tema, setTema] = useState<Tema>(temaAktif);

  // Sinkronkan bila tab lain mengubah tema (dua tab terbuka sekaligus).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== KUNCI || !e.newValue) return;
      const baru = e.newValue === "dark" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", baru === "dark");
      setTema(baru);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ganti = useCallback(() => {
    const baru: Tema = temaAktif() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", baru === "dark");
    try {
      window.localStorage.setItem(KUNCI, baru);
    } catch {
      // Mode privat / storage penuh: tema tetap berganti untuk sesi ini,
      // hanya tidak tersimpan. Tidak perlu mengganggu pengguna.
    }
    setTema(baru);
  }, []);

  const gelap = tema === "dark";

  return (
    <Button
      type="button"
      variant="neutral"
      size="icon-sm"
      onClick={ganti}
      aria-pressed={gelap}
      aria-label={gelap ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
      title={gelap ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
    >
      {gelap ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}

export { ThemeToggle };
