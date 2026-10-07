// src/lib/reminder-policy.ts: aturan MURNI pengingat "belum absen hari ini".
//
// Latar: admin ingin memunculkan popup peringatan ke pengguna yang BELUM absen
// pada jam:menit tertentu (WIB). Popup hanya tampil DI DALAM aplikasi, saat
// halaman sedang terbuka, dan klien mengeceknya berkala.
//
// Kenapa modul terpisah & murni: keputusan "tampilkan popup?" adalah inti
// fitur. Bila salah, popup muncul di hari libur, atau muncul sebelum jam yang
// diset admin, atau tidak muncul padahal user memang belum absen. Karena itu
// aturan ini dipisah dari I/O (tanpa DB/jaringan/Date.now langsung) dan diuji
// dengan waktu tetap.
//
// Pembagian tanggung jawab (penting):
//   - SERVER menyiapkan FAKTA: jam:menit kini di WIB, apakah tanggal ini hari
//     kerja (libur/akhir pekan?), dan apakah user sudah punya SubmitLog hari
//     ini. Fakta itu diteruskan ke `shouldShowReminder()`.
//   - Fungsi di sini hanya MENILAI fakta, tanpa menyentuh apa pun.

import {
  AUTOMATION_TIMEZONE,
  formatSchedule,
  isValidSchedule,
} from "./automation";

/** Nilai default setelan (dipakai saat tabel singleton belum pernah diisi). */
export const REMINDER_DEFAULT_HOUR = 8;
export const REMINDER_DEFAULT_MINUTE = 0;

/**
 * Setelan pengingat yang berlaku, sudah dinormalisasi untuk konsumsi klien.
 * `isEnabled = false` membuat popup tidak pernah muncul.
 */
export interface ReminderSettingView {
  isEnabled: boolean;
  hour: number;
  minute: number;
  /** Zona waktu tempat `hour:minute` dimaknai (saat ini selalu Asia/Jakarta). */
  timezone: string;
}

/**
 * Fakta waktu yang dibutuhkan untuk menilai kelayakan popup. Semuanya dihitung
 * oleh pemanggil (server) di zona `timezone` setelan.
 */
export interface ReminderFacts {
  /** Jam (0–23) sekarang di zona setelan. */
  nowHour: number;
  /** Menit (0–59) sekarang di zona setelan. */
  nowMinute: number;
  /** Apakah tanggal ini hari kerja (bukan akhir pekan / libur nasional)? */
  isWorkingDay: boolean;
  /** Apakah pengguna SUDAH punya jejak absen hari ini (SubmitLog apa pun)? */
  hasSubmittedToday: boolean;
}

/** Ringkasan jam:menit saat ini di WIB, plus tanggal polos & hari kerja. */
export interface JakartaClock {
  /** Tanggal polos `YYYY-MM-DD` di WIB (untuk query SubmitLog & cek libur). */
  date: string;
  hour: number;
  minute: number;
}

/**
 * Ambil jam, menit, dan tanggal (WIB) dari sebuah `Date`.
 *
 * MURNI terhadap argumennya — bisa diuji dengan waktu tetap. Memakai `Intl`
 * (bukan offset tetap +07:00) supaya benar bila aturan zona berubah. Ini SATU
 * sumber untuk pemecahan waktu Jakarta; `cron-dispatch.ts` punya `jakartaHour`
 * yang lebih sempit (hanya jam) karena itu cukup untuk kebutuhannya.
 */
export function jakartaClock(at: Date): JakartaClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AUTOMATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  // `Intl` kadang mengembalikan "24" untuk tengah malam di sebagian ICU lama.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return { date: `${year}-${month}-${day}`, hour, minute };
}

/**
 * Apakah `nowHour:nowMinute` sudah melewati (atau tepat pada) jam mulai
 * pengingat? MURNI.
 *
 * Jendela menyala: dari jam:menit setelan SAMPAI tengah malam WIB (sesuai
 * kesepakatan). Jadi begitu jam mulai terlewati, pengingat tetap menyala
 * sepanjang sisa hari — bukan hanya selama satu menit.
 *
 * Bila jam:menit setelan tidak sah (mis. data rusak), kembalikan `false`:
 * lebih baik pengingat diam daripada muncul pada waktu acak.
 */
export function isReminderWindowOpen(
  nowHour: number,
  nowMinute: number,
  settingHour: number,
  settingMinute: number,
): boolean {
  if (!isValidSchedule(nowHour, nowMinute)) return false;
  if (!isValidSchedule(settingHour, settingMinute)) return false;
  const now = nowHour * 60 + nowMinute;
  const start = settingHour * 60 + settingMinute;
  return now >= start;
}

/**
 * Keputusan akhir: TAMPILKAN popup pengingat? MURNI.
 *
 * Urutan pemeriksaan (semuanya harus terpenuhi):
 *   1. Fitur tidak dimatikan admin (`isEnabled`).
 *   2. Hari ini HARI KERJA (bukan akhir pekan/libur nasional).
 *   3. Sudah melewati jam:menit yang diset admin.
 *   4. Pengguna BELUM absen hari ini.
 *
 * Urutan dipilih supaya alasan paling murah/menentukan diperiksa lebih dulu,
 * dan supaya hari libur selalu menang atas apa pun (pengingat tak pernah muncul
 * di libur, walau user belum absen — memang tak wajib absen).
 */
export function shouldShowReminder(
  setting: ReminderSettingView,
  facts: ReminderFacts,
): boolean {
  if (!setting.isEnabled) return false;
  if (!facts.isWorkingDay) return false;
  if (
    !isReminderWindowOpen(
      facts.nowHour,
      facts.nowMinute,
      setting.hour,
      setting.minute,
    )
  ) {
    return false;
  }
  if (facts.hasSubmittedToday) return false;
  return true;
}

/** Label jam mulai pengingat untuk UI admin, mis. "08:00 WIB". */
export function reminderScheduleLabel(hour: number, minute: number): string {
  return `${formatSchedule(hour, minute)} WIB`;
}

/** Hasil validasi setelan dari admin. */
export type ReminderSettingValidation =
  | { ok: true; setting: ReminderSettingView }
  | { ok: false; error: string; field?: "hour" | "minute" | "isEnabled" };

/**
 * Validasi & normalisasi input setelan pengingat dari admin. MURNI.
 *
 * Aturan:
 *   - `isEnabled` boleh boolean; nilai lain → false (aman, bukan error).
 *   - `hour`/`minute` harus bilangan bulat dalam rentang sah. Menerima string
 *     angka (form HTML mengirim string) dan mengubahnya ke number.
 *   - `timezone` diabaikan dari input: selalu Asia/Jakarta (satu zona, sama
 *     dengan otomasi). Ini mencegah admin mengubah zona dan membuat pengingat
 *     muncul pada jam yang tak terduga.
 *
 * Pesan kesalahan ditulis seolah tampil di layar (tidak ada jargon internal).
 */
export function validateReminderSettingInput(input: {
  isEnabled?: unknown;
  hour?: unknown;
  minute?: unknown;
}): ReminderSettingValidation {
  const isEnabled = input.isEnabled === true || input.isEnabled === "true";

  const hourNum = toIntOrNull(input.hour);
  if (hourNum === null || hourNum < 0 || hourNum > 23) {
    return {
      ok: false,
      error: "Jam harus angka bulat antara 0 dan 23.",
      field: "hour",
    };
  }

  const minuteNum = toIntOrNull(input.minute);
  if (minuteNum === null || minuteNum < 0 || minuteNum > 59) {
    return {
      ok: false,
      error: "Menit harus angka bulat antara 0 dan 59.",
      field: "minute",
    };
  }

  return {
    ok: true,
    setting: {
      isEnabled,
      hour: hourNum,
      minute: minuteNum,
      timezone: AUTOMATION_TIMEZONE,
    },
  };
}

/** Ubah nilai apa pun menjadi bilangan bulat, atau null bila bukan angka sah. */
function toIntOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    return Number(trimmed);
  }
  return null;
}

