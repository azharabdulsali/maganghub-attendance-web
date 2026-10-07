// src/app/(app)/history/page.tsx: riwayat audit log submit (Tahap 5).
//
// Server component: memeriksa sesi, mengambil SubmitLog milik pengguna (paling
// baru 100), lalu menampilkan ringkasan + tabel. Semua pemformatan diserahkan
// ke lib/audit-log.ts yang murni dan teruji.
//
// Prinsip (SPEC.md §7, §10): setiap percobaan submit PASTI tercatat di sini,
// sukses, duplikat, maupun gagal. Halaman ini adalah bukti "sudah dikirim" bila
// disengketakan, jadi TIDAK ada tombol edit/hapus di sini.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, toneForBadgeVariant } from "@/components/ui/badge";
import FilterBar from "@/components/filter-bar";
import Pagination from "@/components/pagination";
import {
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimestamp,
  paginate,
  parsePage,
  parseRangeFilter,
  parseStatusFilter,
  rangeStartDate,
  summarizeLogs,
  RANGE_FILTER_LABELS,
  RANGE_FILTERS,
  STATUS_FILTER_LABELS,
  STATUS_FILTERS,
  type RangeFilter,
  type StatusFilter,
} from "@/lib/audit-log";
import type { SubmitStatus } from "@/generated/prisma/enums";

/** Jumlah baris per halaman. */
const PAGE_SIZE = 20;

/** Bangun URL halaman ini dengan filter status, rentang waktu & halaman. */
function historyUrl(
  status: StatusFilter,
  range: RangeFilter,
  page: number,
): string {
  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (range !== "30d") params.set("range", range);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/history?${qs}` : "/history";
}

type HistoryPageProps = {
  // Di Next.js 16, `searchParams` adalah Promise yang harus di-await.
  searchParams: Promise<{ status?: string; range?: string; page?: string }>;
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const statusFilter = parseStatusFilter(params.status);
  const rangeFilter = parseRangeFilter(params.range);
  const requestedPage = parsePage(params.page);

  // Batas bawah rentang di zona WIB (atau null untuk "Semua").
  const since = rangeStartDate(rangeFilter);

  // Filter diterapkan di database, bukan di memori: dengan begitu paginasi
  // menghitung jumlah halaman dari hasil yang sudah tersaring, angka di
  // tombol halaman selalu cocok dengan isi tabel. Batas waktu masuk ke `where`
  // yang sama, jadi tabel & hitungan halaman selalu sepakat.
  const where = {
    userId: session.user.id,
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(statusFilter === "ALL"
      ? {}
      : { status: statusFilter as SubmitStatus }),
  };

  const [totalFiltered, allForSummary] = await Promise.all([
    prisma.submitLog.count({ where }),
    // Ringkasan selalu dihitung dari SELURUH log (bukan satu halaman saja),
    // supaya angkanya tidak berubah-ubah saat berpindah halaman. Ia tetap
    // mengikuti rentang waktu terpilih agar cocok dengan isi tabel.
    prisma.submitLog.findMany({
      where: { userId: session.user.id, ...(since ? { createdAt: { gte: since } } : {}) },
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
      trigger: true,
      attempt: true,
      createdAt: true,
    },
  });

  const summary = summarizeLogs(allForSummary);
  const lastAt = summary.lastAt ? formatJakartaTimestamp(summary.lastAt) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Riwayat Absensi</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Catatan setiap percobaan kirim laporan. Sukses, duplikat, dan gagal
          semuanya tercatat, ini bukti resmi bila ada sengketa kehadiran.
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

      {/* Filter rentang waktu & status. Rentang ditulis lebih dulu karena
          memengaruhi jumlah data yang dihitung, baru status mempersempit di
          dalamnya. Satu form GET berisi kedua <select>; memilih salah satu
          langsung menerapkan dan tidak menghapus filter lain saat diubah. */}
      <div className="mb-4">
        <FilterBar
          fields={[
            {
              name: "range",
              label: "Rentang waktu",
              value: rangeFilter,
              options: RANGE_FILTERS.map((f) => ({
                value: f,
                label: RANGE_FILTER_LABELS[f],
              })),
            },
            {
              name: "status",
              label: "Status",
              value: statusFilter,
              options: STATUS_FILTERS.map((f) => ({
                value: f,
                label: STATUS_FILTER_LABELS[f],
              })),
            },
          ]}
        />
        {totalFiltered > 0 && (
          <p className="mt-2 text-xs text-foreground/60">
            {totalFiltered} catatan
          </p>
        )}
      </div>


      {logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-sm text-foreground/70">
            {statusFilter === "ALL"
              ? `Belum ada riwayat dalam rentang “${RANGE_FILTER_LABELS[rangeFilter]}”. Setelah Anda menekan “Kirim Absen”, catatan akan muncul di sini.`
              : `Tidak ada catatan berstatus “${STATUS_FILTER_LABELS[statusFilter]}” dalam rentang “${RANGE_FILTER_LABELS[rangeFilter]}”.`}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Tabel riwayat absensi (dapat digulir)"
            tabIndex={0}
          >
            {/* `min-w-[40rem]`: tanpa lebar minimum, `<table class="w-full">`
                hanya "dipepetkan" di layar sempit sehingga TIDAK ada yang bisa
                digulir horizontal. Dengan min-width, kolom mempertahankan lebar
                wajar dan wadah `overflow-x-auto` benar-benar bisa digeser. */}
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border text-left text-xs text-foreground/60">
                  <th className="p-3 font-heading">Waktu</th>
                  <th className="p-3 font-heading">Status</th>
                  <th className="p-3 font-heading">Pemicu</th>
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
                      <td className="p-3 text-xs text-foreground/80">
                        {log.message ?? ","}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Pagination
        page={pageInfo.page}
        pageCount={pageInfo.pageCount}
        label="Navigasi halaman riwayat"
        buildHref={(p) => historyUrl(statusFilter, rangeFilter, p)}
      />
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
