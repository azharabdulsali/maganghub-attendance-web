// src/app/(app)/calendar/page.tsx: kalender kehadiran & laporan (Tahap 7).
//
// Server component: memeriksa sesi, mengambil SubmitLog + Report milik pengguna
// untuk SATU bulan (dari `?month=YYYY-MM`), lalu merender kisi kalender. Seluruh
// perhitungan tanggal diserahkan ke lib/calendar.ts yang murni & teruji.
//
// Prinsip:
//   - Hanya baca data milik sendiri (difilter userId). Admin melihat kalender
//     SENDIRI, sama seperti pengguna biasa.
//   - Jujur: sel tanpa data tampil redup dan KOSONG (tanpa teks status).
//     Tidak ada klaim "terkirim" dari data yang tidak ada; statusnya tetap
//     disebut di `aria-label` untuk pembaca layar.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPlainDate } from "@/lib/submit-service";
import { loadHolidaySet } from "@/lib/holidays-repo";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  buildMonthGrid,
  classifyDay,
  collectReportDates,
  currentJakartaMonth,
  daysInMonth,
  holidayKindOf,
  MONTH_LABELS,
  monthToParam,
  nextMonth,
  parseMonth,
  prevMonth,
  WEEKDAY_LABELS,
  type DayStatus,
  type HolidayKind,
  type YearMonth,
} from "@/lib/calendar";

/** Rentang UTC [awal, akhir) yang mencakup seluruh bulan di zona WIB. */
function jakartaMonthRange({ year, month }: YearMonth): { gte: Date; lt: Date } {
  // Awal hari pertama bulan di WIB, dikembalikan sebagai UTC.
  const startUtc = Date.UTC(year, month - 1, 1) - 7 * 60 * 60 * 1000;
  const endUtc = Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000;
  return { gte: new Date(startUtc), lt: new Date(endUtc) };
}

/** URL halaman ini untuk bulan tertentu. */
function calendarUrl(target: YearMonth): string {
  return `/calendar?month=${monthToParam(target)}`;
}

type CalendarPageProps = {
  // Di Next.js 16, `searchParams` adalah Promise yang harus di-await.
  searchParams: Promise<{ month?: string }>;
};

const STATUS_TEXT: Record<DayStatus, string> = {
  SUBMITTED: "Terkirim",
  FAILED: "Gagal",
  DRAFT: "Draft",
  NONE: "Belum diisi",
};

/** Kelas Tailwind per status, SATU-satunya peta warna kalender. */
const STATUS_CELL_CLASS: Record<DayStatus, string> = {
  SUBMITTED: "bg-success text-main-foreground border-border",
  FAILED: "bg-destructive text-white border-border",
  DRAFT: "border-border bg-background",
  NONE: "border-border/40 bg-background",
};

/** Label ringkas penanda hari libur di sudut sel. */
const HOLIDAY_LABEL: Record<Exclude<HolidayKind, null>, string> = {
  NATIONAL: "Libur",
  WEEKEND: "Akhir pekan",
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const month = parseMonth(params.month);
  const current = currentJakartaMonth();
  const isCurrentMonth =
    month.year === current.year && month.month === current.month;

  const range = jakartaMonthRange(month);

  // Ambil paralel: log submit pada bulan ini, report/draft pada bulan ini, dan
  // template khusus tanggal pada bulan ini (untuk penanda hijau di kalender).
  const [logs, reports, datedTemplates, holidays] = await Promise.all([
    prisma.submitLog.findMany({
      where: {
        userId: session.user.id,
        createdAt: { gte: range.gte, lt: range.lt },
      },
      select: { status: true, createdAt: true },
    }),
    prisma.report.findMany({
      where: {
        userId: session.user.id,
        date: { gte: range.gte, lt: range.lt },
      },
      select: { date: true, status: true },
    }),
    prisma.datedReportTemplate.findMany({
      where: {
        userId: session.user.id,
        date: { gte: range.gte, lt: range.lt },
      },
      select: { date: true },
    }),
    // Libur dari tabel admin: dipakai agar penanda "Libur" di kalender sama
    // dengan yang benar-benar dilewati otomasi (`decide()`).
    loadHolidaySet(),
  ]);

  // Tanggal (YYYY-MM-DD) yang punya template khusus. Dipakai untuk penanda
  // hijau, supaya pengguna tahu bahwa laporan hari itu isinya beda dari default.
  const datedReportDates = new Set(datedTemplates.map((t) => toPlainDate(t.date)));

  // Kelompokkan log per tanggal (WIB); status paling penting menang.
  const logsByDate = new Map<string, "SUCCESS" | "FAILED" | "DUPLICATE">();
  {
    const rank = { SUCCESS: 3, FAILED: 2, DUPLICATE: 1 } as const;
    for (const log of logs) {
      const key = new Date(log.createdAt.getTime() + 7 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const prev = logsByDate.get(key);
      if (!prev || rank[log.status] > rank[prev]) logsByDate.set(key, log.status);
    }
  }

  const reportDates = collectReportDates(reports);
  const weeks = buildMonthGrid(month);
  const totalDays = daysInMonth(month);

  // Ringkasan bulan ini, dihitung dari kisi, bukan query tambahan.
  const counts: Record<DayStatus, number> = {
    SUBMITTED: 0,
    FAILED: 0,
    DRAFT: 0,
    NONE: 0,
  };
  for (const week of weeks) {
    for (const cell of week) {
      if (!cell) continue;
      counts[classifyDay(cell.iso, logsByDate, reportDates)] += 1;
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading text-2xl sm:text-3xl">
          Kalender Kehadiran &amp; Laporan
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          Pantau status submit absensi dan laporan harian per bulan.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            {MONTH_LABELS[month.month]} {month.year}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant="neutral"
              size="icon-sm"
              aria-label="Bulan sebelumnya"
              render={<Link href={calendarUrl(prevMonth(month))} />}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="neutral"
              size="icon-sm"
              aria-label="Bulan berikutnya"
              render={<Link href={calendarUrl(nextMonth(month))} />}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isCurrentMonth && (
            <div>
              <Link
                href="/calendar"
                className="text-xs font-heading underline underline-offset-4"
              >
                ← Kembali ke bulan ini
              </Link>
            </div>
          )}

          {/* Header hari. */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-center text-[10px] font-heading text-foreground/60 sm:text-[11px]"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Kisi tanggal. */}
          <div className="space-y-1 sm:space-y-2">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1 sm:gap-2">
                {week.map((cell, cellIndex) => {
                  if (!cell) {
                    return <div key={`blank-${cellIndex}`} aria-hidden />;
                  }
                  const status = classifyDay(cell.iso, logsByDate, reportDates);
                  const holiday = holidayKindOf(cell.iso, holidays);
                  const hasDatedTemplate = datedReportDates.has(cell.iso);
                  const isToday =
                    isCurrentMonth &&
                    cell.day <= totalDays &&
                    isTodayInJakarta(cell.iso);
                  return (
                    <div
                      key={cell.iso}
                      className={cn(
                        "flex h-14 flex-col justify-between rounded-base border-2 p-1 sm:h-16 sm:p-1.5",
                        STATUS_CELL_CLASS[status],
                        status === "NONE" && "text-foreground/50",
                        holiday && "border-dashed",
                      )}
                      aria-label={`${cell.day}: ${STATUS_TEXT[status]}${
                        holiday ? `, ${HOLIDAY_LABEL[holiday]}` : ""
                      }${hasDatedTemplate ? ", laporan sudah ada" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "font-mono text-[10px] sm:text-[11px]",
                            status === "SUBMITTED"
                              ? "text-main-foreground"
                              : "text-foreground/70",
                          )}
                        >
                          {cell.day}
                        </span>
                        {isToday ? (
                          <span
                            className="size-1.5 rounded-full bg-foreground"
                            aria-hidden
                          />
                        ) : holiday ? (
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              holiday === "NATIONAL"
                                ? "bg-foreground"
                                : "bg-foreground/40",
                            )}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "flex items-center gap-1 truncate text-[10px] sm:text-[11px]",
                          status === "NONE" && "text-foreground/40",
                        )}
                      >
                        {/* Penanda hijau: tanggal ini sudah punya laporan
                            sendiri (template khusus), isinya beda dari default. */}
                        {hasDatedTemplate ? (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-green-600"
                            aria-hidden
                          />
                        ) : null}
                        {/* Teks status. Sel tanpa data (NONE) sengaja
                            DIBIARKAN KOSONG, bukan diisi koma. Sebelumnya
                            koma literal dipakai sebagai penanda "jujur, tidak
                            ada data", tetapi di layar ia terbaca seperti tanda
                            baca nyasar / teks rusak. Kejujuran tetap dijaga
                            lewat warna sel redup + `aria-label` yang menyebut
                            "Belum diisi" untuk pembaca layar. */}
                        {hasDatedTemplate ? (
                          <span className="truncate">Laporan Sudah Ada</span>
                        ) : holiday ? (
                          <span className="truncate">{HOLIDAY_LABEL[holiday]}</span>
                        ) : status !== "NONE" ? (
                          <span className="truncate">{STATUS_TEXT[status]}</span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Keterangan warna + ringkasan angka bulan ini. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-border pt-3 text-xs">
            <LegendItem status="SUBMITTED" count={counts.SUBMITTED} />
            <LegendItem status="DRAFT" count={counts.DRAFT} />
            <LegendItem status="FAILED" count={counts.FAILED} />
            <LegendItem status="NONE" count={counts.NONE} />
            <span className="inline-flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-sm border-2 border-dashed border-foreground/60"
                aria-hidden
              />
              <span className="text-foreground/70">Hari libur</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="size-1.5 shrink-0 rounded-full bg-green-600"
                aria-hidden
              />
              <span className="text-foreground/70">Laporan Sudah Ada</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-foreground/50">
        Tanggal dihitung memakai zona Asia/Jakarta. Hanya pengiriman{" "}
        <strong>sukses</strong> yang ditandai terkirim; percobaan duplikat saja
        tetap tampil sebagai draft/belum diisi. Sel bergaris putus-putus adalah{" "}
        <strong>akhir pekan atau libur nasional</strong>, pada hari itu laporan
        tidak perlu dikirim.
      </p>
    </div>
  );
}

/** Satu item keterangan warna + jumlahnya bulan ini. */
function LegendItem({ status, count }: { status: DayStatus; count: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "size-3 shrink-0 rounded-sm border-2",
          STATUS_CELL_CLASS[status],
        )}
        aria-hidden
      />
      <span className="text-foreground/70">
        {STATUS_TEXT[status]}{" "}
        <span className="font-heading text-foreground">{count}</span>
      </span>
    </span>
  );
}

/** Apakah `iso` (YYYY-MM-DD) sama dengan hari ini di WIB? */
function isTodayInJakarta(iso: string): boolean {
  const todayWib = new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return iso === todayWib;
}
