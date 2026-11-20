// src/lib/work-schedule.ts: aturan MURNI jadwal kerja mingguan per pengguna.
//
// Latar: sebelum fitur ini, "hari kerja" selalu berarti Senin–Jumat dan
// dihitung otomatis dari tanggal (`isHoliday` di report-policy.ts). Kini
// setiap pengguna dapat menetapkan sendiri hari mana ia bekerja, dan
// keputusan kirim (manual maupun otomatis), kalender, date picker, pengingat,
// dan panel admin semuanya mengikuti jadwal itu.
//
// Kenapa modul terpisah & murni: sama seperti report-policy.ts, aturan ini
// menentukan KAPAN server boleh menyentuh portal Monev. Ia tidak menyentuh
// DB/jaringan sama sekali (itu tugas work-schedule-repo.ts), sehingga bisa
// diuji tuntas tanpa database.
//
// PENOMORAN HARI (penting, sengaja berbeda dari JS): kita memakai ISO-8601,
// 1=Senin … 7=Minggu, karena lebih mudah dibaca manusia & tersimpan apa adanya
// di kolom `WorkSchedule.days`. `Date.getUTCDay()` JS memakai 0=Minggu…6=Sabtu;
// konversinya ADA DI SATU TEMPAT (`isoWeekdayOf`, dipakai `isoWeekdayOfDate`).
//
// Modul ini SENGAJA tidak mengimpor report-policy.ts (yang sebaliknya
// mengimpor modul ini) supaya tidak ada siklus impor. Pemecahan tanggal
// YYYY-MM-DD di bawah disalin minimal, dengan komentar yang menjelaskan itu.

/** Satu hari dalam seminggu, ISO-8601: 1=Senin … 7=Minggu. */
export type WorkDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Daftar hari kerja seorang pengguna (terurut, tanpa duplikat). */
export type WorkDays = readonly WorkDay[];

/** Jadwal default: Senin–Jumat, persis perilaku sebelum fitur ini ada. */
export const DEFAULT_WORK_DAYS: readonly WorkDay[] = [1, 2, 3, 4, 5];

/** Nama hari lengkap, indeks = nilai ISO (1=Senin … 7=Minggu). */
export const WORK_DAY_LABELS: Record<WorkDay, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};

/**
 * Konversi `getUTCDay()` (0=Minggu … 6=Sabtu) → ISO-8601 (1=Senin … 7=Minggu).
 * Nilai di luar 0–6 → `null` (jangan menebak).
 */
export function isoWeekdayOf(jsDay: number): WorkDay | null {
  if (!Number.isInteger(jsDay) || jsDay < 0 || jsDay > 6) return null;
  return (jsDay === 0 ? 7 : jsDay) as WorkDay;
}

/**
 * Hari ISO (1=Senin … 7=Minggu) untuk tanggal polos `YYYY-MM-DD`, dihitung
 * sebagai kalender murni via `Date.UTC` (bebas zona waktu server).
 * Mengembalikan `null` untuk bentuk tanggal yang tidak sah.
 *
 * CATATAN: logika pemecahan tanggal ini sengaja disalin minimal dari
 * report-policy.ts (yang mengimpor modul ini; impor sebaliknya akan membuat
 * siklus). Jika aturan format berubah, ubah KEDUANYA.
 */
export function isoWeekdayOfDate(date: string): WorkDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null; // menolak 2026-02-30 dan sejenisnya
  }
  return isoWeekdayOf(dt.getUTCDay());
}

/**
 * Rapikan daftar hari: buang nilai tidak sah (bukan bilangan bulat 1–7),
 * buang duplikat, urutkan menaik. Tidak pernah melempar; input apa pun
 * menghasilkan daftar yang sah (boleh kosong).
 */
export function normalizeWorkDays(raw: readonly unknown[]): WorkDay[] {
  const valid = new Set<WorkDay>();
  for (const v of raw) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 7) {
      valid.add(v as WorkDay);
    }
  }
  return [...valid].sort((a, b) => a - b);
}

/**
 * Apakah `isoWeekday` (1=Senin … 7=Minggu) adalah hari kerja menurut jadwal?
 *
 * `workDays` kosong atau tidak diberikan → jatuh ke DEFAULT (Senin–Jumat).
 * Pagar ini penting: pengguna tanpa baris jadwal di DB, atau DB yang sesaat
 * gagal dibaca, HARUS berperilaku seperti sebelum fitur ini ada, bukan seperti
 * "tidak punya hari kerja sama sekali".
 */
export function isWorkDayOf(isoWeekday: number, workDays?: WorkDays): boolean {
  const days =
    workDays && workDays.length > 0 ? workDays : DEFAULT_WORK_DAYS;
  return days.includes(isoWeekday as WorkDay);
}

/**
 * Bandingkan dua jadwal (boleh `undefined` = default). MURNI. Dipakai UI untuk
 * mengetahui apakah ada perubahan yang belum disimpan.
 */
export function sameWorkDays(a?: WorkDays, b?: WorkDays): boolean {
  const left = normalizeWorkDays(a ?? DEFAULT_WORK_DAYS);
  const right = normalizeWorkDays(b ?? DEFAULT_WORK_DAYS);
  if (left.length !== right.length) return false;
  return left.every((d, i) => d === right[i]);
}

/**
 * Ringkasan manusia dari jadwal kerja, untuk tampilan (dashboard, otomasi,
 * panel admin): "Senin–Jumat", "Setiap hari", "Senin–Rabu, Jumat", dst.
 * Mengelompokkan hari berurutan menjadi rentang "A–B"; dua hari berurutan
 * ditulis "A, B" (bukan "A–B", yang biasanya berarti rentang panjang).
 */
export function describeWorkDays(workDays?: WorkDays): string {
  const days = normalizeWorkDays(workDays ?? DEFAULT_WORK_DAYS);
  if (days.length === 0) return describeWorkDays(DEFAULT_WORK_DAYS);
  if (days.length === 7) return "Setiap hari";

  const runs: [WorkDay, WorkDay][] = [];
  let start = days[0];
  let prev = days[0];
  for (const d of days.slice(1)) {
    if (d === prev + 1) {
      prev = d;
      continue;
    }
    runs.push([start, prev]);
    start = d;
    prev = d;
  }
  runs.push([start, prev]);

  return runs
    .map(([a, b]) => {
      if (a === b) return WORK_DAY_LABELS[a];
      if (b - a === 1) return `${WORK_DAY_LABELS[a]}, ${WORK_DAY_LABELS[b]}`;
      return `${WORK_DAY_LABELS[a]}–${WORK_DAY_LABELS[b]}`;
    })
    .join(", ");
}
