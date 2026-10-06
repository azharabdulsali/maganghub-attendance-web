// src/app/(app)/admin/holidays/page.tsx: kelola tanggal libur (KHUSUS ADMIN).
//
// Libur di sini menentukan KAPAN otomasi melewati sebuah tanggal: `decide()`
// (report-policy.ts) memakai himpunan dari tabel `holidays` untuk memutuskan
// SKIPPED vs ALLOW. Karena itu perubahan di halaman ini langsung memengaruhi
// perilaku kirim — lihat SPEC.md §11B.
//
// ⚠️ Penjagaan sesungguhnya ada di SERVER (guard di bawah): sesi tanpa
// `role === "ADMIN"` dialihkan ke /dashboard. Item sidebar hanya menyembunyikan
// tautan, bukan pengaman (lihat components/app-sidebar.tsx).

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/admin";
import { todayInJakarta } from "@/lib/submit-service";
import { loadHolidayRows } from "@/lib/holidays-repo";
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
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <span className="inline-flex items-center rounded-base border-2 border-border bg-main px-3 py-1 text-xs font-heading text-main-foreground">
          ADMIN
        </span>
        <h1 className="mt-3 font-heading text-3xl">Hari Libur &amp; Tanggal Merah</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Tanggal yang didaftarkan di sini akan <strong>dilewati</strong> oleh
          otomasi pengiriman laporan, sama seperti Sabtu &amp; Minggu. Akhir
          pekan sudah otomatis libur dan tidak perlu didaftarkan.
        </p>
      </div>

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
