// src/app/(app)/dashboard/layout.tsx — kerangka halaman setelah login.
//
// Kenapa ada route group `(app)`:
//   Semua halaman terlindungi tinggal di bawah /dashboard/*, dan tiap halaman
//   dulu menyusun kepala + navigasinya sendiri-sendiri. Sekarang sidebar
//   dipasang SEKALI di sini, jadi navigasi tidak lagi berbeda antar halaman.
//   Tanda kurung `(app)` hanya nama grup: ia TIDAK muncul di URL, jadi file
//   ini melayani /dashboard (bukan /(app)/dashboard). Landing publik tetap di
//   "/" lewat src/app/page.tsx — lihat SPEC.md §5.8.
//
// Pemeriksaan sesi sengaja dilakukan di sini (bukan di tiap halaman) supaya
// tidak ada satu halaman pun yang bisa lupa memeriksa. Bila belum masuk,
// langsung dilempar ke /login.
//
// PENTING (jangan diubah tanpa berpikir): "/" adalah landing PUBLIK. Jangan
// arahkan pengguna yang sudah login ke "/" dari sini — itu memantulkan mereka
// ke landing lagi. Tujuan setelah login adalah "/dashboard".

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";

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
      <AppSidebar user={user} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
