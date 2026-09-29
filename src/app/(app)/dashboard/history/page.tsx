// src/app/dashboard/history/page.tsx — riwayat audit log submit (Tahap 5).
//
// Server component: memeriksa sesi, mengambil SubmitLog milik pengguna (paling
// baru 100), lalu menampilkan ringkasan + tabel. Semua pemformatan diserahkan
// ke lib/audit-log.ts yang murni dan teruji.
//
// Prinsip (SPEC.md §7, §10): setiap percobaan submit PASTI tercatat di sini —
// sukses, duplikat, maupun gagal. Halaman ini adalah bukti "sudah dikirim" bila
// disengketakan, jadi TIDAK ada tombol edit/hapus di sini.

import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, toneForBadgeVariant } from "@/components/ui/badge";
import {
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimestamp,
  paginate,
  parsePage,
  parseStatusFilter,
  summarizeLogs,
  STATUS_FILTER_LABELS,
  STATUS_FILTERS,
  type StatusFilter,
} from "@/lib/audit-log";
import type { SubmitStatus } from "@/generated/prisma/enums";

/** Jumlah baris per halaman. */
const PAGE_SIZE = 20;

/** Bangun URL halaman ini dengan filter & nomor halaman tertentu. */
function historyUrl(status: StatusFilter, page: number): string {
  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/dashboard/history?${qs}` : "/dashboard/history";
}

type HistoryPageProps = {
  // Di Next.js 16, `searchParams` adalah Promise yang harus di-await.
  searchParams: Promise<{ status?: string; page?: string }>;
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const statusFilter = parseStatusFilter(params.status);
  const requestedPage = parsePage(params.page);

  // Filter diterapkan di database, bukan di memori: dengan begitu paginasi
  // menghitung jumlah halaman dari hasil yang sudah tersaring — angka di
  // tombol halaman selalu cocok dengan isi tabel.
  const where = {
    userId: session.user.id,
    ...(statusFilter === "ALL"
      ? {}
      : { status: statusFilter as SubmitStatus }),
  };

  const [totalFiltered, allForSummary] = await Promise.all([
    prisma.submitLog.count({ where }),
    // Ringkasan selalu dihitung dari SELURUH log (bukan satu halaman saja),
    // supaya angkanya tidak berubah-ubah saat berpindah halaman.
    prisma.submitLog.findMany({
      where: { userId: session.user.id },
      select: { status: true, createdAt: true },
    }),
  ]);

  const pageInfo = paginate(totalFiltered, requestedPage, PAGE_SIZE);

  const logs = await prisma.submitLog.findMany({
    where,
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
    },
  });

  const summary = summarizeLogs(allForSummary);
  const lastAt = summary.lastAt ? formatJakartaTimestamp(summary.lastAt) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Riwayat Absensi</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Catatan setiap percobaan kirim laporan. Sukses, duplikat, dan gagal
          semuanya tercatat — ini bukti resmi bila ada sengketa kehadiran.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total" value={summary.total} />
          <Stat label="Terkirim" value={summary.success} />
          <Stat label="Sudah ada" value={summary.duplicate} />
          <Stat label="Gagal" value={summary.failed} />
          <p className="col-span-2 text-xs text-foreground/60 sm:col-span-4">
            {lastAt
              ? `Percobaan terakhir: ${lastAt}`
              : "Belum ada percobaan kirim."}
          </p>
        </CardContent>
      </Card>

      {/* Filter status — tautan biasa yang mengubah URL, jadi tanpa JS dan
          bisa di-bookmark. Nilai aktif ditandai warna bg-main. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => {
          const active = filter === statusFilter;
          return (
            <Link
              key={filter}
              href={historyUrl(filter, 1)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center rounded-base border-2 border-border px-3 py-1 text-xs font-heading transition-colors ${
                active
                  ? "bg-main text-main-foreground"
                  : "bg-secondary-background text-foreground hover:bg-background"
              }`}
            >
              {STATUS_FILTER_LABELS[filter]}
            </Link>
          );
        })}
        {totalFiltered > 0 && (
          <span className="ml-auto text-xs text-foreground/60">
            {totalFiltered} catatan
          </span>
        )}
      </div>

      {logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-sm text-foreground/70">
            {statusFilter === "ALL"
              ? "Belum ada riwayat. Setelah Anda menekan “Kirim Absen”, catatan akan muncul di sini."
              : `Tidak ada catatan berstatus “${STATUS_FILTER_LABELS[statusFilter]}”.`}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border text-left text-xs text-foreground/60">
                  <th className="p-3 font-heading">Waktu</th>
                  <th className="p-3 font-heading">Status</th>
                  <th className="p-3 font-heading">Pemicu</th>
                  <th className="p-3 font-heading">HTTP</th>
                  <th className="p-3 font-heading">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const when = formatJakartaTimestamp(log.createdAt);
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-border/40 align-top last:border-b-0"
                    >
                      <td className="whitespace-nowrap p-3 text-xs text-foreground/70">
                        {when ?? "waktu tidak diketahui"}
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
                        {typeof log.httpCode === "number" ? log.httpCode : "—"}
                      </td>
                      <td className="p-3 text-xs text-foreground/80">
                        {log.message ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pageInfo.pageCount > 1 && (
        <nav
          className="mt-4 flex items-center justify-between gap-3"
          aria-label="Navigasi halaman riwayat"
        >
          {pageInfo.page > 1 ? (
            <Link
              href={historyUrl(statusFilter, pageInfo.page - 1)}
              className="inline-flex items-center rounded-base border-2 border-border bg-secondary-background px-3 py-1 text-sm font-heading"
            >
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-foreground/60">
            Halaman {pageInfo.page} dari {pageInfo.pageCount}
          </span>
          {pageInfo.page < pageInfo.pageCount ? (
            <Link
              href={historyUrl(statusFilter, pageInfo.page + 1)}
              className="inline-flex items-center rounded-base border-2 border-border bg-secondary-background px-3 py-1 text-sm font-heading"
            >
              Berikutnya →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

/** Kartu angka kecil untuk ringkasan. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-base border-2 border-border p-3">
      <p className="font-heading text-2xl">{value}</p>
      <p className="text-xs text-foreground/60">{label}</p>
    </div>
  );
}
