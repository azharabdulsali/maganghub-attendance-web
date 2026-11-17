"use client";

// Tombol "Masuk dengan Google" (login Google opsional, docs/GOOGLE-LOGIN.md).
//
// Komponen ini menyembunyikan dirinya bila server belum dikonfigurasi: daftar
// penyedia diambil dari /api/auth/providers (sumber kebenaran Auth.js), bukan
// dari env di klien. Jadi tidak mungkin ada tombol yang menuntun ke halaman
// error hanya karena Client ID lupa diisi.

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function GoogleSignInButton({ label }: { label: string }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let aktif = true;
    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, unknown> | null) => {
        if (aktif) setEnabled(Boolean(data && "google" in data));
      })
      .catch(() => {
        // Gagal memeriksa = jangan tampilkan tombol. Login kata sandi tetap ada.
      });
    return () => {
      aktif = false;
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center gap-3" aria-hidden>
        <span className="h-0.5 flex-1 bg-border" />
        <span className="text-xs text-foreground/60">atau</span>
        <span className="h-0.5 flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="neutral"
        className="w-full"
        disabled={loading}
        title={loading ? "Menghubungkan ke Google…" : label}
        aria-label={label}
        onClick={() => {
          setLoading(true);
          void signIn("google", { callbackUrl: "/dashboard" });
        }}
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <GoogleMark />
        )}
        {loading ? "Menghubungkan..." : label}
      </Button>
    </div>
  );
}

/** Logo "G" Google. Ikon merek tidak ada di lucide-react. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8v3.1h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3.1c-1 .7-2.4 1.2-4 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.2C3.2 21.3 7.3 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.2a7.2 7.2 0 0 1 0-4.4V6.6H1.3a12 12 0 0 0 0 10.8l4-3.2z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3 .8 3.7 1.4l3.4-3.3C17.9 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.6l4 3.2c.9-2.9 3.6-5 6.7-5z"
      />
    </svg>
  );
}
