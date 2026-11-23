import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RANGE_FILTER_LABELS, type RangeFilter } from "@/lib/audit-log";
import { MONTH_LABELS, WEEKDAY_LABELS, buildMonthGrid, holidayKindOf } from "@/lib/calendar";
import {
  dayStatus,
  monthsCovered,
  type DayStatus,
} from "@/lib/dashboard-calendar";
import { cn } from "@/lib/utils";
import type { WorkDays } from "@/lib/work-schedule";
import type { TrendPoint } from "./stats-query";

// Kalender status di dashboard: satu kotak = satu HARI, dengan angka tanggal
// dan nama hari, disusun per bulan seperti kalender biasa.
//
// Kenapa bukan bar chart (riwayat keputusan di DESIGN.md §"Visualisasi status"):
// datanya biner, hampir selalu 0 atau 1 kiriman per hari, sehingga tinggi
// batang tidak mengodekan apa pun yang berguna. Warna kotak menunjukkan
// KEADAAN, dan bentuk kalender membuat pola mingguan (hari kerja, hari libur,
// hari terlewat) langsung terlihat tanpa membaca label. Tanggal di luar jadwal
// kerja pengguna diberi garis putus-putus memakai `holidayKindOf` yang sama
// dengan halaman /calendar, jadi pengguna berjadwal Sabtu tidak melihat
// Sabtu-nya dicoret sebagai libur.
//
// Rentang filter bisa mencapai 1 tahun, jadi kalender digambar per bulan:
// 7 hari = 1 bulan, 30 hari = 1-2 bulan, 90 hari = 3-4 bulan, 1 tahun = 13 bulan
// paling banyak. Tanggal yang berada di luar rentang terpilih (mis. awal bulan
// yang sama tetapi lebih lama dari 30 hari) TIDAK diwarnai, artinya bukan
// "belum ada" melainkan memang tidak ditanyakan ke database. Karena itu tanggal
// tersebut diredupkan, bukan dijadikan kotak "belum ada".

const CELL_CLASS: Record<DayStatus, string> = {
  // Wajib `success-foreground`, BUKAN `main-foreground`. Dulu hijau mode terang
  // masih #059669 sehingga teks hitam lolos; setelah --success digelapkan ke
  // #047857 (agar putih lolos 4.5:1), teks hitam di atasnya justru turun ke
  // 3.8:1 dan gagal. `success-foreground` = putih di mode terang (5.5:1) dan
  // nyaris hitam di mode gelap (10.1:1), jadi lolos di kedua tema.
  success: "border-border bg-success text-success-foreground",
  failed: "border-border bg-destructive text-destructive-foreground",
  duplicate: "border-border bg-warning text-warning-foreground",
  none: "border-muted-foreground bg-secondary-background text-muted-foreground",
};

const STATUS_LABEL: Record<DayStatus, string> = {
  success: "Berhasil",
  failed: "Gagal",
  duplicate: "Sudah ada",
  none: "Belum ada",
};

export default function StatusCalendar({
  trend,
  range,
  workDays,
  holidays,
}: {
  trend: TrendPoint[];
  range: RangeFilter;
  /** Hari kerja pengguna (ISO 1–7). Tanpa ini → default Senin–Jumat. */
  workDays?: WorkDays;
  /** Libur admin, supaya hari libur nasional tidak ditandai "bukan hari kerja". */
  holidays?: ReadonlySet<string>;
}) {
  const byDate = new Map(trend.map((point) => [point.date, point]));
  const months = monthsCovered(trend.map((point) => point.date));
  // Hari terakhir deret selalu "hari ini" (dibangun di stats-query), jadi tidak
  // perlu jam server di sini, dan cincin "hari ini" tidak bisa meleset.
  const today = trend[trend.length - 1]?.date ?? "";

  const totalSuccess = trend.reduce((a, p) => a + p.success, 0);
  const totalFailed = trend.reduce((a, p) => a + p.failed, 0);
  const totalDuplicate = trend.reduce((a, p) => a + p.duplicate, 0);
  const totalNone = trend.filter((p) => dayStatus(p) === "none").length;
  const totalKiriman = totalSuccess + totalFailed + totalDuplicate;

  const title =
    range === "ALL"
      ? "1 tahun terakhir"
      : `${RANGE_FILTER_LABELS[range]} terakhir`;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Warna kotak = hasil kirim. Cincin = hari ini. Tanggal redup = di luar
          rentang.
        </p>
      </CardHeader>
      <CardContent>
        <p className="sr-only">
          {`Status ${title}: ${totalSuccess} hari berhasil, ${totalFailed} hari gagal, ${totalDuplicate} hari sudah ada, ${totalNone} hari tanpa kiriman.`}
        </p>

        {/* Keadaan kosong (R-27 di antislop): kalender yang seluruhnya abu-abu
            tanpa penjelasan mudah disalahartikan sebagai data yang gagal dimuat.
            Satu kalimat menutup keraguan itu, tanpa mengulang angka di kartu. */}
        {totalKiriman === 0 && (
          <p className="mb-4 rounded-base border-2 border-dashed border-border bg-secondary-background p-3 text-sm text-muted-foreground">
            Belum ada kiriman pada rentang ini.
          </p>
        )}

        <div
          className={cn(
            "grid grid-cols-1 gap-5",
            months.length > 1 && "sm:grid-cols-2 lg:grid-cols-3",
            months.length === 1 && "max-w-xs",
          )}
        >
          {months.map(({ year, month }) => (
            <MiniMonth
              key={`${year}-${month}`}
              year={year}
              month={month}
              byDate={byDate}
              today={today}
              workDays={workDays}
              holidays={holidays}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <LegendItem className="bg-success" label={`Berhasil: ${totalSuccess}`} />
          <LegendItem
            className="bg-destructive"
            label={`Gagal: ${totalFailed}`}
          />
          <LegendItem className="bg-warning" label={`Sudah ada: ${totalDuplicate}`} />
          <LegendItem
            className="border-muted-foreground bg-secondary-background"
            label={`Belum ada: ${totalNone}`}
          />
        </div>

        {range === "ALL" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Kalender dibatasi 1 tahun terakhir agar tetap terbaca; kartu
            Ringkasan di atas tetap menghitung seluruh waktu.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Satu bulan. Kisi memakai `buildMonthGrid` (sumber yang sama dengan halaman
 * /calendar), jadi urutan hari dan paddingnya tidak bisa berbeda dari kalender
 * aplikasi ini.
 */
function MiniMonth({
  year,
  month,
  byDate,
  today,
  workDays,
  holidays,
}: {
  year: number;
  month: number;
  byDate: Map<string, TrendPoint>;
  today: string;
  workDays?: WorkDays;
  holidays?: ReadonlySet<string>;
}) {
  const weeks = buildMonthGrid({ year, month });

  return (
    <div>
      <p className="mb-2 font-heading text-sm">
        {MONTH_LABELS[month - 1]} {year}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            aria-hidden="true"
            className="text-center text-[0.6875rem] font-heading text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {weeks.flat().map((cell, index) => {
          if (!cell) {
            // Padding baris pertama/terakhir: kosong, tapi tetap memakan slot
            // supaya kolom tanggal tidak bergeser.
            return (
              <span
                key={`pad-${index}`}
                aria-hidden="true"
                className="h-8"
              />
            );
          }

          const point = byDate.get(cell.iso);
          if (!point) {
            return (
              <span
                key={cell.iso}
                title={`${cell.iso}: di luar rentang yang dipilih`}
                className="flex h-8 items-center justify-center rounded-base border-2 border-transparent font-mono text-xs text-muted-foreground"
              >
                {cell.day}
              </span>
            );
          }

          const status = dayStatus(point);
          // Garis putus-putus = "hari ini bukan hari kerja Anda" (termasuk
          // Sabtu/Minggu pada jadwal default). Sumbernya `holidayKindOf` yang
          // SAMA dengan halaman /calendar & jalur kirim, jadi pengguna yang
          // bekerja Sabtu tidak melihat Sabtu-nya dicoret sebagai libur.
          const bukanHariKerja =
            holidayKindOf(cell.iso, holidays, workDays) === "OFF";
          const rincian = `${point.success} berhasil, ${point.failed} gagal, ${point.duplicate} sudah ada`;

          return (
            <span
              key={cell.iso}
              title={`${cell.iso}: ${STATUS_LABEL[status]} (${rincian})`}
              className={cn(
                "flex h-8 items-center justify-center rounded-base border-2 font-mono text-xs",
                CELL_CLASS[status],
                status === "none" && bukanHariKerja && "border-dashed",
                cell.iso === today &&
                  "ring-2 ring-main ring-offset-2 ring-offset-background",
              )}
            >
              {cell.day}
              {/* Angka tanggal saja tidak cukup bagi pembaca layar: statusnya
                  hanya tersirat dari warna. Teks ini yang menyampaikannya. */}
              <span className="sr-only">
                {`: ${STATUS_LABEL[status]}`}
              </span>
            </span>
          );
        })}
      </div>
    </div>
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
