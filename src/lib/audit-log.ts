// src/lib/audit-log.ts: penampil audit log submit (murni, tanpa DB/jaringan).
//
// Halaman riwayat (src/app/(app)/history/page.tsx) menyerahkan baris
// SubmitLog mentah ke fungsi-fungsi di sini. Tujuannya sama seperti modul murni
// lain (submit-service, report-policy): keputusan tampilan diuji tanpa DB.
//
// Tidak ada rahasia di sini, audit log hanya memuat status, pesan, tanggal.

import type { SubmitStatus, TriggerType } from "@/generated/prisma/enums";
import { startOfJakartaDay } from "./calendar";

/** Warna badge per status. Dipetakan ke kelas Tailwind, bukan enum Prisma. */
export type BadgeVariant = "success" | "failure" | "warning";

/**
 * Deskripsi manusia untuk tiap `SubmitStatus`. Selalu ada nilai balik agar UI
 * tidak pernah menampilkan enum mentah ke pengguna.
 */
export function describeSubmitStatus(status: SubmitStatus): string {
  switch (status) {
    case "SUCCESS":
      return "Terkirim";
    case "DUPLICATE":
      return "Sudah ada";
    case "FAILED":
      return "Gagal";
    default:
      return "Tidak diketahui";
  }
}

/** Warna badge: hijau (sukses), kuning (duplikat/netral), merah (gagal). */
export function badgeVariant(status: SubmitStatus): BadgeVariant {
  switch (status) {
    case "SUCCESS":
      return "success";
    case "DUPLICATE":
      return "warning";
    case "FAILED":
      return "failure";
    default:
      return "warning";
  }
}

/** Label pemicu: "Manual" atau "Otomatis". */
export function describeTrigger(trigger: TriggerType): string {
  return trigger === "CRON" ? "Otomatis" : "Manual";
}

/**
 * Format waktu ke zona Asia/Jakarta secara eksplisit (bukan zona server).
 * Mengembalikan `null` bila `Date` tidak sah, supaya pemanggil memutuskan
 * fallback, bukan diam-diam mencetak "Invalid Date".
 */
export function formatJakartaTimestamp(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");

  return `${day} ${month} ${year}, ${hour}:${minute} WIB`;
}

/**
 * Format HANYA jam:menit ke zona Asia/Jakarta, mis. "14:05". Dipakai kolom
 * ringkas (jam otomasi berjalan hari ini) di mana tanggal sudah tersirat dari
 * konteks. Mengembalikan `null` bila `Date` tidak sah, sama seperti
 * `formatJakartaTimestamp`.
 */
export function formatJakartaTimeOnly(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    // `h23` memastikan tengah malam "00:00", bukan "24:00" (sebagian ICU).
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${hour}:${get("minute")}`;
}

// ---------------------------------------------------------------------------
// Ringkasan daftar (untuk kartu statistik di halaman)
// ---------------------------------------------------------------------------

/** Baris minimal yang dibutuhkan ringkasan, cukup subset kolom SubmitLog. */
export interface AuditRow {
  status: SubmitStatus;
  createdAt: Date;
}

export interface AuditSummary {
  total: number;
  success: number;
  duplicate: number;
  failed: number;
  /** Waktu (ms) log terbaru, atau `null` bila daftar kosong. */
  lastAt: Date | null;
}

/**
 * Hitung ringkasan dari daftar log. MURNI, tidak menyentuh DB. Daftar kosong
 * menghasilkan semua nol (bukan NaN), termasuk `lastAt: null`.
 */
export function summarizeLogs(rows: readonly AuditRow[]): AuditSummary {
  let success = 0;
  let duplicate = 0;
  let failed = 0;
  let lastAt: Date | null = null;

  for (const row of rows) {
    if (row.status === "SUCCESS") success += 1;
    else if (row.status === "DUPLICATE") duplicate += 1;
    else if (row.status === "FAILED") failed += 1;

    if (lastAt === null || row.createdAt.getTime() > lastAt.getTime()) {
      lastAt = row.createdAt;
    }
  }

  return { total: rows.length, success, duplicate, failed, lastAt };
}

// ---------------------------------------------------------------------------
// Filter & paginasi halaman riwayat (murni, teruji tanpa DB)
// ---------------------------------------------------------------------------

/** Nilai filter yang dikenali dari URL. Selain ini diabaikan (dianggap "semua"). */
export const STATUS_FILTERS = ["ALL", "SUCCESS", "DUPLICATE", "FAILED"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Label manusia untuk tiap pilihan filter, dipakai tombol filter di halaman. */
export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  ALL: "Semua",
  SUCCESS: "Terkirim",
  DUPLICATE: "Sudah ada",
  FAILED: "Gagal",
};

/**
 * Ubah nilai mentah dari `?status=` menjadi StatusFilter yang sah. Nilai tak
 * dikenal (termasuk `undefined`) jatuh ke "ALL", jadi URL yang salah ketik
 * tidak pernah membuat halaman kosong atau error, hanya menampilkan semua.
 */
export function parseStatusFilter(raw: string | undefined): StatusFilter {
  if (!raw) return "ALL";
  const upper = raw.toUpperCase();
  return (STATUS_FILTERS as readonly string[]).includes(upper)
    ? (upper as StatusFilter)
    : "ALL";
}

/**
 * Ubah nilai mentah `?page=` menjadi nomor halaman >= 1. Bukan angka, nol,
 * negatif, atau NaN → 1. Tidak ada batas atas di sini karena `paginate`
 * yang akan menjepitnya ke jumlah halaman sebenarnya.
 */
export function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// ---------------------------------------------------------------------------
// Filter rentang waktu (murni, tanpa DB)
// ---------------------------------------------------------------------------
//
// Rentang dihitung dalam HARI KALENDER WIB (Asia/Jakarta), lewat
// `startOfJakartaDay` di lib/calendar, sumber batas hari yang SAMA dengan
// grafik dashboard & halaman /calendar. Jadi "7 hari" di sini berarti 7 hari
// kalender WIB termasuk hari ini, bukan 7×24 jam, dan tidak pernah berbeda
// dari hitungan di halaman lain walau jam server beda zona.

/**
 * Nilai rentang yang dikenali dari URL. `ALL` = tanpa batas waktu. Selain ini
 * diabaikan (jatuh ke default `30d`), jadi URL salah ketik tidak pernah
 * menampilkan tabel kosong atau error.
 */
export const RANGE_FILTERS = ["7d", "30d", "90d", "1y", "ALL"] as const;
export type RangeFilter = (typeof RANGE_FILTERS)[number];

/** Label manusia untuk tiap pilihan rentang, dipakai tombol filter. */
export const RANGE_FILTER_LABELS: Record<RangeFilter, string> = {
  "7d": "7 hari",
  "30d": "30 hari",
  "90d": "90 hari",
  "1y": "1 tahun",
  ALL: "Semua",
};

/**
 * Rentang default saat URL tidak menyebut (`?range=` kosong/tak dikenal).
 * Dipilih 30 hari, bukan `ALL`, supaya query tetap ringan di data besar;
 * "Semua" harus dipilih sengaja oleh pengguna.
 */
export const DEFAULT_RANGE: RangeFilter = "30d";

/**
 * Ubah nilai mentah `?range=` menjadi RangeFilter yang sah. Nilai tak dikenal
 * (termasuk `undefined`) jatuh ke `DEFAULT_RANGE`, jadi URL salah ketik tidak
 * pernah membuat halaman kosong.
 */
export function parseRangeFilter(raw: string | undefined): RangeFilter {
  if (!raw) return DEFAULT_RANGE;
  const lower = raw.trim().toLowerCase();
  // Dibandingkan tanpa peduli huruf besar/kecil karena `RANGE_FILTERS` memuat
  // "ALL" (huruf besar) sementara nilai lain huruf kecil.
  const match = (RANGE_FILTERS as readonly string[]).find(
    (r) => r.toLowerCase() === lower,
  );
  return (match as RangeFilter | undefined) ?? DEFAULT_RANGE;
}

/**
 * Jumlah hari ke belakang untuk sebuah rentang (dihitung termasuk hari ini),
 * atau `null` untuk `ALL` (tanpa batas). Dipakai bersama `startOfJakartaDay`
 * oleh `rangeStartDate`; dipisah agar bisa diuji sendiri.
 */
export function rangeDays(range: RangeFilter): number | null {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "1y":
      return 365;
    case "ALL":
      return null;
    default:
      return 30;
  }
}

/**
 * Waktu mulai (batas bawah, inklusif) sebuah rentang di zona WIB, atau `null`
 * bila rentangnya `ALL` (tidak ada batas). MURNI terhadap `Date` masukan
 * (memakai `now` yang diberikan, tidak menyentuh jam perangkat).
 *
 * Contoh "7 hari" pada 10 Juli 2026 → mulai 00:00 WIB tanggal 4 Juli 2026
 * (7 hari kalender: 4,5,6,7,8,9,10). Rumus: `(hari - 1)` hari ke belakang dari
 * awal hari ini, sama seperti grafik 30 hari di stats-query.ts.
 */
export function rangeStartDate(
  range: RangeFilter,
  now: Date = new Date(),
): Date | null {
  const days = rangeDays(range);
  if (days === null) return null;
  const startOfToday = startOfJakartaDay(now);
  return new Date(startOfToday.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
}
// ---------------------------------------------------------------------------
// Filter pengguna (khusus halaman admin: audit lintas pengguna)
// ---------------------------------------------------------------------------

/**
 * Nilai khusus untuk "semua pengguna" pada `?user=`. Dipakai sebagai sentinel
 * agar URL bersih (tanpa parameter) dan nilai defaultnya eksplisit, bukan
 * string kosong yang ambigu dengan "belum dipilih".
 */
export const ALL_USERS = "ALL";

/**
 * Bersihkan nilai mentah `?user=` menjadi id pengguna atau `ALL_USERS`. MURNI.
 *
 * Sengaja TIDAK divalidasi terhadap daftar id yang ada: tugas halaman admin
 * yang tahu daftarnya. Di sini hanya dipastikan bentuknya wajar (trim, tolak
 * kosong/terlalu panjang/berisi karakter aneh) supaya URL ngawur tidak
 * diteruskan mentah ke Prisma. Bila id tidak ada, query mengembalikan nol baris
 * dan tabel menampilkan pesan kosong — bukan error.
 */
export function parseUserFilter(raw: string | undefined): string {
  if (!raw) return ALL_USERS;
  const value = raw.trim();
  if (!value) return ALL_USERS;
  if (value === ALL_USERS) return ALL_USERS;
  // Id Prisma adalah cuid: huruf, angka, dan sesekali "-"/"_". Batasi panjang
  // agar query tidak bisa disalahgunakan untuk membebani DB.
  if (value.length > 64) return ALL_USERS;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return ALL_USERS;
  return value;
}

/**
 * Judul kolom email pada baris penanda. Dipisah agar teksnya konsisten di satu
 * tempat (dipakai tabel & pengujian).
 */
export function describeUserFilter(
  userId: string,
  email: string | undefined,
): string {
  if (userId === ALL_USERS) return "Semua pengguna";
  return email ?? "pengguna tidak dikenal";
}

export interface Pagination {
  /** Halaman yang benar-benar ditampilkan (sudah dijepit ke rentang sah). */
  page: number;
  pageCount: number;
  /** Indeks awal (0-based, inklusif) untuk `slice`. */
  start: number;
  /** Indeks akhir (0-based, eksklusif) untuk `slice`. */
  end: number;
}

/**
 * Hitung jendela paginasi. MURNI. `pageSize` minimal 1 (dijaga agar tidak
 * terjadi pembagian nol). Bila `page` melebihi jumlah halaman, ia dijepit ke
 * halaman terakhir yang ada, jadi `?page=999` tetap menampilkan data, bukan
 * tabel kosong. Daftar kosong menghasilkan pageCount = 1, page = 1.
 */
export function paginate(
  totalItems: number,
  page: number,
  pageSize: number,
): Pagination {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(totalItems / size));
  const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (safePage - 1) * size;
  const end = Math.min(start + size, totalItems);
  return { page: safePage, pageCount, start, end };
}
