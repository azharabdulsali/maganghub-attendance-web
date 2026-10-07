// src/lib/reminder-setting-repo.ts: akses DB untuk setelan pengingat absen.
//
// Ini SATU-SATUNYA jalur runtime yang membaca/menulis tabel `reminder_settings`.
// Karena modul ini menyentuh Prisma, ia SERVER-ONLY: JANGAN impor dari komponen
// klien. Komponen klien menerima hasil keputusan (boolean + setelan) sebagai
// prop/data dari endpoint, bukan dengan memanggil Prisma.
//
// Tabel ini SINGLETON: satu baris dengan `id = "default"`. Tidak ada seed SQL;
// baris dibuat malas (lazy) saat admin menyimpan pertama kali, dan pembacaan
// memakai nilai default bila baris belum ada — sehingga aplikasi tetap benar
// (pengingat nonaktif) sebelum admin menyentuh apa pun.
//
// Tidak ada rahasia di sini: hanya jam, menit, saklar on/off, dan zona waktu.

import { prisma } from "@/lib/prisma";
import {
  REMINDER_DEFAULT_HOUR,
  REMINDER_DEFAULT_MINUTE,
  type ReminderSettingView,
} from "@/lib/reminder-policy";
import { AUTOMATION_TIMEZONE } from "@/lib/automation";

/** Id baris tunggal. Konvensi: "default". */
export const REMINDER_SETTING_ID = "default";

/**
 * Setelan default bila baris belum pernah dibuat. `isEnabled = false` supaya
 * fitur baru TIDAK tiba-tiba memunculkan popup ke semua user tanpa admin
 * memintanya — admin harus menyalakannya sendiri.
 */
export function defaultReminderSetting(): ReminderSettingView {
  return {
    isEnabled: false,
    hour: REMINDER_DEFAULT_HOUR,
    minute: REMINDER_DEFAULT_MINUTE,
    timezone: AUTOMATION_TIMEZONE,
  };
}

/**
 * Baca setelan yang berlaku. Bila baris belum ada (belum pernah diatur admin),
 * kembalikan default (nonaktif) — bukan melempar, bukan membuat baris diam-diam
 * saat GET (GET tidak boleh punya efek samping tulis).
 */
export async function loadReminderSetting(): Promise<ReminderSettingView> {
  const row = await prisma.reminderSetting.findUnique({
    where: { id: REMINDER_SETTING_ID },
    select: { isEnabled: true, hour: true, minute: true, timezone: true },
  });
  if (!row) return defaultReminderSetting();
  return {
    isEnabled: row.isEnabled,
    hour: row.hour,
    minute: row.minute,
    timezone: row.timezone,
  };
}

/**
 * Simpan setelan (upsert baris tunggal). Dipanggil HANYA dari endpoint admin
 * setelah validasi — fungsi ini mengasumsikan nilai sudah sah.
 */
export async function saveReminderSetting(
  setting: ReminderSettingView,
): Promise<ReminderSettingView> {
  const saved = await prisma.reminderSetting.upsert({
    where: { id: REMINDER_SETTING_ID },
    create: {
      id: REMINDER_SETTING_ID,
      isEnabled: setting.isEnabled,
      hour: setting.hour,
      minute: setting.minute,
      timezone: setting.timezone,
    },
    update: {
      isEnabled: setting.isEnabled,
      hour: setting.hour,
      minute: setting.minute,
      timezone: setting.timezone,
    },
    select: { isEnabled: true, hour: true, minute: true, timezone: true },
  });
  return {
    isEnabled: saved.isEnabled,
    hour: saved.hour,
    minute: saved.minute,
    timezone: saved.timezone,
  };
}
