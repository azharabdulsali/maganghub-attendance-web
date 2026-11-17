import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RANGE_FILTER_LABELS, type RangeFilter } from "@/lib/audit-log";
import { MONTH_LABELS } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { TrendPoint } from "./stats-query";

// Status strip: satu kotak per hari/minggu/bulan, diwarnai menurut status
// kiriman. Untuk data BINER (berhasil/gagal per hari), bar chart menyesatkan:
// tinggi batang mengodekan JUMLAH, padahal jumlahnya hampir selalu 0 atau 1,
// sehingga semua batang tampak sama tinggi dan hari kosong tampak seperti
// "grafik rusak". Kotak berwarna lebih tepat: ia menunjukkan KEADAAN, bukan
// besaran, dan hari tanpa kiriman tetap terlihat sebagai kotak kosong.
//
// Granularitas menyesuaikan rentang agar tetap ringkas:
//   <= 31 hari  -> satu kotak per hari
//   <= 120 hari -> satu kotak per minggu (7 hari)
//   sisanya     -> satu kotak per bulan
// Rincian angka tetap ada di tooltip tiap kotak dan di halaman Riwayat.

type CellStatus = "success" | "failed" | "duplicate" | "none";

type Cell = {
  key: string;
  /** Label kecil di bawah kotak (tanggal untuk 7 hari, bulan untuk 1 tahun). */
  label: string;
  /** Rentang tanggal untuk tooltip. */
  rangeLabel: string;
  status: CellStatus;
  success: number;
  failed: number;
  duplicate: number;
  isWeekend: boolean;
  isToday: boolean;
};

const CELL_CLASS: Record<CellStatus, string> = {
  success: "border-border bg-success",
  failed: "border-border bg-destructive",
  duplicate: "border-border bg-warning",
  none: "border-border/40 bg-secondary-background",
};

const STATUS_LABEL: Record<CellStatus, string> = {
  success: "Berhasil",
  failed: "Gagal",
  duplicate: "Sudah ada",
  none: "Belum ada",
};

/** Status satu periode: berhasil menang, lalu gagal, lalu duplikat. */
function statusOf(p: {
  success: number;
  failed: number;
  duplicate: number;
}): CellStatus {
  if (p.success > 0) return "success";
  if (p.failed > 0) return "failed";
  if (p.duplicate > 0) return "duplicate";
  return "none";
}

/** Apakah `YYYY-MM-DD` jatuh pada Sabtu/Minggu (UTC, tanpa geser zona). */
function isWeekend(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

function sumPoints(points: TrendPoint[]) {
  return points.reduce(
    (a, p) => ({
      success: a.success + p.success,
      failed: a.failed + p.failed,
      duplicate: a.duplicate + p.duplicate,
    }),
    { success: 0, failed: 0, duplicate: 0 },
  );
}

function dailyCells(points: TrendPoint[], today: string): Cell[] {
  return points.map((p) => ({
    key: p.date,
    label: p.date.slice(8, 10),
    rangeLabel: p.date,
    status: statusOf(p),
    success: p.success,
    failed: p.failed,
    duplicate: p.duplicate,
    isWeekend: isWeekend(p.date),
    isToday: p.date === today,
  }));
}

function weeklyCells(points: TrendPoint[], today: string): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const slice = points.slice(i, i + 7);
    const first = slice[0];
    const last = slice[slice.length - 1];
    const sum = sumPoints(slice);
    cells.push({
      key: first.date,
      label: "",
      rangeLabel:
        first.date === last.date ? first.date : `${first.date}–${last.date}`,
      status: statusOf(sum),
      ...sum,
      isWeekend: false,
      isToday: slice.some((p) => p.date === today),
    });
  }
  return cells;
}

function monthlyCells(points: TrendPoint[], today: string): Cell[] {
  const groups = new Map<string, TrendPoint[]>();
  for (const p of points) {
    const key = p.date.slice(0, 7);
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()].map(([key, slice]) => {
    const first = slice[0];
    const last = slice[slice.length - 1];
    const sum = sumPoints(slice);
    return {
      key,
      label: (MONTH_LABELS[Number(key.slice(5, 7))] ?? key).slice(0, 3),
      rangeLabel:
        first.date === last.date ? first.date : `${first.date}–${last.date}`,
      status: statusOf(sum),
      ...sum,
      isWeekend: false,
      isToday: slice.some((p) => p.date === today),
    };
  });
}

export default function StatusStrip({
  trend,
  range,
}: {
  trend: TrendPoint[];
  range: RangeFilter;
}) {
  const today = trend[trend.length - 1]?.date ?? "";
  const granularity =
    trend.length <= 31 ? "daily" : trend.length <= 120 ? "weekly" : "monthly";
  const cells =
    granularity === "daily"
      ? dailyCells(trend, today)
      : granularity === "weekly"
        ? weeklyCells(trend, today)
        : monthlyCells(trend, today);

  const totalSuccess = trend.reduce((a, p) => a + p.success, 0);
  const totalFailed = trend.reduce((a, p) => a + p.failed, 0);
  const totalDuplicate = trend.reduce((a, p) => a + p.duplicate, 0);
  const totalNone = cells.filter((c) => c.status === "none").length;

  const title =
    range === "ALL"
      ? "1 tahun terakhir"
      : `${RANGE_FILTER_LABELS[range]} terakhir`;
  const unitLabel =
    granularity === "daily"
      ? "hari"
      : granularity === "weekly"
        ? "minggu"
        : "bulan";

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-foreground/60">
          Satu kotak = satu {unitLabel}. Warna menunjukkan status kiriman.
          {granularity === "daily" && " Kotak bergaris putus-putus = akhir pekan."}
        </p>
      </CardHeader>
      <CardContent>
        <div
          role="img"
          aria-label={`Status ${title}: ${totalSuccess} berhasil, ${totalFailed} gagal, ${totalDuplicate} sudah ada, ${totalNone} ${unitLabel} tanpa kiriman`}
        >
          <ul
            aria-hidden="true"
            className={cn(
              "grid gap-1.5 sm:gap-2",
              granularity === "monthly"
                ? "grid-cols-6 sm:grid-cols-12"
                : "grid-cols-7",
            )}
          >
            {cells.map((cell) => (
              <li key={cell.key} className="flex flex-col items-center gap-1">
                <span
                  title={`${cell.rangeLabel}: ${STATUS_LABEL[cell.status]} (${cell.success} berhasil, ${cell.failed} gagal, ${cell.duplicate} sudah ada)`}
                  className={cn(
                    "block w-full rounded-base border-2",
                    granularity === "daily" && trend.length <= 7
                      ? "h-10"
                      : "h-9",
                    CELL_CLASS[cell.status],
                    cell.status === "none" && cell.isWeekend && "border-dashed",
                    cell.isToday &&
                      "ring-2 ring-main ring-offset-2 ring-offset-background",
                  )}
                />
                {cell.label && (
                  <span className="text-[10px] text-foreground/50">
                    {cell.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {granularity !== "daily" || trend.length > 7 ? (
          <div className="mt-2 flex justify-between text-xs text-foreground/50">
            <span>{trend[0]?.date}</span>
            <span>{trend[trend.length - 1]?.date}</span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground/70">
          <LegendItem
            className="bg-success"
            label={`Berhasil: ${totalSuccess}`}
          />
          <LegendItem
            className="bg-destructive"
            label={`Gagal: ${totalFailed}`}
          />
          <LegendItem
            className="bg-warning"
            label={`Sudah ada: ${totalDuplicate}`}
          />
          <LegendItem
            className="border-border/40 bg-secondary-background"
            label={`Belum ada: ${totalNone}`}
          />
        </div>

        {range === "ALL" && (
          <p className="mt-3 text-xs text-foreground/60">
            Grafik dibatasi 1 tahun terakhir agar tetap terbaca; kartu Ringkasan
            di atas tetap menghitung seluruh waktu.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LegendItem({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "inline-block size-3 rounded-sm border-2 border-border",
          className,
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

