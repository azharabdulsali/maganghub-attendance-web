import { describe, expect, it } from "vitest";

import { recentWorkingDays, shiftPlainDate } from "./landing-sheet-dates";

// Tanggal di bawah sudah diverifikasi hari-dalam-minggunya (bukan tebakan):
// 2026-11-16 Sen, 17 Sel, 18 Rab, 19 Kam, 20 Jum, 21 Sab, 22 Min,
// 2026-11-30 Sen, 2026-12-01 Sel, 2026-12-24 Kam (libur), 2026-12-25 Jum
// (libur), 2026-12-28 Sen, 2026-12-31 Kam, 2027-01-01 Jum (libur).

describe("shiftPlainDate", () => {
  it("menggeser mundur satu hari", () => {
    expect(shiftPlainDate("2026-11-18", -1)).toBe("2026-11-17");
  });

  it("menggeser maju satu hari", () => {
    expect(shiftPlainDate("2026-11-18", 1)).toBe("2026-11-19");
  });

  it("melewati batas bulan", () => {
    expect(shiftPlainDate("2026-12-01", -1)).toBe("2026-11-30");
  });

  it("melewati batas tahun", () => {
    expect(shiftPlainDate("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("menangani tahun kabisat", () => {
    expect(shiftPlainDate("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("tidak menggeser bila delta 0", () => {
    expect(shiftPlainDate("2026-11-18", 0)).toBe("2026-11-18");
  });
});

describe("recentWorkingDays", () => {
  it("mengembalikan hari kerja terakhir, TERBARU DULU", () => {
    expect(recentWorkingDays("2026-11-18", 3)).toEqual([
      "2026-11-18",
      "2026-11-17",
      "2026-11-16",
    ]);
  });

  it("melewati Sabtu/Minggu saat hari ini akhir pekan", () => {
    // 2026-11-21 Sabtu → mulai dari Jumat.
    expect(recentWorkingDays("2026-11-21", 3)).toEqual([
      "2026-11-20",
      "2026-11-19",
      "2026-11-18",
    ]);
  });

  it("melewati Minggu", () => {
    expect(recentWorkingDays("2026-11-22", 2)).toEqual(["2026-11-20", "2026-11-19"]);
  });

  it("melewati batas bulan", () => {
    expect(recentWorkingDays("2026-12-01", 2)).toEqual(["2026-12-01", "2026-11-30"]);
  });

  it("melewati dua libur nasional berurutan", () => {
    // 2026-12-24 & 2026-12-25 libur, 26 Sabtu, 27 Minggu.
    expect(recentWorkingDays("2026-12-28", 3)).toEqual([
      "2026-12-28",
      "2026-12-23",
      "2026-12-22",
    ]);
  });

  it("melewati batas tahun sekaligus libur Tahun Baru", () => {
    // 2027-01-01 libur (Jumat) → mundur ke Kamis 2026-12-31.
    expect(recentWorkingDays("2027-01-01", 2)).toEqual(["2026-12-31", "2026-12-30"]);
  });

  it("menghormati himpunan libur tambahan dari pemanggil", () => {
    expect(recentWorkingDays("2026-11-18", 2, new Set(["2026-11-17"]))).toEqual([
      "2026-11-18",
      "2026-11-16",
    ]);
  });

  it("himpunan libur KOSONG tidak membuat akhir pekan jadi hari kerja", () => {
    // Pagar penting: mengosongkan tabel `holidays` tidak boleh membuat Sabtu
    // dianggap hari kerja.
    expect(recentWorkingDays("2026-11-21", 1, new Set())).toEqual(["2026-11-20"]);
  });

  it("count 0 mengembalikan daftar kosong", () => {
    expect(recentWorkingDays("2026-11-18", 0)).toEqual([]);
  });

  it("count negatif mengembalikan daftar kosong", () => {
    expect(recentWorkingDays("2026-11-18", -3)).toEqual([]);
  });

  it("count 1 pada hari kerja mengembalikan hari itu sendiri", () => {
    expect(recentWorkingDays("2026-11-18", 1)).toEqual(["2026-11-18"]);
  });

  it("menolak tanggal yang bentuknya salah", () => {
    expect(() => recentWorkingDays("18-11-2026", 1)).toThrow(/tidak sah/i);
  });

  it("menolak tanggal yang tidak ada di kalender", () => {
    expect(() => recentWorkingDays("2026-02-30", 1)).toThrow(/tidak sah/i);
  });
});
