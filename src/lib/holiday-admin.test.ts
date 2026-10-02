// src/lib/holiday-admin.test.ts: uji logika MURNI pengelolaan libur admin.
//
// Fokus pada INVARIAN yang menentukan keselamatan: validasi menolak tanggal
// rusak/akhir pekan/di luar program, normalisasi membuang spasi, dan pengurutan
// stabil. Tanpa tes ini, satu bug validasi bisa membuat otomasi melewati hari
// kerja yang seharusnya dikirim.

import { describe, it, expect } from "vitest";
import {
  HOLIDAY_NAME_MAX,
  isSeedHolidayId,
  isWeekendPlainDate,
  partitionHolidays,
  SEED_ID_PREFIX,
  sortHolidays,
  validateHolidayInput,
  weekdayOfPlainDate,
} from "./holiday-admin";

describe("isSeedHolidayId", () => {
  it("id berawalan seed: dikenali sebagai baris bawaan", () => {
    expect(isSeedHolidayId(`${SEED_ID_PREFIX}2026-12-25`)).toBe(true);
  });

  it("id DB biasa (cuid) BUKAN baris seed", () => {
    expect(isSeedHolidayId("clx123abc")).toBe(false);
  });
});

describe("weekdayOfPlainDate", () => {
  it("0 untuk Minggu, 6 untuk Sabtu, 1 untuk Senin", () => {
    expect(weekdayOfPlainDate("2026-09-20")).toBe(0); // Minggu
    expect(weekdayOfPlainDate("2026-09-19")).toBe(6); // Sabtu
    expect(weekdayOfPlainDate("2026-09-21")).toBe(1); // Senin
  });

  it("isWeekendPlainDate benar hanya untuk Sabtu/Minggu", () => {
    expect(isWeekendPlainDate("2026-09-19")).toBe(true);
    expect(isWeekendPlainDate("2026-09-20")).toBe(true);
    expect(isWeekendPlainDate("2026-09-21")).toBe(false);
  });
});

describe("validateHolidayInput", () => {
  it("menerima tanggal kerja valid & memangkas spasi", () => {
    const hasil = validateHolidayInput({
      date: "  2026-12-25  ",
      name: "  Hari Raya Natal  ",
      kind: "  Nasional ",
    });
    expect(hasil).toEqual({
      ok: true,
      date: "2026-12-25",
      name: "Hari Raya Natal",
      kind: "Nasional",
    });
  });

  it("jenis kosong → default 'Nasional'", () => {
    const hasil = validateHolidayInput({
      date: "2026-12-25",
      name: "Natal",
      kind: "   ",
    });
    expect(hasil.ok && hasil.kind).toBe("Nasional");
  });

  it("menolak tanggal kosong", () => {
    const hasil = validateHolidayInput({ date: "", name: "X" });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.field).toBe("date");
  });

  it("menolak tanggal yang bentuknya salah", () => {
    const hasil = validateHolidayInput({ date: "2026-2-5", name: "X" });
    expect(hasil.ok).toBe(false);
  });

  it("menolak tanggal yang tidak ada di kalender (2026-02-30)", () => {
    const hasil = validateHolidayInput({ date: "2026-02-30", name: "X" });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.field).toBe("date");
  });

  it("menolak akhir pekan dengan alasan yang jelas", () => {
    const hasil = validateHolidayInput({ date: "2026-12-26", name: "X" });
    // 2026-12-26 = Sabtu.
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.error).toMatch(/akhir pekan/i);
  });

  it("menolak tanggal di luar masa program (> 2027-02-09)", () => {
    const hasil = validateHolidayInput({ date: "2027-03-01", name: "X" });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.error).toMatch(/masa program/i);
  });

  it("menolak nama kosong", () => {
    const hasil = validateHolidayInput({ date: "2026-12-25", name: "   " });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.field).toBe("name");
  });

  it("menolak nama terlalu panjang", () => {
    const hasil = validateHolidayInput({
      date: "2026-12-25",
      name: "x".repeat(HOLIDAY_NAME_MAX + 1),
    });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.field).toBe("name");
  });
});

describe("sortHolidays", () => {
  it("mengurutkan menaik & tidak mengubah array asal", () => {
    const asal = [
      { date: "2027-01-01" },
      { date: "2026-12-24" },
      { date: "2026-12-31" },
    ];
    const hasil = sortHolidays(asal);
    expect(hasil.map((r) => r.date)).toEqual([
      "2026-12-24",
      "2026-12-31",
      "2027-01-01",
    ]);
    // Array asal tidak tersentuh (salinan).
    expect(asal[0].date).toBe("2027-01-01");
  });
});

describe("partitionHolidays", () => {
  it("memisahkan yang akan datang dari yang sudah lewat", () => {
    const rows = [
      { date: "2026-12-24" },
      { date: "2026-09-20" },
      { date: "2027-01-01" },
    ];
    const { upcoming, past } = partitionHolidays(rows, "2026-12-01");
    expect(upcoming.map((r) => r.date)).toEqual(["2026-12-24", "2027-01-01"]);
    expect(past.map((r) => r.date)).toEqual(["2026-09-20"]);
  });
});
