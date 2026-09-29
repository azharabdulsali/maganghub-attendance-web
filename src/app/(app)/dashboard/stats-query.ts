import { prisma } from "@/lib/prisma";
import type { Stat } from "./stats-cards";

// Perhitungan statistik dashboard. Semua query di sini hanya MEMBACA dan
// difilter per userId — tidak ada agregasi lintas pengguna. Lihat SPEC.md §5.6.

export type TrendPoint = { date: string; success: number; failed: number };

export type DashboardStats = {
  stats: Stat[];
  trend: TrendPoint[];
};

/** Awal hari ini di zona Asia/Jakarta, dikembalikan sebagai UTC Date. */
export function startOfTodayJakarta(): Date {
  const now = new Date();
  // Geser ke WIB (UTC+7), potong ke awal hari, lalu kembalikan ke UTC.
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  wib.setUTCHours(0, 0, 0, 0);
  return new Date(wib.getTime() - 7 * 60 * 60 * 1000);
}

/**
 * Tanggal hari ini di zona Asia/Jakarta sebagai string `YYYY-MM-DD`.
 *
 * Dipakai untuk membandingkan dengan `TrendPoint.date` (yang juga dihitung
 * dengan geseran WIB). Ditaruh di sini supaya perhitungan zona waktu hanya ada
 * di SATU berkas — kalau logika WIB berubah, keduanya ikut berubah bersama.
 */
export function todayJakartaISODate(): string {
  return new Date(startOfTodayJakarta().getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Rentetan hari (YYYY-MM-DD) untuk N hari terakhir, tertua → terbaru. */
function lastNDays(n: number): string[] {
  const days: string[] = [];
  const today = startOfTodayJakarta();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const since = new Date(
    startOfTodayJakarta().getTime() - 29 * 24 * 60 * 60 * 1000,
  );

  // Tiga query dijalankan paralel: hitung total per status, ambil log 30 hari
  // untuk grafik, dan cek tanggal kirim sukses terakhir untuk "streak".
  const [grouped, recentLogs, lastSuccess] = await Promise.all([
    prisma.submitLog.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.submitLog.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.submitLog.findFirst({
      where: { userId, status: "SUCCESS" },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const countOf = (s: "SUCCESS" | "FAILED" | "DUPLICATE") =>
    grouped.find((g) => g.status === s)?._count._all ?? 0;

  const sukses = countOf("SUCCESS");
  const gagal = countOf("FAILED");
  const duplikat = countOf("DUPLICATE");

  // Grafik: rangkai 30 hari penuh, isi 0 untuk hari tanpa log, agar garis
  // waktu tidak bolong saat beberapa hari tidak ada aktivitas.
  const perDay = new Map<string, TrendPoint>();
  for (const day of lastNDays(30)) {
    perDay.set(day, { date: day, success: 0, failed: 0 });
  }
  for (const log of recentLogs) {
    const key = new Date(log.createdAt.getTime() + 7 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
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
      hint: "sepanjang waktu",
    },
    { label: "Berhasil", value: String(sukses), tone: "good" },
    { label: "Gagal", value: String(gagal), tone: gagal > 0 ? "bad" : "neutral" },
    { label: "Duplikat", value: String(duplikat), hint: "sudah pernah terkirim" },
  ];

  if (lastSuccess) {
    const diffDays = Math.floor(
      (startOfTodayJakarta().getTime() -
        new Date(
          new Date(lastSuccess.createdAt.getTime() + 7 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10) + "T00:00:00.000Z",
        ).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    stats.push({
      label: "Kirim sukses terakhir",
      value: diffDays === 0 ? "Hari ini" : `${diffDays} hari lalu`,
      tone: diffDays <= 1 ? "good" : "neutral",
    });
  }

  return { stats, trend };
}
