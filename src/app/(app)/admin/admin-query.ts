// src/app/(app)/admin/admin-query.ts: pengambilan data halaman admin.
//
// Semua query di sini HANYA MEMBACA dan sengaja dipisah dari halaman supaya
// halaman tetap ringkas (pola sama seperti stats-query.ts). Bentuk hasilnya
// mengikuti tipe di src/lib/admin.ts yang murni & teruji.
//
// Kenapa tidak pakai `include` bertingkat untuk hitungan? Karena menghitung
// jumlah di database (`_count`) jauh lebih murah daripada menarik semua baris
// lalu menghitungnya di Node, penting begitu jumlah pengguna bertambah.

import { prisma } from "@/lib/prisma";
import type { AdminUserRow } from "@/lib/admin";

/**
 * Ambil daftar pengguna beserta ringkasan aktivitas masing-masing.
 * Diurutkan: admin dulu, lalu yang paling baru bergabung.
 */
export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      credential: { select: { status: true } },
      template: { select: { id: true } },
      automation: { select: { isEnabled: true } },
      _count: { select: { reports: true, submitLogs: true } },
      submitLogs: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    credentialStatus: u.credential?.status ?? null,
    hasTemplate: u.template !== null,
    automationEnabled: u.automation?.isEnabled ?? false,
    reportCount: u._count.reports,
    submitCount: u._count.submitLogs,
    lastSubmitAt: u.submitLogs[0]?.createdAt ?? null,
  }));
}
