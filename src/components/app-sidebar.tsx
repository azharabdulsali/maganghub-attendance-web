"use client";

// src/components/app-sidebar.tsx: navigasi utama aplikasi.
//
// Alasan bentuknya begini:
//   - Satu komponen menangani dua tata letak: sidebar tetap di layar lebar
//     (md ke atas) dan laci geser (drawer) di layar kecil. Tidak ada dependensi
//     baru, hanya state React + kelas Tailwind, karena AGENTS.md §2 melarang
//     menambah paket tanpa alasan kuat.
//   - Menu BERSIFAT DATA (`MENU_*`), dipisah antara USER dan ADMIN. Peran
//     ditentukan di layout (server) lalu diturunkan sebagai prop `isAdmin`,
//     sehingga logika "siapa boleh melihat apa" tidak diduplikasi di klien.
//   - Penyorotan menu aktif memakai usePathname. Halaman root `/` dicocokkan
//     persis supaya tidak selalu ikut menyala saat berada di halaman lain.
//
// Catatan keamanan: sidebar ini HANYA menyembunyikan tautan. Penjagaan
// sesungguhnya tetap di server (layout + halaman masing-masing). Lihat
// docs/UI-LAYOUT.md §"Catatan keamanan".

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookText,
  CalendarCheck,
  CalendarDays,
  Clock,
  KeyRound,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";

type SidebarUser = {
  name: string | null;
  email: string;
  role: string;
  isAdmin: boolean;
};

type MenuItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Menu yang sama dilihat semua pengguna. Urutannya sengaja mengikuti alur
// kerja harian: lihat ringkasan → periksa kalender → siapkan template → kirim →
// periksa riwayat.
//
// Catatan rute: sejak perombakan struktur, hanya beranda yang tinggal di bawah
// /dashboard. Halaman lain memakai rute root (/calendar, /credentials, …)
// supaya URL lebih pendek & seragam. Jangan kembalikan ke /dashboard/… tanpa
// memindahkan berkas halamannya juga.
const MENU_UMUM: MenuItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Kalender", icon: CalendarDays },
  { href: "/credentials", label: "Kredensial Monev", icon: KeyRound },
  {
    href: "/report-templates",
    label: "Template Laporan",
    icon: BookText,
  },
  { href: "/history", label: "Riwayat Absensi", icon: CalendarCheck },
  { href: "/automation", label: "Otomasi", icon: Clock },
  { href: "/settings", label: "Pengaturan", icon: Settings },
];

// Menu khusus ADMIN. Saat ini alat diagnostik; ruang untuk halaman admin lain
// (kelola pengguna, audit lintas pengguna) terbuka di sini tanpa mengubah
// komponen lain.
const MENU_ADMIN: MenuItem[] = [
  { href: "/admin", label: "Panel Admin", icon: Users },
  { href: "/dev-tools", label: "Alat Diagnostik", icon: ShieldAlert },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: SidebarUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = user.isAdmin ? [...MENU_UMUM, ...MENU_ADMIN] : MENU_UMUM;

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-base border-2 border-border bg-main px-3 py-2 text-main-foreground shadow-shadow"
      >
        <CalendarCheck className="size-5" />
        <span className="font-heading text-base leading-tight">
          MagangHub
          <span className="block text-[11px] font-base opacity-90">
            Absensi Otomatis
          </span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1.5" aria-label="Navigasi utama">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-base border-2 px-3 py-2 text-sm font-base transition-all",
                active
                  ? "border-border bg-main text-main-foreground shadow-shadow"
                  : "border-transparent text-foreground/80 hover:border-border hover:bg-secondary-background",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="rounded-base border-2 border-border bg-secondary-background p-3">
        <Link
          href="/profile"
          onClick={onNavigate}
          className="flex items-center gap-2.5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-base border-2 border-border bg-background">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-heading">
              {user.name?.trim() || "Pengguna"}
            </span>
            <span className="block truncate text-xs text-foreground/60">
              {user.email}
            </span>
          </span>
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-base border-2 border-border px-2 py-0.5 text-[11px] font-heading",
              user.isAdmin
                ? "bg-main text-main-foreground"
                : "bg-background text-foreground",
            )}
          >
            {user.role}
          </span>
          <ThemeToggle />
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}

export function AppSidebar({ user }: { user: SidebarUser }) {
  const [open, setOpen] = useState(false);

  // Saat laci mobile terbuka: tutup dengan tombol Esc, dan kunci scroll
  // halaman di belakangnya supaya tidak "bocor" ikut bergeser.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      {/* Bilah atas khusus layar kecil: tombol hamburger.
          `pt-safe` + `pl-safe`/`pr-safe`: di iPhone landscape, poni bisa
          menutupi tepi atas/kiri-kanan; padding safe-area menjaga brand & tombol
          tetap terjangkau. Di perangkat tanpa poni nilainya 0. */}
      <header className="pt-safe pl-safe pr-safe sticky top-0 z-30 flex items-center justify-between gap-3 border-b-2 border-border bg-secondary-background px-4 py-3 md:hidden">
        <span className="font-heading">MagangHub Absensi</span>
        <Button
          variant="neutral"
          size="icon-sm"
          aria-label="Buka menu navigasi"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
      </header>

      {/* Sidebar tetap (desktop). */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r-2 border-border bg-background md:block">
        <SidebarContent user={user} />
      </aside>

      {/* Laci geser (mobile). Muncul dari KANAN, sama seperti tombolnya
          (hamburger ada di kanan header) supaya arahnya konsisten dan tidak
          membingungkan. Ditutup lewat tombol X, menekan latar gelap, atau Esc. */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-overlay/60"
            onClick={() => setOpen(false)}
          />
          <div className="pt-safe pb-safe pl-safe pr-safe absolute inset-y-0 right-0 w-72 max-w-[85%] animate-slide-in-right overflow-y-auto border-l-2 border-border bg-background shadow-xl">
            <div className="flex justify-end p-2">
              <Button
                variant="neutral"
                size="icon-sm"
                aria-label="Tutup menu"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

