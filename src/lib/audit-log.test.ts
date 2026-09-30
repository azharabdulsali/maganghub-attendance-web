// src/lib/audit-log.test.ts: uji penampil audit log (murni).

import { describe, it, expect } from "vitest";

import {
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimestamp,
  paginate,
  parsePage,
  parseStatusFilter,
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

describe("parseStatusFilter", () => {
  it("menerima nilai yang sah (case-insensitive)", () => {
    expect(parseStatusFilter("SUCCESS")).toBe("SUCCESS");
    expect(parseStatusFilter("failed")).toBe("FAILED");
    expect(parseStatusFilter("Duplicate")).toBe("DUPLICATE");
    expect(parseStatusFilter("ALL")).toBe("ALL");
  });

  it("jatuh ke ALL untuk nilai kosong/tak dikenal", () => {
    expect(parseStatusFilter(undefined)).toBe("ALL");
    expect(parseStatusFilter("")).toBe("ALL");
    expect(parseStatusFilter("ERROR")).toBe("ALL");
    expect(parseStatusFilter("'; DROP TABLE")).toBe("ALL");
  });
});

describe("parsePage", () => {
  it("mengembalikan angka halaman yang sah", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("7")).toBe(7);
    expect(parsePage(" 12 ")).toBe(12);
  });

  it("menjepit masukan tidak sah ke 1", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-5")).toBe(1);
    expect(parsePage("NaN")).toBe(1);
  });
});

describe("paginate", () => {
  it("menghitung jendela untuk halaman tengah", () => {
    expect(paginate(100, 3, 10)).toEqual({
      page: 3,
      pageCount: 10,
      start: 20,
      end: 30,
    });
  });

  it("menutup halaman terakhir dengan sisa item", () => {
    expect(paginate(25, 3, 10)).toEqual({
      page: 3,
      pageCount: 3,
      start: 20,
      end: 25,
    });
  });

  it("menjepit halaman di luar rentang ke halaman terakhir", () => {
    expect(paginate(25, 999, 10).page).toBe(3);
    expect(paginate(25, 999, 10).start).toBe(20);
  });

  it("daftar kosong menghasilkan satu halaman kosong, bukan NaN", () => {
    expect(paginate(0, 1, 10)).toEqual({
      page: 1,
      pageCount: 1,
      start: 0,
      end: 0,
    });
  });

  it("menahan pageSize <= 0 agar tidak bagi nol", () => {
    const p = paginate(10, 1, 0);
    expect(p.pageCount).toBe(10);
    expect(Number.isFinite(p.start)).toBe(true);
  });
});
