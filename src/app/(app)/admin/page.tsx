// src/app/(app)/admin/page.tsx: halaman admin (khusus ADMIN).
//
// Isi halaman ini, sesuai SPEC.md §4 ("Admin: kelola semua pengguna, lihat audit
// log, statistik"):
//   1. Ringkasan lintas pengguna (jumlah pengguna, admin, kredensial aktif, dst).
//   2. Tabel daftar pengguna + ringkasan aktivitas masing-masing.
//   3. Audit lintas pengguna (SubmitLog semua orang), dengan filter status yang
//      sama seperti halaman riwayat, supaya pengalaman tidak berbeda.
//
// Yang masih SENGAJA belum ada: mengubah peran dan memaksa submit. Keduanya
// mengubah data orang lain dan belum punya aturan yang aman.
//
// Sejak fitur ini, admin BISA mengatur ulang kata sandi pengguna dan
// menghapusnya (soft delete). Aturannya murni di src/lib/admin-user-actions.ts
// (diri sendiri & admin lain ditolak), tombolnya di ./user-actions.tsx, dan
// endpoint di /api/admin/users/[id]. Audit log SubmitLog tetap hanya-baca.
//
// ⚠️ Penjagaan sesungguhnya ada di sini (server) lewat pemeriksaan role. Sidebar
// hanya menyembunyikan tautan, lihat catatan di components/app-sidebar.tsx.

import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, toneForBadgeVariant } from "@/components/ui/badge";
import { getAdminUsers, getAuditUserOptions } from "./admin-query";
import { DispatchPanel } from "./dispatch-panel";
import { UserRowActions } from "./user-actions";
import { RunUserButton } from "./run-user-button";
import FilterBar from "@/components/filter-bar";
import Pagination from "@/components/pagination";
import {
  credentialStatusTone,
  describeCredentialStatus,
  initialsFor,
  isAdminRole,
  labelForAuditUserOption,
  summarizeUsers,
} from "@/lib/admin";
import { describeTodayRun, scheduleLabel, type TodayRunStatus } from "@/lib/admin-automation";
import {
  ALL_USERS,
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimeOnly,
  formatJakartaTimestamp,
  paginate,
  parsePage,
  parseRangeFilter,
  parseStatusFilter,
  parseUserFilter,
  rangeStartDate,
  RANGE_FILTER_LABELS,
  RANGE_FILTERS,
  STATUS_FILTER_LABELS,
  STATUS_FILTERS,
  type RangeFilter,
  type StatusFilter,
} from "@/lib/audit-log";
import type { SubmitStatus } from "@/generated/prisma/enums";

const AUDIT_PAGE_SIZE = 20;
const USER_PAGE_SIZE = 20;

/**
 * Bangun URL halaman admin. SEMUA parameter ikut dibawa eksplisit (status,
 * rentang, filter pengguna, dan KEDUA nomor halaman) supaya:
 *  - pindah halaman audit tidak diam-diam mengosongkan filter, dan
 *  - pindah halaman daftar pengguna tidak mereset halaman audit (tabel ini
 *    punya penomoran sendiri lewat `userPage`, terpisah dari `page`).
 * Halaman 1 = default, jadi tidak ditulis ke URL agar tautan tetap bersih.
 */
function adminUrl(opts: {
  status?: StatusFilter;
  range?: RangeFilter;
  userId?: string;
  page?: number;
  userPage?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== "ALL") params.set("status", opts.status);
  if (opts.range && opts.range !== "30d") params.set("range", opts.range);
  if (opts.userId && opts.userId !== ALL_USERS)
    params.set("user", opts.userId);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  if (opts.userPage && opts.userPage > 1)
    params.set("userPage", String(opts.userPage));
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

type AdminPageProps = {
  // Di Next.js 16, `searchParams` adalah Promise yang harus di-await.
  searchParams: Promise<{
    status?: string;
    range?: string;
    user?: string;
    page?: string;
    userPage?: string;
  }>;
};
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;
  if (!isAdminRole(role)) {
    redirect("/dashboard");
  }
  // Setelah guard di atas, id dijamin ada; disimpan supaya TS tidak mengeluh
  // di dalam JSX dan supaya perbandingan "diri sendiri" memakai satu sumber.
  const actorId = session.user.id;

  const params = await searchParams;
  const statusFilter = parseStatusFilter(params.status);
  const rangeFilter = parseRangeFilter(params.range);
  const userFilter = parseUserFilter(params.user);
  const requestedPage = parsePage(params.page);
  // Penomoran daftar pengguna sendiri. `parsePage` memakai ulang logika yang
  // sama: nilai tak sah jatuh ke 1, bukan error.
  const requestedUserPage = parsePage(params.userPage);

  // Batas bawah rentang di zona WIB (atau null untuk "Semua").
  const since = rangeStartDate(rangeFilter);

  const auditWhere = {
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(statusFilter === "ALL"
      ? {}
      : { status: statusFilter as SubmitStatus }),
    ...(userFilter === ALL_USERS ? {} : { userId: userFilter }),
  };

  const [users, totalAudit, userOptions] = await Promise.all([
    getAdminUsers(),
    prisma.submitLog.count({ where: auditWhere }),
    // Opsi filter pengguna dibangun dari log yang ada, bukan dari daftar
    // pengguna: pilihan yang pasti kosong tidak ada gunanya, dan user
    // ter-soft-delete tetap ikut supaya lognya bisa disaring.
    getAuditUserOptions(),
  ]);

  // Ringkasan & tabel pengguna berasal dari daftar yang SAMA (semua pengguna):
  // ringkasan menghitung seluruhnya, tabel menampilkan satu halaman saja.
  const summary = summarizeUsers(users);
  const userPageInfo = paginate(users.length, requestedUserPage, USER_PAGE_SIZE);
  const userRows = users.slice(userPageInfo.start, userPageInfo.end);

  const pageInfo = paginate(totalAudit, requestedPage, AUDIT_PAGE_SIZE);

  const auditLogs = await prisma.submitLog.findMany({
    where: auditWhere,
    orderBy: { createdAt: "desc" },
    skip: pageInfo.start,
    // `take` wajib >= 1; halaman kosong (0 baris) tidak boleh memakai take 0.
    take: Math.max(1, pageInfo.end - pageInfo.start),
    select: {
      id: true,
      status: true,
      message: true,
      httpCode: true,
      trigger: true,
      attempt: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <header className="mb-8">
        <span className="inline-flex items-center rounded-base border-2 border-border bg-main px-3 py-1 text-xs font-heading text-main-foreground">
          ADMIN
        </span>
        <h1 className="mt-3 font-heading text-3xl">Panel Admin</h1>
        <p className="mt-1 max-w-2xl text-sm text-foreground/70">
          Ringkasan seluruh pengguna, audit lintas pengguna, dan pengiriman
          massal. Tabel & audit bersifat hanya-baca; satu-satunya aksi yang
          mengubah data adalah tombol pengiriman massal di bawah (mengirim
          laporan atas nama user yang jadwalnya jatuh pada jam ini). Daftar
          hari libur dikelola terpisah di menu{" "}
          <Link
            href="/admin/holidays"
            className="font-heading underline underline-offset-4"
          >
            Hari Libur
          </Link>
          .
        </p>
      </header>

      <DispatchPanel />

      <section aria-label="Ringkasan" className="mb-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Total pengguna" value={summary.totalUsers} />
          <Stat label="Admin" value={summary.admins} />
          <Stat label="Kredensial aktif" value={summary.credentialActive} />
          <Stat label="Otomasi aktif" value={summary.automationEnabled} />
          <Stat label="Pernah submit" value={summary.everSubmitted} />
        </div>
      </section>

      <Card className="mb-10">
        <CardHeader>
          <CardTitle>Daftar pengguna ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {userRows.length === 0 ? (
            <p className="text-sm text-foreground/70">Belum ada pengguna.</p>
          ) : (
            <div
              className="-mx-3 overflow-x-auto"
              role="region"
              aria-label="Tabel daftar pengguna (dapat digulir)"
              tabIndex={0}
            >
              <table className="w-full min-w-[60rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="p-3 font-heading">Pengguna</th>
                    <th className="p-3 font-heading">Peran</th>
                    <th className="p-3 font-heading">Kredensial</th>
                    <th className="p-3 font-heading">Otomasi</th>
                    <th className="p-3 font-heading">Jadwal</th>
                    <th className="p-3 font-heading">Hari ini</th>
                    <th className="p-3 font-heading">Laporan</th>
                    <th className="p-3 font-heading">Submit</th>
                    <th className="p-3 font-heading">Terakhir kirim</th>
                    <th className="p-3 font-heading">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((u) => (
                    <tr
                      key={u.email}
                      className="border-b border-border/40 align-middle last:border-b-0"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="grid size-8 shrink-0 place-items-center rounded-base border-2 border-border bg-secondary-background text-xs font-heading"
                          >
                            {initialsFor(u)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-heading text-sm">
                              {u.name ?? "Tanpa nama"}
                            </span>
                            <span className="block truncate text-xs text-foreground/60">
                              {u.email}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge tone={isAdminRole(u.role) ? "good" : "neutral"}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge tone={credentialStatusTone(u.credentialStatus)}>
                          {describeCredentialStatus(u.credentialStatus)}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-foreground/70">
                        {u.automationEnabled ? "Aktif" : "Mati"}
                      </td>
                      <td className="whitespace-nowrap p-3 text-xs text-foreground/70">
                        {u.automationHour !== null && u.automationMinute !== null
                          ? scheduleLabel(u.automationHour, u.automationMinute)
                          : ","}
                      </td>
                      <td className="p-3">
                        <Badge tone={todayRunTone(u.todayRunStatus)}>
                          {describeTodayRun(u.todayRunStatus)}
                        </Badge>
                        {u.todayRunAt ? (
                          <span className="mt-1 block whitespace-nowrap text-[11px] text-foreground/60">
                            {formatJakartaTimeOnly(u.todayRunAt) ?? ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-xs text-foreground/70">
                        {u.reportCount}
                      </td>
                      <td className="p-3 text-xs text-foreground/70">
                        {u.submitCount}
                      </td>
                      <td className="whitespace-nowrap p-3 text-xs text-foreground/70">
                        {u.lastSubmitAt
                          ? (formatJakartaTimestamp(u.lastSubmitAt) ?? ",")
                          : "Belum pernah"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <UserRowActions
                            userId={u.id}
                            userEmail={u.email}
                            isSelf={u.id === actorId}
                            isAdmin={isAdminRole(u.role)}
                          />
                          <RunUserButton
                            userId={u.id}
                            name={u.name?.trim() || u.email}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={userPageInfo.page}
            pageCount={userPageInfo.pageCount}
            label="Navigasi halaman daftar pengguna"
            buildHref={(p) =>
              adminUrl({
                status: statusFilter,
                range: rangeFilter,
                userId: userFilter,
                page: pageInfo.page,
                userPage: p,
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit lintas pengguna</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filter rentang waktu, status, dan nama. Rentang ditulis lebih dulu
              karena memengaruhi jumlah data yang dihitung, baru status
              mempersempit di dalamnya. Satu form GET berisi ketiga <select>;
              memilih salah satu langsung menerapkan dan tidak menghapus filter
              lain. */}
          <div className="mb-4">
            <FilterBar
              fields={[
                {
                  name: "range",
                  label: "Rentang waktu",
                  value: rangeFilter,
                  options: RANGE_FILTERS.map((r) => ({
                    value: r,
                    label: RANGE_FILTER_LABELS[r],
                  })),
                },
                {
                  name: "status",
                  label: "Status",
                  value: statusFilter,
                  options: STATUS_FILTERS.map((s) => ({
                    value: s,
                    label: STATUS_FILTER_LABELS[s],
                  })),
                },
                {
                  name: "user",
                  label: "Nama",
                  value: userFilter,
                  options: [
                    { value: ALL_USERS, label: "Semua nama" },
                    ...userOptions.map((u) => ({
                      value: u.id,
                      // Nama, jatuh ke email bila pengguna belum mengisi nama.
                      // Aturan ini satu tempat di labelForAuditUserOption.
                      label: labelForAuditUserOption(u),
                    })),
                    // Jaring pengaman: bila id di URL tidak ada di daftar (mis.
                    // tautan lama, atau user yang lognya sudah tak ada), tetap
                    // tampilkan entri agar dropdown TIDAK diam-diam berpindah ke
                    // "Semua nama" sementara tabel sebenarnya tersaring.
                    ...(userFilter !== ALL_USERS &&
                      !userOptions.some((u) => u.id === userFilter)
                      ? [{ value: userFilter, label: "Nama terpilih" }]
                      : []),
                  ],
                },
              ]}
            />
          </div>

          {auditLogs.length === 0 ? (
            <p className="text-sm text-foreground/70">
              {userFilter === ALL_USERS
                ? "Tidak ada catatan audit untuk filter ini."
                : "Nama ini tidak punya catatan audit pada filter ini."}
            </p>
          ) : (
            <div
              className="-mx-3 overflow-x-auto"
              role="region"
              aria-label="Tabel audit lintas pengguna (dapat digulir)"
              tabIndex={0}
            >
              <table className="w-full min-w-[54rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="p-3 font-heading">Waktu</th>
                    <th className="p-3 font-heading">Nama</th>
                    <th className="p-3 font-heading">Email</th>
                    <th className="p-3 font-heading">Status</th>
                    <th className="p-3 font-heading">Pemicu</th>
                    <th className="p-3 font-heading">HTTP</th>
                    <th className="p-3 font-heading">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => {
                    const when = formatJakartaTimestamp(log.createdAt);
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-border/40 align-top last:border-b-0"
                      >
                        <td className="whitespace-nowrap p-3 text-xs text-foreground/70">
                          {when ?? "waktu tidak diketahui"}
                        </td>
                        <td className="max-w-[14rem] truncate p-3 text-xs text-foreground/80">
                          {log.user.name?.trim() || "Tanpa nama"}
                        </td>
                        <td className="max-w-[14rem] truncate p-3 text-xs text-foreground/60">
                          {log.user.email}
                        </td>
                        <td className="p-3">
                          <Badge tone={toneForBadgeVariant(badgeVariant(log.status))}>
                            {describeSubmitStatus(log.status)}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap p-3 text-xs text-foreground/70">
                          {describeTrigger(log.trigger)}
                          {log.attempt > 1 && ` (ke-${log.attempt})`}
                        </td>
                        <td className="p-3 text-xs text-foreground/70">
                          {typeof log.httpCode === "number" ? log.httpCode : ","}
                        </td>
                        <td className="p-3 text-xs text-foreground/80">
                          {log.message ?? ","}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={pageInfo.page}
            pageCount={pageInfo.pageCount}
            label="Navigasi halaman audit"
            buildHref={(p) =>
              adminUrl({
                status: statusFilter,
                range: rangeFilter,
                userId: userFilter,
                page: p,
                userPage: userPageInfo.page,
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Nada warna untuk badge "Hari ini": sudah hijau, gagal merah, belum netral. */
function todayRunTone(status: TodayRunStatus): "good" | "bad" | "neutral" {
  if (status === "SELESAI") return "good";
  if (status === "GAGAL") return "bad";
  return "neutral";
}

/** Kartu angka kecil untuk ringkasan admin. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-base border-2 border-border p-3">
      <p className="font-heading text-2xl">{value}</p>
      <p className="text-xs text-foreground/60">{label}</p>
    </div>
  );
}

