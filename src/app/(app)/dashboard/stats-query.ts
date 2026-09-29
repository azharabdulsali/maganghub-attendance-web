import { prisma } from "@/lib/prisma";
import { jakartaISODate, lastJakartaDays, startOfJakartaDay } from "@/lib/calendar";
import type { Stat } from "./stats-cards";

// Perhitungan statistik dashboard. Semua query di sini hanya MEMBACA dan
// difilter per userId — tidak ada agregasi lintas pengguna. Lihat SPEC.md §5.6.

export type TrendPoint = { date: string; success: number; failed: number };

export type DashboardStats = {
  stats: Stat[];
  trend: TrendPoint[];
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

export async function getDashboardStats(
  userId: string,
  now: Date = new Date(),
): Promise<DashboardStats> {
  // Satu `now` untuk seluruh perhitungan: kalau permintaan datang tepat di detik
  // pergantian hari, batas `since` dan hari-hari grafik tidak boleh berbeda hari.
  const since = new Date(startOfJakartaDay(now).getTime() - 29 * 24 * 60 * 60 * 1000);

  // Dua query dijalankan paralel: hitung total per status (semua waktu) dan
  // ambil log 30 hari untuk grafik.
  const [grouped, recentLogs] = await Promise.all([
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
  ]);

  const countOf = (s: "SUCCESS" | "FAILED" | "DUPLICATE") =>
    grouped.find((g) => g.status === s)?._count._all ?? 0;

  const sukses = countOf("SUCCESS");
  const gagal = countOf("FAILED");
  const duplikat = countOf("DUPLICATE");

  // Grafik: rangkai 30 hari penuh (berakhir HARI INI di WIB), isi 0 untuk hari
  // tanpa log, agar garis waktu tidak bolong saat beberapa hari tidak ada
  // aktivitas. `lastJakartaDays` dari lib/calendar — sumber batas hari WIB yang
  // sama dengan /calendar, jadi hari ini tidak pernah "hilang".
  const perDay = new Map<string, TrendPoint>();
  for (const day of lastJakartaDays(30, now)) {
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
      hint: "sepanjang waktu",
    },
    { label: "Berhasil", value: String(sukses), tone: "good" },
    { label: "Gagal", value: String(gagal), tone: gagal > 0 ? "bad" : "neutral" },
    { label: "Duplikat", value: String(duplikat), hint: "sudah pernah terkirim" },
  ];

  return { stats, trend };
}
