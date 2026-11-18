// src/app/(app)/admin/holidays/page.tsx: kelola tanggal libur (KHUSUS ADMIN).
//
// Libur di sini menentukan KAPAN otomasi melewati sebuah tanggal: `decide()`
// (report-policy.ts) memakai himpunan dari tabel `holidays` untuk memutuskan
// SKIPPED vs ALLOW. Karena itu perubahan di halaman ini langsung memengaruhi
// perilaku kirim, lihat SPEC.md §11B.
//
// ⚠️ Penjagaan sesungguhnya ada di SERVER (guard di bawah): sesi tanpa
// `role === "ADMIN"` dialihkan ke /dashboard. Item sidebar hanya menyembunyikan
// tautan, bukan pengaman (lihat components/app-sidebar.tsx).

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/admin";
import { todayInJakarta } from "@/lib/submit-service";
import { loadHolidayRows } from "@/lib/holidays-repo";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { HolidaysManager } from "./holidays-manager";

export default async function AdminHolidaysPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;
  if (!isAdminRole(role)) {
    redirect("/dashboard");
  }

  const rows = await loadHolidayRows();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Hari Libur & Tanggal Merah"
        badge={<Badge className="bg-main text-main-foreground">Admin</Badge>}
        description="Tanggal ini dilewati otomasi, sama seperti Sabtu & Minggu."
      />

      {/* `key` dari data server: saat `router.refresh()` mengambil daftar baru,
          `key` berubah → komponen dipasang ulang dengan `initialRows` segar.
          Ini cara idiomatik menyetel ulang state komponen klien tanpa efek
          `setState` (yang dilarang lint). Lihat catatan di holidays-manager.tsx. */}
      <HolidaysManager
        key={rows.map((r) => `${r.id}:${r.date}:${r.name}`).join("|")}
        initialRows={rows}
        today={todayInJakarta()}
      />
    </div>
  );
}
