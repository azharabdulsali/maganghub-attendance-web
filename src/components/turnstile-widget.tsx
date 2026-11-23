"use client";

// src/components/turnstile-widget.tsx: widget CAPTCHA Cloudflare Turnstile.
//
// Kenapa komponen terpisah: halaman login dan daftar sama-sama membutuhkannya,
// dan pemuatan skrip Turnstile hanya boleh terjadi SEKALI per halaman.
//
// Aturan yang dipegang:
//   - Bila site key kosong, komponen tidak merender apa pun dan server juga
//     tidak memeriksa (lihat `turnstileConfigured()` di src/lib/env.ts).
//   - Token bersifat sekali pakai & kedaluwarsa 5 menit. Karena itu induk harus
//     menaikkan `resetSignal` setiap submit gagal; widget akan dibuang dan
//     dipasang ulang dengan token baru.
//   - Tidak ada state di sini: token hanya diteruskan ke induk lewat `onToken`.

import { useEffect, useRef } from "react";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Satu janji pemuatan skrip untuk seluruh halaman (bukan satu per komponen). */
let janjiSkrip: Promise<void> | null = null;

function muatSkrip(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (janjiSkrip) return janjiSkrip;

  janjiSkrip = new Promise<void>((resolve, reject) => {
    const skrip = document.createElement("script");
    skrip.src = SCRIPT_SRC;
    skrip.async = true;
    skrip.onload = () => resolve();
    skrip.onerror = () => {
      // Jangan simpan kegagalan selamanya: percobaan berikutnya boleh mengulang.
      janjiSkrip = null;
      skrip.remove();
      reject(new Error("Skrip pemeriksaan keamanan gagal dimuat."));
    };
    document.head.appendChild(skrip);
  });

  return janjiSkrip;
}

export function TurnstileWidget({
  onToken,
  resetSignal = 0,
  className,
}: {
  /** Dipanggil dengan token, atau `null` saat kedaluwarsa/gagal. */
  onToken: (token: string | null) => void;
  /** Naikkan angka ini untuk membuang widget lama dan memasang yang baru. */
  resetSignal?: number;
  className?: string;
}) {
  const kontainerRef = useRef<HTMLDivElement | null>(null);
  // Disimpan di ref supaya indentitas callback induk yang berubah tiap render
  // tidak memicu pemasangan ulang widget (yang akan menghapus token).
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!SITE_KEY) return;

    const kontainer = kontainerRef.current;
    if (!kontainer) return;

    let hidup = true;
    let widgetId: string | null = null;

    muatSkrip()
      .then(() => {
        if (!hidup || !kontainer || !window.turnstile) return;
        widgetId = window.turnstile.render(kontainer, {
          sitekey: SITE_KEY,
          // BUKAN "auto": mode gelap aplikasi ini berbasis kelas `.dark`
          // (cookie `tema`), sedangkan "auto" mengikuti preferensi OS. Pengguna
          // yang memilih tema gelap di OS terang akan melihat kotak CAPTCHA
          // putih menyilaukan di tengah form gelap. Kelas dibaca saat widget
          // dipasang, jadi hasilnya sama dengan tema yang sedang tampil.
          theme: document.documentElement.classList.contains("dark")
            ? "dark"
            : "light",
          size: "flexible",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "timeout-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        // Biarkan kosong: server tetap menolak dengan pesan yang bisa
        // dimengerti pengguna, bukan widget yang diam-diam "lolos".
        onTokenRef.current(null);
      });

    return () => {
      hidup = false;
      onTokenRef.current(null);
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Widget sudah hilang bersama DOM; tidak ada yang perlu dibersihkan.
        }
      }
    };
  }, [resetSignal]);

  if (!SITE_KEY) return null;

  return <div ref={kontainerRef} className={className} />;
}
