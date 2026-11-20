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
//   - Penyorotan menu aktif memakai usePathname, tapi ATURANNYA tinggal di
//     src/lib/nav.ts (activeHref): hanya SATU menu menyala, yaitu href yang
//     paling spesifik cocok. Ini mencegah induk & anak (mis. "/admin" dan
//     "/admin/holidays") menyala bersamaan. Rute root "/" tidak ikut menyala
//     di halaman lain karena hanya dicocokkan persis.
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
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Clock,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Settings,
  ShieldAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { activeHref } from "@/lib/nav";
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

// Menu yang sama dilihat semua pengguna, dikelompokkan agar 9 tautan tidak
// tampil sebagai satu daftar rata yang sulit dipindai. Urutannya mengikuti alur
// kerja harian: lihat ringkasan → periksa kalender → siapkan template → kirim →
// periksa riwayat.
//
// Catatan rute: sejak perombakan struktur, hanya beranda yang tinggal di bawah
// /dashboard. Halaman lain memakai rute root (/calendar, /credentials, …)
// supaya URL lebih pendek & seragam. Jangan kembalikan ke /dashboard/… tanpa
// memindahkan berkas halamannya juga.
type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const MENU_UMUM_GROUPS: MenuGroup[] = [
  {
    label: "Harian",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/calendar", label: "Kalender", icon: CalendarDays },
      { href: "/history", label: "Riwayat Absensi", icon: CalendarCheck },
    ],
  },
  {
    label: "Persiapan",
    items: [
      { href: "/credentials", label: "Kredensial Monev", icon: KeyRound },
      { href: "/work-schedule", label: "Jadwal Kerja", icon: CalendarClock },
      {
        href: "/report-templates",
        label: "Template Laporan",
        icon: BookText,
      },
      // "(Opsional)" ditulis di label, bukan disembunyikan di tooltip: sebagian
      // besar peserta tidak memakai git, dan menu di grup "Persiapan" terbaca
      // seperti langkah wajib. Menyembunyikan menunya butuh preferensi DB baru,
      // jadi label terang-terangan lebih jujur dan cukup.
      { href: "/repos", label: "Repo Git (Opsional)", icon: GitBranch },
      { href: "/automation", label: "Otomasi", icon: Clock },
    ],
  },
  {
    label: "Lainnya",
    items: [
      { href: "/feedback", label: "Kritik & Saran", icon: MessageSquarePlus },
      { href: "/settings", label: "Pengaturan", icon: Settings },
    ],
  },
];

// Menu khusus ADMIN. Panel Admin (kelola pengguna + audit) dan Hari Libur
// (kelola tanggal merah yang dilewati otomasi) adalah fitur nyata; Alat
// Diagnostik pelengkap. Ruang untuk halaman admin lain terbuka di sini tanpa
// mengubah komponen lain.
const MENU_ADMIN_GROUP: MenuGroup = {
  label: "Admin",
  items: [
    { href: "/admin", label: "Panel Admin", icon: Users },
    { href: "/admin/holidays", label: "Hari Libur", icon: CalendarOff },
    { href: "/admin/feedback", label: "Kritik & Saran", icon: MessageSquare },
    { href: "/dev-tools", label: "Alat Diagnostik", icon: ShieldAlert },
  ],
};

function SidebarContent({
  user,
  onNavigate,
}: {
  user: SidebarUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = user.isAdmin
    ? [...MENU_UMUM_GROUPS, MENU_ADMIN_GROUP]
    : MENU_UMUM_GROUPS;
  // Daftar rata hanya untuk menentukan menu aktif. Hanya SATU menu yang menyala,
  // yaitu yang href-nya paling spesifik cocok dengan rute saat ini (lihat
  // activeHref). Tanpa ini "Panel Admin" ikut menyala saat kita berada di
  // "/admin/holidays".
  const current = activeHref(
    pathname,
    groups.flatMap((group) => group.items),
  );

  return (
    // `min-h-0 flex-1`: sidebar setinggi layar dan TIDAK boleh ikut memanjang
    // mengikuti isi menu. Tanpa ini, admin dengan 11 menu mendorong blok
    // identitas + tombol Keluar ke bawah viewport, dan karena sidebar `sticky`
    // bagian itu tak pernah bisa dijangkau, logout seolah hilang.
    <div className="flex min-h-0 flex-1 flex-col gap-5 p-4">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex shrink-0 items-center gap-2.5 rounded-base border-2 border-border bg-main px-3 py-2.5 text-main-foreground"
      >
        <CalendarCheck className="size-5 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="font-heading text-base leading-tight">
            MagangHub
          </span>
          <span className="truncate text-[0.6875rem] leading-tight">
            Absensi otomatis
          </span>
        </span>
      </Link>

      {/* `min-h-0 overflow-y-auto`: SATU-SATUNYA bagian yang menggulir. Footer
          (identitas, tema, Keluar) diberi `shrink-0` di bawah supaya selalu
          terlihat.

          Tiap kelompok menu dibuka oleh satu garis tipis + nama kelompok,
          seperti judul bab pada indeks buku. Sebelumnya kelompok hanya berupa
          teks redup berukuran 11px yang mudah terlewat, sehingga 11 tautan
          admin tampak sebagai satu daftar rata. */}
      <nav
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-1"
        aria-label="Navigasi utama"
      >
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="mb-1.5 border-b-2 border-border pb-1.5 font-heading text-xs text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = item.href === current;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-base px-3 py-2 font-heading text-sm transition-colors",
                    active
                      ? "bg-main text-main-foreground"
                      : "text-foreground hover:bg-background",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Kaki sidebar tanpa kotak: satu garis atas memisahkan identitas dari
          navigasi, sama seperti garis pada formulir. Kotak bergaris di dalam
          panel bergaris hanya menambah bingkai tanpa menambah arti. */}
      <div className="shrink-0 border-t-2 border-border pt-3">
        <Link
          href="/profile"
          onClick={onNavigate}
          className="flex items-center gap-2.5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-base border-2 border-border bg-background">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-heading text-sm">
              {user.name?.trim() || "Pengguna"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </span>
        </Link>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-base border-2 border-border px-2 py-0.5 font-heading text-[0.6875rem]",
              user.isAdmin
                ? "bg-main text-main-foreground"
                : "bg-background text-foreground",
            )}
          >
            {user.isAdmin ? "Admin" : "Peserta"}
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
          tetap terjangkau. Di perangkat tanpa poni nilainya 0.

          SENGAJA TIDAK sticky (dulu `sticky top-0 z-30`). Hanya jam
          (src/components/jam-island.tsx) yang boleh menempel; bilah ini ikut
          tergulir hilang ke atas agar layar sempit tidak dimakan dua baris
          sticky sekaligus. Jam tetap `z-20` > konten, dan header `z-30` hanya
          berlaku saat ia masih terlihat (tidak menutupi apa pun karena tidak
          lagi mengambang). Lihat docs/UI-LAYOUT.md §3b. */}
      <header className="pt-safe pl-safe pr-safe z-30 flex items-center justify-between gap-3 border-b-2 border-border bg-secondary-background px-4 py-2 md:hidden">
        {/* `min-w-0` + `truncate`: tanpa ini nama panjang bisa mendorong/menabrak
            tombol hamburger di layar sempit (flex item default tak boleh menyusut
            di bawah lebar kontennya). Tombol diberi `shrink-0` agar selalu utuh. */}
        <span className="min-w-0 truncate font-heading">
          MagangHub Autoabsen
        </span>
        <Button
          variant="neutral"
          size="icon-sm"
          className="shrink-0"
          title="Buka menu navigasi"
          aria-label="Buka menu navigasi"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
      </header>

      {/* Sidebar tetap (desktop). */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r-2 border-border bg-secondary-background md:flex">
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
          <div className="pt-safe pb-safe pl-safe pr-safe absolute inset-y-0 right-0 flex w-72 max-w-[85%] animate-slide-in-right flex-col overflow-hidden border-l-2 border-border bg-secondary-background">
            <div className="flex justify-end p-2">
              <Button
                variant="neutral"
                size="icon-sm"
                title="Tutup menu"
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

