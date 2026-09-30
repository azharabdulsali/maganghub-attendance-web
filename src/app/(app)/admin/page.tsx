// src/app/(app)/admin/page.tsx: halaman admin (khusus ADMIN).
//
// Isi halaman ini, sesuai SPEC.md §4 ("Admin: kelola semua pengguna, lihat audit
// log, statistik"):
//   1. Ringkasan lintas pengguna (jumlah pengguna, admin, kredensial aktif, dst).
//   2. Tabel daftar pengguna + ringkasan aktivitas masing-masing.
//   3. Audit lintas pengguna (SubmitLog semua orang), dengan filter status yang
//      sama seperti halaman riwayat, supaya pengalaman tidak berbeda.
//
// Yang SENGAJA belum ada: mengubah peran, menghapus pengguna, memaksa submit.
// Ketiganya mengubah data orang lain dan belum punya backend/aturan yang aman;
// menambahkannya sebagai tombol kosong akan menjanjikan hal yang tidak ada.
// Halaman ini murni BACA, audit log adalah bukti, bukan data yang bisa diubah
// (SPEC.md §5.7).
//
// ⚠️ Penjagaan sesungguhnya ada di sini (server) lewat pemeriksaan role. Sidebar
// hanya menyembunyikan tautan, lihat catatan di components/app-sidebar.tsx.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, toneForBadgeVariant } from "@/components/ui/badge";
import { getAdminUsers } from "./admin-query";
import { DispatchPanel } from "./dispatch-panel";
import {
  credentialStatusTone,
  describeCredentialStatus,
  initialsFor,
  isAdminRole,
  summarizeUsers,
} from "@/lib/admin";
import {
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimestamp,
  paginate,
  parsePage,
  parseStatusFilter,
  STATUS_FILTER_LABELS,
  STATUS_FILTERS,
  type StatusFilter,
} from "@/lib/audit-log";
import type { SubmitStatus } from "@/generated/prisma/enums";

const AUDIT_PAGE_SIZE = 20;

/** Bangun URL halaman admin dengan filter & nomor halaman audit tertentu. */
function adminAuditUrl(status: StatusFilter, page: number): string {
  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

type AdminPageProps = {
  // Di Next.js 16, `searchParams` adalah Promise yang harus di-await.
  searchParams: Promise<{ status?: string; page?: string }>;
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

  const params = await searchParams;
  const statusFilter = parseStatusFilter(params.status);
  const requestedPage = parsePage(params.page);

  const auditWhere = {
    ...(statusFilter === "ALL"
      ? {}
      : { status: statusFilter as SubmitStatus }),
  };

  const [users, totalAudit] = await Promise.all([
    getAdminUsers(),
    prisma.submitLog.count({ where: auditWhere }),
  ]);

  const summary = summarizeUsers(users);
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
      user: { select: { email: true } },
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
          laporan atas nama user yang jadwalnya jatuh pada jam ini).
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
          {users.length === 0 ? (
            <p className="text-sm text-foreground/70">Belum ada pengguna.</p>
          ) : (
            <div
              className="-mx-3 overflow-x-auto"
              role="region"
              aria-label="Tabel daftar pengguna (dapat digulir)"
              tabIndex={0}
            >
              <table className="w-full min-w-[52rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="p-3 font-heading">Pengguna</th>
                    <th className="p-3 font-heading">Peran</th>
                    <th className="p-3 font-heading">Kredensial</th>
                    <th className="p-3 font-heading">Otomasi</th>
                    <th className="p-3 font-heading">Laporan</th>
                    <th className="p-3 font-heading">Submit</th>
                    <th className="p-3 font-heading">Terakhir kirim</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit lintas pengguna</CardTitle>
        </CardHeader>
        <CardContent>
          <nav
            className="mb-4 flex flex-wrap gap-2"
            aria-label="Filter status audit"
          >
            {STATUS_FILTERS.map((s) => (
              <a
                key={s}
                href={adminAuditUrl(s, 1)}
                aria-current={statusFilter === s ? "page" : undefined}
                className={`inline-flex items-center rounded-base border-2 border-border px-3 py-1 text-xs font-heading ${
                  statusFilter === s
                    ? "bg-main text-main-foreground"
                    : "bg-secondary-background text-foreground"
                }`}
              >
                {STATUS_FILTER_LABELS[s]}
              </a>
            ))}
          </nav>

          {auditLogs.length === 0 ? (
            <p className="text-sm text-foreground/70">
              Tidak ada catatan audit untuk filter ini.
            </p>
          ) : (
            <div
              className="-mx-3 overflow-x-auto"
              role="region"
              aria-label="Tabel audit lintas pengguna (dapat digulir)"
              tabIndex={0}
            >
              <table className="w-full min-w-[48rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="p-3 font-heading">Waktu</th>
                    <th className="p-3 font-heading">Pengguna</th>
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

          {pageInfo.pageCount > 1 && (
            <nav
              className="mt-4 flex items-center justify-between gap-3"
              aria-label="Navigasi halaman audit"
            >
              {pageInfo.page > 1 ? (
                <a
                  href={adminAuditUrl(statusFilter, pageInfo.page - 1)}
                  className="inline-flex items-center rounded-base border-2 border-border bg-secondary-background px-3 py-1 text-sm font-heading"
                >
                  ← Sebelumnya
                </a>
              ) : (
                <span />
              )}
              <span className="text-xs text-foreground/60">
                Halaman {pageInfo.page} dari {pageInfo.pageCount}
              </span>
              {pageInfo.page < pageInfo.pageCount ? (
                <a
                  href={adminAuditUrl(statusFilter, pageInfo.page + 1)}
                  className="inline-flex items-center rounded-base border-2 border-border bg-secondary-background px-3 py-1 text-sm font-heading"
                >
                  Berikutnya →
                </a>
              ) : (
                <span />
              )}
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
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

