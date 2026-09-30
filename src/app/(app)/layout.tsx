// src/app/(app)/layout.tsx: kerangka halaman setelah login.
//
// Kenapa ada route group `(app)`:
//   Semua halaman terlindungi tinggal di dalam grup ini, dan tiap halaman
//   dulu menyusun kepala + navigasinya sendiri-sendiri. Sekarang sidebar
//   dipasang SEKALI di sini, jadi navigasi tidak lagi berbeda antar halaman.
//   Tanda kurung `(app)` hanya nama grup: ia TIDAK muncul di URL.
//
//   Sebelumnya layout ini tinggal di (app)/dashboard/layout.tsx sehingga hanya
//   membungkus /dashboard/*. Ketika halaman lain dipindah ke root (/history,
//   /credentials, /calendar, …), berkas ini dinaikkan ke (app)/ supaya SEMUA
// halaman terlindungi (bukan hanya yang di bawah /dashboard) tetap dapat
//   sidebar dan penjagaan sesi yang sama.
//
// Pemeriksaan sesi sengaja dilakukan di sini (bukan di tiap halaman) supaya
// tidak ada satu halaman pun yang bisa lupa memeriksa. Bila belum masuk,
// langsung dilempar ke /login.
//
// PENTING (jangan diubah tanpa berpikir): "/" adalah landing PUBLIK (lihat
// src/app/page.tsx: di LUAR grup ini). Jangan arahkan pengguna yang sudah
// login ke "/" dari sini, itu memantulkan mereka ke landing lagi. Tujuan
// setelah login adalah "/dashboard".

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";

// Semua halaman di grup ini WAJIB `noindex` (audit T-4). Redirect di bawah
// adalah penjaga keamanan; noindex adalah sinyal SEO yang tegas supaya isi
// terlindungi tidak pernah muncul di hasil pencarian, bahkan bila crawler
// kebetulan memegang sesi atau redirect di-cache.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "USER";
  const user = {
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    role,
    isAdmin: role === "ADMIN",
  };

  return (
    <div className="min-h-dvh md:flex">
      {/*
        Tautan "lompat ke konten": TERSEMBUNYI sampai difokus lewat Tab.
        Kenapa perlu: setiap halaman di grup ini diawali sidebar 6 menu (di
        layar kecil bahkan tombol hamburger lebih dulu). Tanpa tautan ini,
        pengguna keyboard/pembaca layar harus melewati seluruh navigasi di
        SETIAP perpindahan halaman sebelum tiba di isi. Ini memperbaiki sekaligus
        semua halaman terlindungi. Lihat docs/UI-LAYOUT.md §5b.
      */}
      <a
        href="#konten"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]",
          "focus:rounded-base focus:border-2 focus:border-border focus:bg-main",
          "focus:px-3 focus:py-2 focus:font-heading focus:text-sm focus:text-main-foreground",
        )}
      >
        Lompat ke konten utama
      </a>
      <AppSidebar user={user} />
      <main id="konten" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
