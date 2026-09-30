// src/lib/calendar.test.ts — uji perhitungan kalender (murni, tanpa DB).

import { describe, it, expect } from "vitest";

import {
  buildMonthGrid,
  classifyDay,
  collectReportDates,
  currentJakartaMonth,
  daysInMonth,
  groupLogsByDate,
  holidayKindOf,
  jakartaISODate,
  lastJakartaDays,
  monthToParam,
  MONTH_LABELS,
  nextMonth,
  parseMonth,
  prevMonth,
  reportISODate,
  startOfJakartaDay,
  WEEKDAY_LABELS,
} from "./calendar";

describe("parseMonth", () => {
  const now = new Date("2026-09-15T03:00:00.000Z");

  it("membaca YYYY-MM yang sah", () => {
    expect(parseMonth("2026-01", now)).toEqual({ year: 2026, month: 1 });
    expect(parseMonth("2025-12", now)).toEqual({ year: 2025, month: 12 });
  });

  it("jatuh ke bulan berjalan untuk masukan tidak sah", () => {
    const fallback = currentJakartaMonth(now);
    for (const bad of [undefined, "", "nope", "2026", "2026-13", "2026-00", "1000-01"]) {
      expect(parseMonth(bad, now)).toEqual(fallback);
    }
  });
});

describe("monthToParam", () => {
  it("mem- padding tahun & bulan", () => {
    expect(monthToParam({ year: 2026, month: 9 })).toBe("2026-09");
    expect(monthToParam({ year: 999, month: 12 })).toBe("0999-12");
  });
});

describe("prevMonth / nextMonth", () => {
  it("menyeberangi batas tahun", () => {
    expect(prevMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
    expect(nextMonth({ year: 2025, month: 12 })).toEqual({ year: 2026, month: 1 });
  });

  it("bergerak dalam tahun yang sama", () => {
    expect(prevMonth({ year: 2026, month: 9 })).toEqual({ year: 2026, month: 8 });
    expect(nextMonth({ year: 2026, month: 9 })).toEqual({ year: 2026, month: 10 });
  });
});

describe("daysInMonth", () => {
  it("menghitung panjang bulan termasuk tahun kabisat", () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 4 })).toBe(30);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });
});

describe("buildMonthGrid", () => {
  it("selalu kelipatan 7 kolom dengan panjang yang benar", () => {
    const weeks = buildMonthGrid({ year: 2026, month: 9 });
    for (const week of weeks) expect(week).toHaveLength(7);
    // September 2026: 30 hari.
    const filled = weeks.flat().filter(Boolean);
    expect(filled).toHaveLength(30);
  });

  it("menaruh tanggal 1 pada kolom hari yang tepat", () => {
    // 1 September 2026 = Selasa (index 2).
    const weeks = buildMonthGrid({ year: 2026, month: 9 });
    const firstRow = weeks[0];
    expect(firstRow[0]).toBeNull();
    expect(firstRow[1]).toBeNull();
    expect(firstRow[2]).toEqual({ day: 1, iso: "2026-09-01" });
  });

  it("mengisi ISO tiap sel dengan benar", () => {
    const weeks = buildMonthGrid({ year: 2026, month: 9 });
    const last = weeks.flat().filter(Boolean).at(-1);
    expect(last).toEqual({ day: 30, iso: "2026-09-30" });
  });
});

describe("jakartaISODate", () => {
  it("menggeser UTC ke WIB sebelum memotong tanggal", () => {
    // 31 Agustus 2026 20:00 UTC = 1 September 2026 03:00 WIB.
    expect(jakartaISODate(new Date("2026-08-31T20:00:00.000Z"))).toBe("2026-09-01");
  });

  it("null untuk Date tidak sah", () => {
    expect(jakartaISODate(new Date("nope"))).toBeNull();
  });
});

describe("reportISODate", () => {
  it("memotong tanggal tanpa geseran zona (@db.Date)", () => {
    expect(reportISODate(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09-01");
  });
});

describe("groupLogsByDate", () => {
  it("status paling penting menang untuk tanggal yang sama", () => {
    const map = groupLogsByDate([
      { status: "FAILED", createdAt: new Date("2026-09-01T01:00:00.000Z") },
      { status: "SUCCESS", createdAt: new Date("2026-09-01T09:00:00.000Z") },
      { status: "FAILED", createdAt: new Date("2026-09-02T09:00:00.000Z") },
    ]);
    expect(map.get("2026-09-01")).toBe("SUCCESS");
    expect(map.get("2026-09-02")).toBe("FAILED");
  });
});

describe("classifyDay", () => {
  const empty = new Map<string, "SUCCESS" | "FAILED" | "DUPLICATE">();
  const none = new Set<string>();

  it("SUCCESS → SUBMITTED", () => {
    const logs = new Map([["2026-09-01", "SUCCESS"]] as const);
    expect(classifyDay("2026-09-01", logs, none)).toBe("SUBMITTED");
  });

  it("FAILED → FAILED (tanpa report)", () => {
    const logs = new Map([["2026-09-01", "FAILED"]] as const);
    expect(classifyDay("2026-09-01", logs, none)).toBe("FAILED");
  });

  it("DUPLICATE saja + ada report → DRAFT", () => {
    const logs = new Map([["2026-09-01", "DUPLICATE"]] as const);
    expect(classifyDay("2026-09-01", logs, new Set(["2026-09-01"]))).toBe("DRAFT");
  });

  it("tanpa apa-apa → NONE", () => {
    expect(classifyDay("2026-09-01", empty, none)).toBe("NONE");
  });

  it("SUCCESS menang atas report", () => {
    const logs = new Map([["2026-09-01", "SUCCESS"]] as const);
    expect(classifyDay("2026-09-01", logs, new Set(["2026-09-01"]))).toBe(
      "SUBMITTED",
    );
  });
});

describe("collectReportDates", () => {
  it("mengumpulkan tanggal unik", () => {
    const set = collectReportDates([
      { date: new Date("2026-09-01T00:00:00.000Z") },
      { date: new Date("2026-09-01T00:00:00.000Z") },
      { date: new Date("2026-09-02T00:00:00.000Z") },
    ]);
    expect([...set].sort()).toEqual(["2026-09-01", "2026-09-02"]);
  });
});

describe("label", () => {
  it("punya 12 nama bulan & 7 nama hari", () => {
    expect(MONTH_LABELS).toHaveLength(13); // indeks 0 kosong
    expect(MONTH_LABELS[1]).toBe("Januari");
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(WEEKDAY_LABELS[0]).toBe("Min");
  });
});

// Regresi: dulu grafik 30 hari & "Status Hari Ini" memakai `toISOString()` pada
// tengah malam WIB (mis. 2026-09-28T17:00:00Z) sehingga tanggal terbaca
// 2026-09-28 — hari ini selalu hilang dan bar "hari ini" tidak pernah digambar.
describe("batas hari WIB (regresi dashboard)", () => {
  // Instant ini adalah 29 Sep 2026 pukul 08:00 WIB (= 01:00 UTC).
  const PAGI_WIB_29_SEP = new Date("2026-09-29T01:00:00.000Z");

  it("startOfJakartaDay memotong ke tengah malam WIB, bukan UTC", () => {
    expect(startOfJakartaDay(PAGI_WIB_29_SEP).toISOString()).toBe(
      "2026-09-28T17:00:00.000Z",
    );
  });

  it("jakartaISODate memberi tanggal WIB yang benar untuk tengah malam itu", () => {
    expect(jakartaISODate(startOfJakartaDay(PAGI_WIB_29_SEP))).toBe("2026-09-29");
  });

  it("lastJakartaDays selalu MENCAKUP hari ini sebagai elemen terakhir", () => {
    const days = lastJakartaDays(30, PAGI_WIB_29_SEP);
    expect(days).toHaveLength(30);
    expect(days[days.length - 1]).toBe("2026-09-29"); // <-- inti regresi
    expect(days).toContain(jakartaISODate(PAGI_WIB_29_SEP));
    expect(days[0]).toBe("2026-08-31");
  });

  it("lastJakartaDays dengan n=1 berisi tepat hari ini", () => {
    expect(lastJakartaDays(1, PAGI_WIB_29_SEP)).toEqual(["2026-09-29"]);
  });

  it("log pukul 23:30 WIB tetap masuk hari WIB-nya, bukan hari UTC berikutnya", () => {
    // 2026-09-28T16:30:00Z = 28 Sep 23:30 WIB.
    expect(jakartaISODate(new Date("2026-09-28T16:30:00.000Z"))).toBe("2026-09-28");
    // 2026-09-28T17:30:00Z = 29 Sep 00:30 WIB.
    expect(jakartaISODate(new Date("2026-09-28T17:30:00.000Z"))).toBe("2026-09-29");
  });
});

describe("holidayKindOf", () => {
  it("menandai libur nasional", () => {
    // 2026-12-25 Hari Raya Natal (Jumat).
    expect(holidayKindOf("2026-12-25")).toBe("NATIONAL");
    expect(holidayKindOf("2026-12-24")).toBe("NATIONAL");
  });

  it("menandai akhir pekan biasa", () => {
    // 2026-09-19 Sabtu, 2026-09-20 Minggu.
    expect(holidayKindOf("2026-09-19")).toBe("WEEKEND");
    expect(holidayKindOf("2026-09-20")).toBe("WEEKEND");
  });

  it("hari kerja biasa → null", () => {
    // 2026-09-22 Selasa.
    expect(holidayKindOf("2026-09-22")).toBeNull();
  });

  it("tanggal tak sah / di luar daftar → null, tidak melempar", () => {
    expect(holidayKindOf("bukan-tanggal")).toBeNull();
    expect(holidayKindOf("")).toBeNull();
  });
});
