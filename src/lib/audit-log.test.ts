// src/lib/audit-log.test.ts: uji penampil audit log (murni).

import { describe, it, expect } from "vitest";

import {
  ALL_USERS,
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimestamp,
  formatJakartaTimeOnly,
  paginate,
  parsePage,
  parseRangeFilter,
  parseStatusFilter,
  parseUserFilter,
  rangeDays,
  rangeStartDate,
  summarizeLogs,
  DEFAULT_RANGE,
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
  it("membedakan manual dan otomatis", () => {
    expect(describeTrigger("MANUAL")).toBe("Manual");
    expect(describeTrigger("CRON")).toBe("Otomatis");
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

describe("formatJakartaTimeOnly", () => {
  it("hanya jam:menit di zona Asia/Jakarta", () => {
    // 2026-01-02T17:30:00Z = 2026-01-03 00:30 WIB.
    expect(formatJakartaTimeOnly(new Date("2026-01-02T17:30:00Z"))).toBe("00:30");
  });

  it("tengah malam WIB → 00:00, bukan 24:00", () => {
    // 2026-01-02T17:00:00Z = 2026-01-03 00:00 WIB.
    expect(formatJakartaTimeOnly(new Date("2026-01-02T17:00:00Z"))).toBe("00:00");
  });

  it("tanggal tidak sah → null", () => {
    expect(formatJakartaTimeOnly(new Date("bukan-tanggal"))).toBeNull();
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

describe("parseRangeFilter", () => {
  it("menerima nilai yang sah (case-insensitive)", () => {
    expect(parseRangeFilter("7d")).toBe("7d");
    expect(parseRangeFilter("30D")).toBe("30d");
    expect(parseRangeFilter("90d")).toBe("90d");
    expect(parseRangeFilter("1y")).toBe("1y");
    expect(parseRangeFilter("ALL")).toBe("ALL");
    expect(parseRangeFilter(" all ")).toBe("ALL");
  });

  it("jatuh ke default untuk nilai kosong/tak dikenal", () => {
    expect(parseRangeFilter(undefined)).toBe(DEFAULT_RANGE);
    expect(parseRangeFilter("")).toBe(DEFAULT_RANGE);
    expect(parseRangeFilter("2w")).toBe(DEFAULT_RANGE);
    expect(parseRangeFilter("'; DROP TABLE")).toBe(DEFAULT_RANGE);
  });

  it("default-nya 30d, bukan ALL (query tetap ringan)", () => {
    expect(DEFAULT_RANGE).toBe("30d");
  });
});

describe("rangeDays", () => {
  it("memetakan tiap rentang ke jumlah hari", () => {
    expect(rangeDays("7d")).toBe(7);
    expect(rangeDays("30d")).toBe(30);
    expect(rangeDays("90d")).toBe(90);
    expect(rangeDays("1y")).toBe(365);
  });

  it("ALL = null (tanpa batas)", () => {
    expect(rangeDays("ALL")).toBeNull();
  });
});

describe("rangeStartDate", () => {
  // 10 Juli 2026, 08:00 WIB (01:00 UTC).
  const now = new Date("2026-07-10T01:00:00.000Z");

  it("7 hari mencakup hari ini: mulai 6 hari ke belakang, awal hari WIB", () => {
    const start = rangeStartDate("7d", now);
    // 4 Juli 2026 00:00 WIB = 3 Juli 2026 17:00 UTC.
    expect(start?.toISOString()).toBe("2026-07-03T17:00:00.000Z");
  });

  it("30 hari mulai 29 hari ke belakang", () => {
    const start = rangeStartDate("30d", now);
    // 11 Juni 2026 00:00 WIB = 10 Juni 2026 17:00 UTC.
    expect(start?.toISOString()).toBe("2026-06-10T17:00:00.000Z");
  });

  it("ALL tidak punya batas bawah", () => {
    expect(rangeStartDate("ALL", now)).toBeNull();
  });

  it("memakai batas hari WIB, bukan zona server (jam 00:30 WIB tetap hari ini)", () => {
    // 10 Juli 2026 00:30 WIB = 9 Juli 2026 17:30 UTC. Tanpa WIB, ini akan
    // dianggap tanggal 9 dan batasnya bergeser sehari.
    const dini = new Date("2026-07-09T17:30:00.000Z");
    const start = rangeStartDate("7d", dini);
    expect(start?.toISOString()).toBe("2026-07-03T17:00:00.000Z");
  });
});



describe("parseUserFilter", () => {
  it("meneruskan id yang wajar apa adanya", () => {
    expect(parseUserFilter("clx123abc")).toBe("clx123abc");
    expect(parseUserFilter("abc-DEF_123")).toBe("abc-DEF_123");
    expect(parseUserFilter("  clx9  ")).toBe("clx9");
  });

  it("kosong/absen berarti semua pengguna", () => {
    expect(parseUserFilter(undefined)).toBe(ALL_USERS);
    expect(parseUserFilter("")).toBe(ALL_USERS);
    expect(parseUserFilter("   ")).toBe(ALL_USERS);
    expect(parseUserFilter(ALL_USERS)).toBe(ALL_USERS);
  });

  it("menolak nilai mencurigakan (kembali ke semua)", () => {
    expect(parseUserFilter("DROP TABLE users")).toBe(ALL_USERS);
    expect(parseUserFilter("a".repeat(65))).toBe(ALL_USERS);
    expect(parseUserFilter("id<script>")).toBe(ALL_USERS);
    expect(parseUserFilter("a/b")).toBe(ALL_USERS);
  });

  it("id tepat 64 karakter masih diterima", () => {
    const id = "a".repeat(64);
    expect(parseUserFilter(id)).toBe(id);
  });
});
