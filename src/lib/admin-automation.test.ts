// src/lib/admin-automation.test.ts: uji aturan otomasi per-user (murni, tanpa DB).

import { describe, expect, it } from "vitest";

import {
  assessTodayRun,
  describeTodayRun,
  jakartaDayRange,
  scheduleLabel,
} from "./admin-automation";

describe("scheduleLabel", () => {
  it("memformat jam:menit dua digit dengan sufiks WIB", () => {
    expect(scheduleLabel(7, 30)).toBe("07:30 WIB");
    expect(scheduleLabel(0, 0)).toBe("00:00 WIB");
    expect(scheduleLabel(23, 59)).toBe("23:59 WIB");
  });
});

describe("jakartaDayRange", () => {
  it("membentuk [00:00, 24:00) WIB sebagai UTC (+07:00)", () => {
    // 2026-01-02 17:30 UTC = 2026-01-03 00:30 WIB (UTC+7).
    const r = jakartaDayRange(new Date("2026-01-02T17:30:00Z"));
    expect(r).not.toBeNull();
    // Hari WIB = 2026-01-03 → mulai 2026-01-02T17:00:00Z.
    expect(r!.start.toISOString()).toBe("2026-01-02T17:00:00.000Z");
    expect(r!.end.toISOString()).toBe("2026-01-03T17:00:00.000Z");
  });

  it("tetap memakai hari WIB walau UTC masih hari sebelumnya", () => {
    // 2026-01-02 22:00 UTC = 2026-01-03 05:00 WIB → hari WIB = 03.
    const r = jakartaDayRange(new Date("2026-01-02T22:00:00Z"));
    expect(r!.start.toISOString()).toBe("2026-01-02T17:00:00.000Z");
  });

  it("siang hari UTC jatuh di hari WIB yang sama", () => {
    // 2026-06-10 05:00 UTC = 2026-06-10 12:00 WIB → hari WIB = 10.
    const r = jakartaDayRange(new Date("2026-06-10T05:00:00Z"));
    expect(r!.start.toISOString()).toBe("2026-06-09T17:00:00.000Z");
    expect(r!.end.toISOString()).toBe("2026-06-10T17:00:00.000Z");
  });

  it("tanggal tidak sah → null (bukan rentang rusak)", () => {
    expect(jakartaDayRange(new Date("bukan-tanggal"))).toBeNull();
  });
});

describe("assessTodayRun", () => {
  const now = new Date("2026-01-03T05:00:00Z"); // 12:00 WIB 03 Jan

  it("tanpa log → BELUM", () => {
    const v = assessTodayRun([], now);
    expect(v.status).toBe("BELUM");
    expect(v.lastAt).toBeNull();
  });

  it("log SUCCESS hari ini → SELESAI", () => {
    const v = assessTodayRun(
      [{ status: "SUCCESS", createdAt: new Date("2026-01-03T00:30:00Z") }],
      now,
    );
    expect(v.status).toBe("SELESAI");
    expect(v.lastAt?.toISOString()).toBe("2026-01-03T00:30:00.000Z");
  });

  it("log kemarin (WIB) → BELUM", () => {
    // 2026-01-02T20:00Z = 03:00 WIB 03 Jan... justru hari ini. Pakai 02 Jan.
    const v = assessTodayRun(
      [{ status: "SUCCESS", createdAt: new Date("2026-01-01T20:00:00Z") }],
      now,
    );
    expect(v.status).toBe("BELUM");
  });

  it("log tepat di batas awal hari WIB dianggap hari ini", () => {
    const v = assessTodayRun(
      [{ status: "SUCCESS", createdAt: new Date("2026-01-02T17:00:00Z") }],
      now,
    );
    expect(v.status).toBe("SELESAI");
  });

  it("log tepat di batas akhir hari WIB dianggap BESOK (bukan hari ini)", () => {
    const v = assessTodayRun(
      [{ status: "SUCCESS", createdAt: new Date("2026-01-03T17:00:00Z") }],
      now,
    );
    expect(v.status).toBe("BELUM");
  });

  it("log terakhir FAILED → GAGAL (walau ada SUCCESS sebelumnya)", () => {
    const v = assessTodayRun(
      [
        { status: "SUCCESS", createdAt: new Date("2026-01-03T00:00:00Z") },
        { status: "FAILED", createdAt: new Date("2026-01-03T02:00:00Z") },
      ],
      now,
    );
    expect(v.status).toBe("GAGAL");
    expect(v.lastAt?.toISOString()).toBe("2026-01-03T02:00:00.000Z");
  });

  it("DUPLICATE dianggap SELESAI (bukan gagal)", () => {
    const v = assessTodayRun(
      [{ status: "DUPLICATE", createdAt: new Date("2026-01-03T01:00:00Z") }],
      now,
    );
    expect(v.status).toBe("SELESAI");
  });

  it("log di luar hari ini diabaikan saat menentukan log terakhir", () => {
    const v = assessTodayRun(
      [
        { status: "FAILED", createdAt: new Date("2026-01-02T00:00:00Z") }, // kemarin WIB
        { status: "SUCCESS", createdAt: new Date("2026-01-03T01:00:00Z") },
      ],
      now,
    );
    expect(v.status).toBe("SELESAI");
    expect(v.lastAt?.toISOString()).toBe("2026-01-03T01:00:00.000Z");
  });
});

describe("describeTodayRun", () => {
  it("memberi label Indonesia untuk tiap status", () => {
    expect(describeTodayRun("SELESAI")).toBe("Sudah");
    expect(describeTodayRun("GAGAL")).toBe("Gagal");
    expect(describeTodayRun("BELUM")).toBe("Belum");
  });
});
