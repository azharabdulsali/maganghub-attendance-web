// src/app/(app)/report-templates/recent-submit-history.tsx
//
// Server component: kutipan singkat "Riwayat Laporan Terakhir" di bawah halaman
// Template Laporan. Sumbernya SAMA dengan halaman /history, yaitu
// tabel SubmitLog, setiap percobaan kirim (sukses, sudah-ada, gagal) tercatat
// di sana sesuai SPEC.md §7 & §10.
//
// Kenapa bukan "draft": proyek ini tidak menyimpan draft per tanggal. Model
// `Report` ada di skema, tetapi belum pernah ditulis oleh alur mana pun (tidak
// ada /api/reports/draft). Menampilkan baris "Draft" di sini hanya akan
// mengarang data. Maka yang ditampilkan adalah percobaan submit nyata, sama
// seperti halaman riwayat lengkap.
//
// Batas tanggung jawab: komponen ini hanya MEMBACA 5 baris terakhir dan
// menyusunnya. Format waktu, status, dan pemicu diserahkan ke lib/audit-log.ts
// yang murni & teruji, supaya label di sini tidak pernah berbeda dari halaman
// riwayat.

import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Badge, toneForBadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimestamp,
} from "@/lib/audit-log";

/** Jumlah log terakhir yang dikutip di halaman ini. */
const RECENT_LIMIT = 5;

/**
 * Teks isi laporan dalam sel tabel. Dipangkas agar tabel tidak melebar liar;
 * teks utuh tetap tersedia lewat atribut `title` (tooltip). Nilai kosong
 * ditampilkan sebagai "," supaya tidak ada sel yang tampak rusak/kosong.
 */
function ReportCell({ text, title }: { text: string; title?: string }) {
  if (!text) return <span className="text-foreground/40">,</span>;
  return (
    <span className="line-clamp-3 block" title={title ?? text}>
      {text}
    </span>
  );
}

/** Satu baris label+nilai pada kartu mobile (bagian isi laporan). */
function MobileField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-heading text-foreground/50">{label}</dt>
      <dd className="text-xs leading-relaxed text-foreground/80">
        {value || <span className="text-foreground/40">,</span>}
      </dd>
    </div>
  );
}

export default async function RecentSubmitHistory({
  userId,
}: {
  userId: string;
}) {
  const logs = await prisma.submitLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
    select: {
      id: true,
      status: true,
      message: true,
      trigger: true,
      attempt: true,
      createdAt: true,
      report: {
        select: {
          date: true,
          activity: true,
          learning: true,
          obstacles: true,
        },
      },
    },
  });

  return (
    <section className="mt-10 border-2 border-border bg-secondary-background p-4 shadow-shadow sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-heading text-lg">Riwayat Laporan Terakhir</h2>
          <p className="mt-0.5 text-xs text-foreground/60">
            Catatan percobaan kirim terakhir ke portal Monev, sukses, sudah-ada,
            maupun gagal. Tidak ada data yang diubah dari halaman ini.
          </p>
        </div>

        {/* Tautan ke halaman riwayat lengkap. Memakai `render={<Link/>}` agar
            tetap <a> (bukan tombol di dalam tautan). */}
        <Button
          variant="neutral"
          size="sm"
          className="self-start sm:self-auto"
          render={<Link href="/history" />}
        >
          Halaman Riwayat Lengkap
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </div>

      {logs.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/60">
          Belum ada riwayat. Begitu laporan pertama dikirim, catatannya muncul di
          sini.
        </p>
      ) : (
        <>
          {/* Mobile: kartu bertumpuk. */}
          <ul className="mt-4 space-y-2.5 sm:hidden">
            {logs.map((log) => {
              const when = formatJakartaTimestamp(log.createdAt);
              return (
                <li
                  key={log.id}
                  className="space-y-2 border-2 border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">
                      {when ?? "waktu tidak diketahui"}
                    </span>
                    <Badge tone={toneForBadgeVariant(badgeVariant(log.status))}>
                      <Clock className="mr-1 size-3" aria-hidden />
                      {describeSubmitStatus(log.status)}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-foreground/70">
                    {describeTrigger(log.trigger)}
                    {log.attempt > 1 && ` (ke-${log.attempt})`}
                    {log.message ? `, ${log.message}` : ""}
                  </p>

                  {/* Isi laporan: tiga bagian. "," bila belum tersimpan. */}
                  <dl className="space-y-1.5 border-t border-border/40 pt-2">
                    <MobileField
                      label="Uraian Aktivitas"
                      value={log.report?.activity}
                    />
                    <MobileField
                      label="Pembelajaran yang Diperoleh"
                      value={log.report?.learning}
                    />
                    <MobileField
                      label="Kendala yang Dialami"
                      value={log.report?.obstacles}
                    />
                  </dl>
                </li>
              );
            })}
          </ul>

          {/* Desktop: tabel. Keterangan dipecah menjadi tiga kolom isi laporan
              (Uraian Aktivitas / Pembelajaran / Kendala) yang diambil dari
              tabel Report, isi yang benar-benar dikirim ke portal. Pesan
              submit singkat dipindah ke tooltip judul sel agar tabel tetap
              lapang. */}
          <div
            className="mt-4 hidden overflow-x-auto sm:block"
            role="region"
            aria-label="Tabel riwayat laporan terakhir (dapat digulir)"
            tabIndex={0}
          >
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border text-left text-xs text-foreground/60">
                  <th className="p-3 font-heading">Waktu</th>
                  <th className="p-3 font-heading">Status</th>
                  <th className="p-3 font-heading">Pemicu</th>
                  <th className="p-3 font-heading">Uraian Aktivitas</th>
                  <th className="p-3 font-heading">Pembelajaran yang Diperoleh</th>
                  <th className="p-3 font-heading">Kendala yang Dialami</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-border/40 align-top last:border-b-0"
                  >
                    <td className="whitespace-nowrap p-3 text-xs text-foreground/70">
                      {formatJakartaTimestamp(log.createdAt) ??
                        "waktu tidak diketahui"}
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
                    {/* Kolom isi laporan. Bila relasi Report belum ada (log
                        lama sebelum fitur ini, atau tanggal tidak sah saat
                        simpan), tampilkan "," secara jujur, bukan mengarang. */}
                    <td className="max-w-xs p-3 text-xs text-foreground/80">
                      {log.report ? (
                        <ReportCell
                          text={log.report.activity}
                          title={log.message ?? undefined}
                        />
                      ) : (
                        <span className="text-foreground/40">,</span>
                      )}
                    </td>
                    <td className="max-w-xs p-3 text-xs text-foreground/80">
                      {log.report ? (
                        <ReportCell text={log.report.learning} />
                      ) : (
                        <span className="text-foreground/40">,</span>
                      )}
                    </td>
                    <td className="max-w-xs p-3 text-xs text-foreground/80">
                      {log.report ? (
                        <ReportCell text={log.report.obstacles} />
                      ) : (
                        <span className="text-foreground/40">,</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
