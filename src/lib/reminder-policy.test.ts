// src/lib/reminder-policy.test.ts: uji logika MURNI pengingat "belum absen".
//
// Fokus pada INVARIAN yang menentukan keselamatan fitur: pengingat TIDAK
// muncul di hari libur, TIDAK muncul sebelum jam setelan, dan TIDAK muncul bila
// user sudah absen. Tanpa tes ini, satu bug bisa memunculkan popup bertubi-tubi
// kepada user yang sudah absen, atau diam total padahal seharusnya muncul.

import { describe, it, expect } from "vitest";
import {
  isReminderWindowOpen,
  jakartaClock,
  reminderScheduleLabel,
  shouldShowReminder,
  validateReminderSettingInput,
  type ReminderFacts,
  type ReminderSettingView,
} from "./reminder-policy";

/** Setelan aktif jam 09:00, dipakai di banyak tes. */
const AKTIF_09: ReminderSettingView = {
  isEnabled: true,
  hour: 9,
  minute: 0,
  timezone: "Asia/Jakarta",
};

/** Fakta default: hari kerja, belum absen. Tiap tes menimpa yang perlu. */
function fakta(overrides: Partial<ReminderFacts> = {}): ReminderFacts {
  return {
    nowHour: 9,
    nowMinute: 0,
    isWorkingDay: true,
    hasSubmittedToday: false,
    ...overrides,
  };
}

describe("isReminderWindowOpen", () => {
  it("tertutup sebelum jam setelan", () => {
    expect(isReminderWindowOpen(8, 59, 9, 0)).toBe(false);
  });

  it("terbuka TEPAT pada jam setelan", () => {
    expect(isReminderWindowOpen(9, 0, 9, 0)).toBe(true);
  });

  it("tetap terbuka setelah jam setelan (sampai tengah malam)", () => {
    expect(isReminderWindowOpen(23, 59, 9, 0)).toBe(true);
  });

  it("menit ikut diperhitungkan dalam jam yang sama", () => {
    // Jam 09:00, setelan 09:30 → belum terbuka.
    expect(isReminderWindowOpen(9, 0, 9, 30)).toBe(false);
    expect(isReminderWindowOpen(9, 30, 9, 30)).toBe(true);
  });

  it("jam/menit saat ini tidak sah → false (jangan muncul di waktu acak)", () => {
    expect(isReminderWindowOpen(24, 0, 9, 0)).toBe(false);
    expect(isReminderWindowOpen(-1, 0, 9, 0)).toBe(false);
  });

  it("jam/menit setelan tidak sah → false", () => {
    expect(isReminderWindowOpen(12, 0, 99, 0)).toBe(false);
  });
});

describe("shouldShowReminder", () => {
  it("muncul: fitur aktif, hari kerja, sudah lewat jam, belum absen", () => {
    expect(shouldShowReminder(AKTIF_09, fakta())).toBe(true);
  });

  it("TIDAK muncul bila fitur dimatikan admin", () => {
    const setting = { ...AKTIF_09, isEnabled: false };
    expect(shouldShowReminder(setting, fakta())).toBe(false);
  });

  it("TIDAK muncul di hari libur/akhir pekan, walau belum absen", () => {
    expect(shouldShowReminder(AKTIF_09, fakta({ isWorkingDay: false }))).toBe(
      false,
    );
  });

  it("TIDAK muncul sebelum jam setelan", () => {
    expect(
      shouldShowReminder(AKTIF_09, fakta({ nowHour: 8, nowMinute: 59 })),
    ).toBe(false);
  });

  it("TIDAK muncul bila user sudah absen hari ini", () => {
    expect(shouldShowReminder(AKTIF_09, fakta({ hasSubmittedToday: true }))).toBe(
      false,
    );
  });

  it("hari libur menang atas 'belum absen' (prioritas pemeriksaan)", () => {
    const setting = { ...AKTIF_09, isEnabled: true };
    expect(
      shouldShowReminder(
        setting,
        fakta({ isWorkingDay: false, hasSubmittedToday: false }),
      ),
    ).toBe(false);
  });
});

describe("jakartaClock", () => {
  it("memecah tanggal & jam di WIB, bukan UTC", () => {
    // 2026-09-21T02:30:00Z = 09:30 WIB pada tanggal yang sama.
    const clock = jakartaClock(new Date("2026-09-21T02:30:00.000Z"));
    expect(clock).toEqual({ date: "2026-09-21", hour: 9, minute: 30 });
  });

  it("dini hari WIB tetap tanggal WIB, walau UTC masih hari sebelumnya", () => {
    // 2026-09-20T18:00:00Z = 01:00 WIB tanggal 21 September.
    const clock = jakartaClock(new Date("2026-09-20T18:00:00.000Z"));
    expect(clock).toEqual({ date: "2026-09-21", hour: 1, minute: 0 });
  });
});

describe("reminderScheduleLabel", () => {
  it("memformat dua digit + WIB", () => {
    expect(reminderScheduleLabel(8, 0)).toBe("08:00 WIB");
    expect(reminderScheduleLabel(9, 5)).toBe("09:05 WIB");
  });
});

describe("validateReminderSettingInput", () => {
  it("menerima angka & string angka, menormalkan ke number", () => {
    const res = validateReminderSettingInput({
      isEnabled: true,
      hour: "9",
      minute: "0",
    });
    expect(res).toEqual({
      ok: true,
      setting: { isEnabled: true, hour: 9, minute: 0, timezone: "Asia/Jakarta" },
    });
  });

  it("isEnabled selain true menjadi false (aman, bukan error)", () => {
    const res = validateReminderSettingInput({
      isEnabled: "kadang",
      hour: 8,
      minute: 0,
    });
    expect(res.ok && res.setting.isEnabled).toBe(false);
  });

  it("menolak jam di luar 0–23", () => {
    const res = validateReminderSettingInput({ hour: 24, minute: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("hour");
  });

  it("menolak menit di luar 0–59", () => {
    const res = validateReminderSettingInput({ hour: 8, minute: 60 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("minute");
  });

  it("menolak nilai bukan angka (mis. kosong dari form)", () => {
    expect(validateReminderSettingInput({ hour: "", minute: 0 }).ok).toBe(false);
    expect(validateReminderSettingInput({ hour: 8, minute: "abc" }).ok).toBe(
      false,
    );
  });

  it("selalu memakai zona Asia/Jakarta, mengabaikan input timezone", () => {
    const res = validateReminderSettingInput({
      hour: 8,
      minute: 0,
      timezone: "America/New_York",
    } as never);
    expect(res.ok && res.setting.timezone).toBe("Asia/Jakarta");
  });
});
