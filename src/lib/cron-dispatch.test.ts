// Tes untuk src/lib/cron-dispatch.ts — aturan seleksi cron massal (murni).
import { describe, expect, it } from "vitest";

import {
  jakartaHour,
  isDueNow,
  planDispatch,
  type DueCandidate,
} from "./cron-dispatch";

const c = (userId: string, hour: number, minute = 0): DueCandidate => ({
  userId,
  hour,
  minute,
});

describe("jakartaHour", () => {
  it("mengubah UTC menjadi jam WIB (+7)", () => {
    // 2026-01-15 00:30 UTC = 07:30 WIB
    expect(jakartaHour(new Date("2026-01-15T00:30:00Z"))).toBe(7);
  });

  it("membungkus tengah malam WIB ke 0, bukan 24", () => {
    // 2026-01-15 17:00 UTC = 2026-01-16 00:00 WIB
    expect(jakartaHour(new Date("2026-01-15T17:00:00Z"))).toBe(0);
  });

  it("memberi 23 pada 23:xx WIB", () => {
    // 2026-01-15 16:30 UTC = 23:30 WIB
    expect(jakartaHour(new Date("2026-01-15T16:30:00Z"))).toBe(23);
  });
});

describe("isDueNow", () => {
  it("cocok bila jam jadwal sama dengan jam sekarang", () => {
    expect(isDueNow(c("u1", 7, 30), 7)).toBe(true);
  });

  it("tidak cocok bila jam berbeda", () => {
    expect(isDueNow(c("u1", 7), 8)).toBe(false);
  });

  it("mengabaikan menit — 07:59 tetap jatuh tempo pada jam 7", () => {
    expect(isDueNow(c("u1", 7, 59), 7)).toBe(true);
  });
});

describe("planDispatch", () => {
  it("hanya memilih yang jam jadwalnya sama dengan jam sekarang", () => {
    const plan = planDispatch([c("a", 7), c("b", 8), c("c", 7)], 7, 10);
    expect(plan.due.map((x) => x.userId)).toEqual(["a", "c"]);
    expect(plan.deferred).toEqual([]);
  });

  it("membatasi jumlah per pemanggilan dan menunda sisanya", () => {
    const plan = planDispatch([c("a", 7), c("b", 7), c("c", 7)], 7, 2);
    expect(plan.due.map((x) => x.userId)).toEqual(["a", "b"]);
    expect(plan.deferred.map((x) => x.userId)).toEqual(["c"]);
  });

  it("batchSize <= 0 menunda semua (tidak memproses apa pun)", () => {
    const plan = planDispatch([c("a", 7)], 7, 0);
    expect(plan.due).toEqual([]);
    expect(plan.deferred.map((x) => x.userId)).toEqual(["a"]);
  });

  it("daftar kosong menghasilkan rencana kosong", () => {
    expect(planDispatch([], 7, 5)).toEqual({ due: [], deferred: [] });
  });

  it("menjaga urutan asli masukan pada both due & deferred", () => {
    const plan = planDispatch(
      [c("x", 9), c("y", 9), c("z", 9), c("w", 9)],
      9,
      2,
    );
    expect(plan.due.map((x) => x.userId)).toEqual(["x", "y"]);
    expect(plan.deferred.map((x) => x.userId)).toEqual(["z", "w"]);
  });
});
