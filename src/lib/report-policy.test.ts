// src/lib/report-policy.test.ts — uji aturan bisnis SPEC.md §11B.
//
// Aturan ini menentukan KAPAN server boleh menyentuh portal. Salah di sini
// berarti mengirim laporan di hari libur, atau terus berjalan setelah program
// berakhir (2027-02-10) — keduanya tidak bisa diterima. Semua murni, tidak ada
// jaringan.

import { describe, it, expect } from "vitest";
import {
  LAST_ACTIVE_DATE,
  JADWAL_CADANGAN,
  checkReportContent,
  decide,
  isAfter,
  isHoliday,
  isPlainDate,
  isWorkingDay,
} from "./report-policy";

describe("isPlainDate", () => {
  it("menerima tanggal sah", () => {
    expect(isPlainDate("2026-09-22")).toBe(true);
    expect(isPlainDate("2027-02-09")).toBe(true);
  });
  it("menolak pola salah", () => {
    expect(isPlainDate("2026-9-22")).toBe(false);
    expect(isPlainDate("22-09-2026")).toBe(false);
    expect(isPlainDate("")).toBe(false);
  });
  it("menolak tanggal yang tidak ada di kalender", () => {
    expect(isPlainDate("2026-02-30")).toBe(false);
    expect(isPlainDate("2026-13-01")).toBe(false);
  });
});

describe("isAfter", () => {
  it("membandingkan secara kronologis", () => {
    expect(isAfter("2027-02-10", LAST_ACTIVE_DATE)).toBe(true);
    expect(isAfter("2027-02-09", LAST_ACTIVE_DATE)).toBe(false);
    expect(isAfter("2026-01-01", "2026-01-02")).toBe(false);
  });
});

describe("isHoliday / isWorkingDay", () => {
  it("Sabtu & Minggu libur", () => {
    // 2026-09-19 Sabtu, 2026-09-20 Minggu
    expect(isHoliday("2026-09-19")).toBe(true);
    expect(isHoliday("2026-09-20")).toBe(true);
  });
  it("hari kerja biasa bukan libur", () => {
    // 2026-09-22 Selasa
    expect(isHoliday("2026-09-22")).toBe(false);
    expect(isWorkingDay("2026-09-22")).toBe(true);
  });
});

describe("decide — keputusan utama", () => {
  it("ALLOW pada hari kerja sebelum batas akhir", () => {
    expect(decide("2026-09-22")).toBe("ALLOW"); // Selasa
  });
  it("SKIPPED pada akhir pekan", () => {
    expect(decide("2026-09-19")).toBe("SKIPPED"); // Sabtu
  });
  it("PROGRAM_ENDED mulai 2027-02-10", () => {
    expect(decide("2027-02-10")).toBe("PROGRAM_ENDED");
  });
  it("hari terakhir (2027-02-09) masih boleh (hari kerja)", () => {
    // 2027-02-09 adalah Selasa.
    expect(decide(LAST_ACTIVE_DATE)).toBe("ALLOW");
  });
  it("PROGRAM_ENDED diperiksa lebih dulu daripada libur akhir pekan", () => {
    // 2027-02-13 adalah Sabtu SETELAH batas — harus PROGRAM_ENDED, bukan SKIPPED.
    expect(decide("2027-02-13")).toBe("PROGRAM_ENDED");
  });
  it("melempar pada tanggal tidak sah", () => {
    expect(() => decide("bukan-tanggal")).toThrow();
  });
});

describe("checkReportContent", () => {
  const A100 = "a".repeat(100);
  const ok = { activity: A100, learning: A100, obstacles: A100 };

  it("menerima isi yang cukup panjang", () => {
    expect(checkReportContent(ok)).toBeNull();
  });
  it("menolak field yang kurang dari 100 karakter", () => {
    expect(checkReportContent({ ...ok, learning: "pendek" })).toMatch(
      /Pembelajaran/,
    );
  });
  it("spasi tepi tidak dihitung (seragam dgn portal)", () => {
    const teks = `  ${A100}  `;
    expect(checkReportContent({ ...ok, activity: teks })).toBeNull();
  });
  it("menyebut nama kolom yang salah", () => {
    expect(checkReportContent({ ...ok, obstacles: "" })).toMatch(/Kendala/);
  });
});

describe("JADWAL_CADANGAN", () => {
  it("dua slot: 16:30 dan 20:00", () => {
    expect([...JADWAL_CADANGAN]).toEqual(["16:30", "20:00"]);
  });
});
