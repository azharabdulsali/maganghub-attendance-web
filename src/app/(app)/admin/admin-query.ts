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
import {
  labelForAuditUserOption,
  type AdminUserRow,
  type AuditUserOption,
} from "@/lib/admin";
import { assessTodayRun, jakartaDayRange } from "@/lib/admin-automation";
import type { SubmitStatus } from "@/generated/prisma/enums";

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
    select: { id: true, email: true, name: true },
  });

  // Urut A→Z berdasarkan LABEL YANG TAMPIL (nama, atau email bila nama kosong),
  // bukan email: dropdown kini menyajikan nama, jadi urutannya harus mengikuti
  // apa yang dibaca admin. Memakai `labelForAuditUserOption` yang sama dengan
  // yang dipakai halaman menjamin label dan pengurutan tidak pernah berbeda.
  return users
    .map((u) => ({ id: u.id, name: u.name, email: u.email }))
    .sort((a, b) =>
      labelForAuditUserOption(a).localeCompare(
        labelForAuditUserOption(b),
        "id",
      ),
    );
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
export async function getAdminUsers(now: Date = new Date()): Promise<AdminUserRow[]> {
  // Batas hari WIB untuk menentukan "sudah jalan hari ini". Bila `now` tak sah
  // (tidak seharusnya), jatuh ke null → log hari ini tidak diambil, status
  // ditampilkan "Belum" ketimbang salah menandai.
  const dayRange = jakartaDayRange(now);

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
      automation: { select: { isEnabled: true, hour: true, minute: true } },
      _count: { select: { reports: true, submitLogs: true } },
      submitLogs: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // Log HARI INI (semua status) untuk menilai "sudah dijalankan atau belum".
  //
  // Kenapa query TERPISAH, bukan nested select pada User: Prisma tidak
  // mengizinkan satu relasi (`submitLogs`) muncul dua kali dalam satu `select`,
  // jadi kita tidak bisa sekaligus "ambil 1 log terbaru" (untuk `lastSubmitAt`)
  // dan "ambil semua log hari ini". Satu query `submitLog` untuk semua user di
  // halaman ini jauh lebih murah daripada query per-user, dan hasilnya
  // dikelompokkan di memori. Bila rentang hari tak sah, lewati (semua "Belum").
  const todayByUser = new Map<string, { status: SubmitStatus; createdAt: Date }[]>();
  if (dayRange && users.length > 0) {
    const todayLogs = await prisma.submitLog.findMany({
      where: {
        userId: { in: users.map((u) => u.id) },
        createdAt: { gte: dayRange.start, lt: dayRange.end },
      },
      select: { userId: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    for (const log of todayLogs) {
      const list = todayByUser.get(log.userId);
      if (list) list.push(log);
      else todayByUser.set(log.userId, [log]);
    }
  }

  return users.map((u) => {
    const verdict = assessTodayRun(todayByUser.get(u.id) ?? [], now);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      credentialStatus: u.credential?.status ?? null,
      hasTemplate: u.template !== null,
      automationEnabled: u.automation?.isEnabled ?? false,
      automationHour: u.automation?.hour ?? null,
      automationMinute: u.automation?.minute ?? null,
      reportCount: u._count.reports,
      submitCount: u._count.submitLogs,
      lastSubmitAt: u.submitLogs[0]?.createdAt ?? null,
      todayRunStatus: verdict.status,
      todayRunAt: verdict.lastAt,
    };
  });
}
