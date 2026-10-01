import { prisma } from "@/lib/prisma";
import { jakartaISODate, lastJakartaDays, startOfJakartaDay } from "@/lib/calendar";
import { rangeDays, type RangeFilter } from "@/lib/audit-log";
import type { Stat } from "./stats-cards";

// Perhitungan statistik dashboard. Semua query di sini hanya MEMBACA dan
// difilter per userId, tidak ada agregasi lintas pengguna. Lihat SPEC.md §5.6.
//
// Sejak filter rentang waktu, kartu Ringkasan & grafik mengikuti rentang yang
// dipilih pengguna (?range=). Definisi hari tetap WIB lewat lib/calendar,
// sumber batas hari yang sama dengan /calendar, jadi angkanya tidak pernah
// berbeda karena zona jam server.

export type TrendPoint = { date: string; success: number; failed: number };

export type DashboardStats = {
  stats: Stat[];
  trend: TrendPoint[];
  /** Rentang yang benar-benar dipakai (sudah diparse dari URL). */
  range: RangeFilter;
  /** Jumlah hari yang dirangkai di grafik (untuk ALL, dibatasi ke 1 tahun). */
  chartDays: number;
};

/**
 * Tanggal hari ini di zona Asia/Jakarta sebagai string `YYYY-MM-DD`.
 *
 * Tipenya `string` (bukan `string | null` seperti `jakartaISODate`) karena
 * "hari ini" selalu pasti; pembalik `null` di sana hanya untuk Date rusak.
 */
export function todayJakartaISODate(now: Date = new Date()): string {
  return jakartaISODate(now) ?? "";
}

/**
 * Jumlah hari yang digambar di grafik untuk sebuah rentang.
 *
 * Untuk rentang berhari tetap (`7d`/`30d`/`90d`/`1y`) dipakai jumlah hari itu.
 * Untuk `ALL`, grafik tetap dibatasi 1 tahun (365 hari): menggambar batang
 * untuk setiap hari sejak awal waktu akan tak terbaca dan tak berguna, sementara
 * kartu Ringkasan tetap menghitung SEMUA log. Batas ini jujur ditampilkan di
 * judul grafik.
 */
export function chartDaysFor(range: RangeFilter): number {
  return rangeDays(range) ?? 365;
}

export async function getDashboardStats(
  userId: string,
  range: RangeFilter = "30d",
  now: Date = new Date(),
): Promise<DashboardStats> {
  const chartDays = chartDaysFor(range);
  // Batas bawah rentang di zona WIB (atau null untuk "Semua").
  const days = rangeDays(range);
  const since =
    days === null
      ? null
      : new Date(startOfJakartaDay(now).getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  // Dua query dijalankan paralel: hitung total per status (dalam rentang) dan
  // ambil log untuk grafik.
  const [grouped, recentLogs] = await Promise.all([
    prisma.submitLog.groupBy({
      by: ["status"],
      where: { userId, ...(since ? { createdAt: { gte: since } } : {}) },
      _count: { _all: true },
    }),
    prisma.submitLog.findMany({
      where: {
        userId,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: { status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const countOf = (s: "SUCCESS" | "FAILED" | "DUPLICATE") =>
    grouped.find((g) => g.status === s)?._count._all ?? 0;

  const sukses = countOf("SUCCESS");
  const gagal = countOf("FAILED");
  const duplikat = countOf("DUPLICATE");

  // Grafik: rangkai `chartDays` hari penuh (berakhir HARI INI di WIB), isi 0
  // untuk hari tanpa log, agar garis waktu tidak bolong saat beberapa hari tidak
  // ada aktivitas. `lastJakartaDays` dari lib/calendar, sumber batas hari WIB
  // yang sama dengan /calendar, jadi hari ini tidak pernah "hilang".
  const perDay = new Map<string, TrendPoint>();
  for (const day of lastJakartaDays(chartDays, now)) {
    perDay.set(day, { date: day, success: 0, failed: 0 });
  }
  for (const log of recentLogs) {
    const key = jakartaISODate(log.createdAt);
    if (!key) continue;
    const point = perDay.get(key);
    if (!point) continue;
    if (log.status === "SUCCESS") point.success += 1;
    else if (log.status === "FAILED") point.failed += 1;
  }

  const trend = [...perDay.values()];

  const stats: Stat[] = [
    {
      label: "Total kirim",
      value: String(sukses + gagal + duplikat),
      hint: "dalam rentang terpilih",
    },
    { label: "Berhasil", value: String(sukses), tone: "good" },
    { label: "Gagal", value: String(gagal), tone: gagal > 0 ? "bad" : "neutral" },
    { label: "Duplikat", value: String(duplikat), hint: "sudah pernah terkirim" },
  ];

  return { stats, trend, range, chartDays };
}
