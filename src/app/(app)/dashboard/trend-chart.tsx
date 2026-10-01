import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RANGE_FILTER_LABELS, type RangeFilter } from "@/lib/audit-log";
import type { TrendPoint } from "./stats-query";

// Grafik tren pengiriman, SVG batang (bar) sederhana yang digambar manual.
//
// SENGAJA tidak memakai library chart apa pun: AGENTS.md §2 melarang menambah
// dependensi tanpa alasan kuat, dan kebutuhan di sini hanya "lihat naik-turun".
// SVG murni = nol byte tambahan, tetap tajam di semua layar.
//
// Rentang mengikuti filter di halaman dashboard. Untuk rentang "Semua", grafik
// tetap dibatasi 1 tahun (lihat `chartDaysFor`) supaya batang tidak terlalu
// rapat; judulnya menyebut batas itu apa adanya.

export default function TrendChart({
  trend,
  range,
  chartDays,
}: {
  trend: TrendPoint[];
  range: RangeFilter;
  chartDays: number;
}) {
  // Tinggi maksimum batang mengikuti nilai tertinggi; minimal 1 supaya tidak
  // bagi nol saat semua hari kosong.
  const max = Math.max(1, ...trend.map((p) => p.success + p.failed));
  const totalSukses = trend.reduce((a, p) => a + p.success, 0);
  const totalGagal = trend.reduce((a, p) => a + p.failed, 0);

  // Judul jujur: untuk "Semua" grafik hanya 1 tahun terakhir, bukan seluruh
  // waktu, jadi jangan menulis "Semua" di judul grafik.
  const title =
    range === "ALL"
      ? "1 tahun terakhir"
      : `${RANGE_FILTER_LABELS[range]} terakhir`;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {range === "ALL" && (
          <p className="text-xs text-foreground/60">
            Grafik dibatasi 1 tahun terakhir agar tetap terbaca; kartu Ringkasan
            di atas tetap menghitung seluruh waktu.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* Legenda warna. */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-foreground/70">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm border-2 border-border bg-success" />
            Berhasil: {totalSukses}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm border-2 border-border bg-destructive" />
            Gagal: {totalGagal}
          </span>
        </div>

        {trend.every((p) => p.success === 0 && p.failed === 0) ? (
          <p className="py-8 text-center text-sm text-foreground/60">
            Belum ada pengiriman dalam {chartDays} hari terakhir.
          </p>
        ) : (
          <div
            className="flex h-40 items-end gap-[3px]"
            role="img"
            aria-label={`Grafik ${title}: ${totalSukses} berhasil, ${totalGagal} gagal`}
          >
            {trend.map((p) => {
              const total = p.success + p.failed;
              const heightPct = (total / max) * 100;
              const suksesPct = total > 0 ? (p.success / total) * 100 : 0;
              return (
                <div
                  key={p.date}
                  className="group relative flex-1"
                  style={{ height: "100%" }}
                >
                  <div
                    className="absolute bottom-0 flex w-full flex-col justify-end overflow-hidden rounded-sm border-2 border-border bg-secondary-background"
                    style={{ height: `${Math.max(heightPct, 3)}%` }}
                    title={`${p.date}: ${p.success} berhasil, ${p.failed} gagal`}
                  >
                    {p.failed > 0 && (
                      <div
                        className="w-full bg-destructive"
                        style={{ height: `${100 - suksesPct}%` }}
                      />
                    )}
                    {p.success > 0 && (
                      <div
                        className="w-full bg-success"
                        style={{ height: `${suksesPct}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-2 flex justify-between text-xs text-foreground/50">
          <span>{trend[0]?.date}</span>
          <span>{trend[trend.length - 1]?.date}</span>
        </div>
      </CardContent>
    </Card>
  );
}
