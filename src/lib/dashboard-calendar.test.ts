import { describe, expect, it } from "vitest";

import { dayStatus, monthsCovered } from "./dashboard-calendar";

describe("dayStatus", () => {
  it("berhasil menang atas gagal dan duplikat", () => {
    expect(dayStatus({ success: 1, failed: 2, duplicate: 3 })).toBe("success");
  });

  it("gagal menang atas duplikat", () => {
    expect(dayStatus({ success: 0, failed: 1, duplicate: 1 })).toBe("failed");
  });

  it("duplikat dipakai bila tidak ada berhasil/gagal", () => {
    expect(dayStatus({ success: 0, failed: 0, duplicate: 1 })).toBe("duplicate");
  });

  it("tanpa log sama sekali = none", () => {
    expect(dayStatus({ success: 0, failed: 0, duplicate: 0 })).toBe("none");
  });
});

describe("monthsCovered", () => {
  it("mengambil bulan unik dan mengurutkannya", () => {
    expect(
      monthsCovered(["2026-03-01", "2026-01-15", "2026-03-31", "2026-02-01"]),
    ).toEqual([
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ]);
  });

  it("melewati pergantian tahun", () => {
    expect(monthsCovered(["2026-12-20", "2027-01-05"])).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it("mengabaikan tanggal yang bentuknya tidak sah atau bulan mustahil", () => {
    expect(monthsCovered(["bukan-tanggal", "2026-13-01", "2026-01-10"])).toEqual(
      [{ year: 2026, month: 1 }],
    );
  });

  it("daftar kosong = tidak ada bulan", () => {
    expect(monthsCovered([])).toEqual([]);
  });
});
