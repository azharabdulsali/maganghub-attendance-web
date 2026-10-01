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

/** Satu pilihan pengguna pada filter audit, sudah siap dipakai di dropdown. */
export interface AuditUserOption {
  /** Id user, dipakai sebagai nilai `?user=`. */
  id: string;
  /** Email untuk ditampilkan; unik, jadi tak perlu id di label. */
  email: string;
}

/**
 * Ambil daftar pengguna yang BERMAKNA untuk filter audit: hanya yang punya
 * minimal satu SubmitLog.
 *
 * Kenapa tidak memakai `getAdminUsers()` saja? Karena itu mengembalikan SEMUA
 * pengguna (termasuk yang belum pernah submit), dan memasukkannya ke dropdown
 * hanya menghasilkan pilihan yang tabelnya pasti kosong. Selain itu, pengguna
 * yang sudah di-soft-delete TIDAK ada di `getAdminUsers()` (difilter
 * `deletedAt: null`), padahal log auditnya masih ada dan tetap muncul di tabel —
 * tanpa ikut didaftarkan di sini, log mereka jadi tak bisa difilter sama sekali.
 *
 * `groupBy` memakai indeks @@index([userId, createdAt]) pada SubmitLog, jadi
 * tetap murah walau log sudah banyak.
 */
export async function getAuditUserOptions(): Promise<AuditUserOption[]> {
  const grouped = await prisma.submitLog.groupBy({
    by: ["userId"],
  });

  if (grouped.length === 0) return [];

  const ids = grouped.map((g) => g.userId);
  const users = await prisma.user.findMany({
    // Sengaja TANPA `deletedAt: null`: user terhapus yang masih punya log harus
    // tetap bisa dipilih, kalau tidak barisnya mustahil disaring.
    where: { id: { in: ids } },
    select: { id: true, email: true },
  });

  // Urut A→Z berdasarkan email agar posisi tiap pengguna stabil antar muat.
  return users
    .map((u) => ({ id: u.id, email: u.email }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Ambil SEMUA pengguna beserta ringkasan aktivitas masing-masing.
 * Diurutkan: admin dulu, lalu yang paling baru bergabung.
 *
 * Sengaja mengembalikan seluruh daftar, bukan satu halaman: kartu statistik di
 * atas halaman (`summarizeUsers`) butuh hitungan LINTAS semua pengguna, jadi
 * memaginasi query ini akan membuat angka ringkasan salah (hanya menghitung
 * halaman yang tampil). Tabelnya sendiri dipaginasi di memori dengan data yang
 * sama, sehingga ringkasan dan tabel dijamin berasal dari sumber identik.
 *
 * Bila suatu saat jumlah pengguna tumbuh besar, ganti ini dengan `count` +
 * agregat di database dan paginasi tabel via `skip`/`take`; tapi jangan
 * sekarang — itu menambah jalur query kedua yang harus dijaga tetap sinkron.
 */
export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    // Pengguna yang di-soft-delete tidak ditampilkan lagi.
    where: { deletedAt: null },
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
