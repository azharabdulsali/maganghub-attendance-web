"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/toast";

/**
 * Rute yang TIDAK boleh dilaporkan apa adanya ke Vercel Analytics.
 *
 * Aplikasi ini menangani data sensitif (kredensial Monev terenkripsi, presensi,
 * panel admin). Vercel Analytics menyimpan URL halaman apa pun yang dikunjungi;
 * kita tidak ingin path seperti `/credentials` atau `/admin/...` — apalagi
 * kalau nanti ada id di dalamnya — terbaca dari dasbor. `beforeSend` dipanggil
 * sebelum tiap event dikirim: `null` = event dibatalkan sepenuhnya.
 *
 * Pencocokan memakai prefix path; `/admin` juga menangkap `/admin/holidays`,
 * dst. Menambah rute sensitif baru cukup tambahkan di sini.
 */
const PATH_SENSITIF = ["/credentials", "/admin", "/profile", "/dev-tools"];

function ruteSensitif(path: string): boolean {
  return PATH_SENSITIF.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function sebelumKirim(event: BeforeSendEvent) {
  try {
    const url = new URL(event.url, window.location.origin);
    if (ruteSensitif(url.pathname)) return null;
  } catch {
    // URL relatif/aneh: jangan gagal, cukup lanjutkan event apa adanya.
  }
  return event;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Toast tersedia di seluruh aplikasi (login, dashboard, dll).
          `Toaster` (registry neobrutalism) merender provider + viewport
          sekaligus; `ToastProvider` saja tidak menampilkan apa pun. */}
      <Toaster>{children}</Toaster>
      {/* Vercel Web Analytics. `beforeSend` meredaksi rute sensitif (lihat
          `PATH_SENSITIF`). Skripnya dimuat same-origin di Vercel; CSP
          `connect-src` di src/lib/security-headers.ts sudah mengizinkan
          endpoint intake-nya. Di lokal data hanya tampil di konsol, tidak
          dikirim ke mana pun. */}
      <Analytics beforeSend={sebelumKirim} />
    </SessionProvider>
  );
}