// src/lib/dashboard-calendar.ts: aturan MURNI untuk kalender status di
// dashboard. Dipisah dari komponen supaya bisa diuji tanpa merender React.
// Lihat DESIGN.md §"Visualisasi status".

/** Jumlah log per status pada satu hari. */
export type DayStatusCounts = {
  success: number;
  failed: number;
  duplicate: number;
};

export type DayStatus = "success" | "failed" | "duplicate" | "none";

/**
 * Status satu hari. Urutannya mengikat: berhasil menang atas gagal, gagal
 * menang atas duplikat. Satu hari bisa punya beberapa log (mis. percobaan gagal
 * lalu berhasil), dan yang ditampilkan harus yang paling meyakinkan, bukan
 * yang terakhir kebetulan tercatat.
 */
export function dayStatus({
  success,
  failed,
  duplicate,
}: DayStatusCounts): DayStatus {
  if (success > 0) return "success";
  if (failed > 0) return "failed";
  if (duplicate > 0) return "duplicate";
  return "none";
}

export type CalendarMonth = {
  year: number;
  /** 1–12, sama seperti `YearMonth` di lib/calendar. */
  month: number;
};

/**
 * Bulan-bulan yang harus digambar, urut naik, tanpa duplikat.
 *
 * Masukan berupa daftar tanggal `YYYY-MM-DD` (deret `trend` dashboard sudah
 * berurutan, tapi fungsi ini tidak bergantung pada itu). Tanggal yang bentuknya
 * tidak sah dilewati (bukan ditebak) supaya kisi tidak pernah bergeser bulan
 * karena data aneh.
 */
export function monthsCovered(dates: string[]): CalendarMonth[] {
  const seen = new Map<string, CalendarMonth>();
  for (const date of dates) {
    const key = date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key) || seen.has(key)) continue;
    const month = Number(key.slice(5, 7));
    if (month < 1 || month > 12) continue;
    seen.set(key, { year: Number(key.slice(0, 4)), month });
  }
  return [...seen.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );
}
