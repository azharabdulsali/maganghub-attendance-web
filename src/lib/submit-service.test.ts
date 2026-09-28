// src/lib/submit-service.test.ts — uji keputusan murni orkestrasi submit.
//
// Tidak menyentuh jaringan maupun database: semua fungsi di sini murni.

import { describe, it, expect } from "vitest";

import {
  todayInJakarta,
  policyMessage,
  submitStatusFor,
  payloadFromTemplate,
  assessReadiness,
} from "./submit-service";

describe("todayInJakarta", () => {
  it("memakai zona Asia/Jakarta, bukan UTC (jam 23:30 UTC = besok WIB)", () => {
    // 2027-02-09T23:30Z = 2027-02-10T06:30 WIB → harus tanggal 10.
    const d = todayInJakarta(new Date("2027-02-09T23:30:00Z"));
    expect(d).toBe("2027-02-10");
  });

  it("jam 00:00 WIB tetap tanggal itu (bukan kemarin)", () => {
    // 2026-03-02T00:00 WIB = 2026-03-01T17:00Z.
    const d = todayInJakarta(new Date("2026-03-01T17:00:00Z"));
    expect(d).toBe("2026-03-02");
  });

  it("selalu berbentuk YYYY-MM-DD", () => {
    expect(todayInJakarta(new Date("2026-07-04T12:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("policyMessage", () => {
  it("memberi pesan berbeda untuk tiap keputusan", () => {
    expect(policyMessage("ALLOW")).toContain("diizinkan");
    expect(policyMessage("SKIPPED")).toContain("libur");
    expect(policyMessage("PROGRAM_ENDED")).toContain("berakhir");
  });
});

describe("submitStatusFor", () => {
  it("SUCCESS → SUCCESS", () => {
    expect(submitStatusFor({ status: "SUCCESS" })).toBe("SUCCESS");
  });

  it("ALREADY_SUBMITTED → DUPLICATE (bukan FAILED)", () => {
    expect(submitStatusFor({ status: "ALREADY_SUBMITTED" })).toBe("DUPLICATE");
  });

  it("ERROR / tak dikenal → FAILED", () => {
    expect(submitStatusFor({ status: "ERROR" })).toBe("FAILED");
    expect(submitStatusFor({ status: "misterius" })).toBe("FAILED");
  });
});

describe("payloadFromTemplate", () => {
  it("merakit payload dengan tanggal yang diberikan", () => {
    const p = payloadFromTemplate(
      { activity: "A", learning: "B", obstacles: "C" },
      "2026-03-02",
    );
    expect(p).toEqual({
      activity: "A",
      learning: "B",
      obstacles: "C",
      date: "2026-03-02",
    });
  });
});

describe("assessReadiness", () => {
  it("hari kerja + template + token → ready", () => {
    // 2026-03-02 adalah Senin.
    const r = assessReadiness({
      date: "2026-03-02",
      hasTemplate: true,
      hasToken: true,
    });
    expect(r.ready).toBe(true);
    if (r.ready) expect(r.decision).toBe("ALLOW");
  });

  it("akhir pekan → POLICY_SKIPPED (diperiksa sebelum kekurangan data)", () => {
    // 2026-03-07 adalah Sabtu. Bahkan tanpa template/token, alasan = libur.
    const r = assessReadiness({
      date: "2026-03-07",
      hasTemplate: false,
      hasToken: false,
    });
    expect(r.ready).toBe(false);
    if (!r.ready) expect(r.reason).toBe("POLICY_SKIPPED");
  });

  it("lewat 2027-02-09 → PROGRAM_ENDED (menang atas alasan lain)", () => {
    const r = assessReadiness({
      date: "2027-02-10",
      hasTemplate: true,
      hasToken: true,
    });
    expect(r.ready).toBe(false);
    if (!r.ready) expect(r.reason).toBe("PROGRAM_ENDED");
  });

  it("hari kerja tanpa template → NO_TEMPLATE", () => {
    const r = assessReadiness({
      date: "2026-03-02",
      hasTemplate: false,
      hasToken: true,
    });
    expect(r.ready).toBe(false);
    if (!r.ready) expect(r.reason).toBe("NO_TEMPLATE");
  });

  it("hari kerja + template tetapi tanpa token → NO_TOKEN", () => {
    const r = assessReadiness({
      date: "2026-03-02",
      hasTemplate: true,
      hasToken: false,
    });
    expect(r.ready).toBe(false);
    if (!r.ready) expect(r.reason).toBe("NO_TOKEN");
  });

  it("tanggal tidak sah → melempar (meneruskan perilaku decide())", () => {
    expect(() =>
      assessReadiness({ date: "2026-3-2", hasTemplate: true, hasToken: true }),
    ).toThrow();
  });
});
