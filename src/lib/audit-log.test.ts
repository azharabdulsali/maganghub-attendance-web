// src/lib/audit-log.test.ts — uji penampil audit log (murni).

import { describe, it, expect } from "vitest";

import {
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimestamp,
  summarizeLogs,
  type AuditRow,
} from "./audit-log";

describe("describeSubmitStatus", () => {
  it("memberi label Indonesia untuk tiap status", () => {
    expect(describeSubmitStatus("SUCCESS")).toBe("Terkirim");
    expect(describeSubmitStatus("DUPLICATE")).toBe("Sudah ada");
    expect(describeSubmitStatus("FAILED")).toBe("Gagal");
  });
});

describe("badgeVariant", () => {
  it("sukses hijau, gagal merah, duplikat kuning", () => {
    expect(badgeVariant("SUCCESS")).toBe("success");
    expect(badgeVariant("FAILED")).toBe("failure");
    expect(badgeVariant("DUPLICATE")).toBe("warning");
  });
});

describe("describeTrigger", () => {
  it("membedakan manual dan cron", () => {
    expect(describeTrigger("MANUAL")).toBe("Manual");
    expect(describeTrigger("CRON")).toBe("Otomatis (cron)");
  });
});

describe("formatJakartaTimestamp", () => {
  it("memakai zona Asia/Jakarta secara eksplisit, bukan zona server", () => {
    // 2026-01-02T17:30:00Z = 2026-01-03 00:30 WIB (UTC+7).
    const s = formatJakartaTimestamp(new Date("2026-01-02T17:30:00Z"));
    expect(s).not.toBeNull();
    expect(s).toContain("WIB");
    expect(s).toContain("03 Jan 2026");
    expect(s).toContain("00:30");
  });

  it("tanggal tidak sah → null (bukan 'Invalid Date')", () => {
    expect(formatJakartaTimestamp(new Date("bukan-tanggal"))).toBeNull();
  });
});

describe("summarizeLogs", () => {
  const rows: AuditRow[] = [
    { status: "SUCCESS", createdAt: new Date("2026-01-01T00:00:00Z") },
    { status: "FAILED", createdAt: new Date("2026-01-02T00:00:00Z") },
    { status: "SUCCESS", createdAt: new Date("2026-01-03T00:00:00Z") },
    { status: "DUPLICATE", createdAt: new Date("2026-01-02T12:00:00Z") },
  ];

  it("menghitung tiap status dan totalnya", () => {
    const s = summarizeLogs(rows);
    expect(s.total).toBe(4);
    expect(s.success).toBe(2);
    expect(s.duplicate).toBe(1);
    expect(s.failed).toBe(1);
  });

  it("lastAt = waktu log terbaru", () => {
    const s = summarizeLogs(rows);
    expect(s.lastAt?.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });

  it("daftar kosong → semua nol, lastAt null (bukan NaN)", () => {
    const s = summarizeLogs([]);
    expect(s).toEqual({
      total: 0,
      success: 0,
      duplicate: 0,
      failed: 0,
      lastAt: null,
    });
  });
});
