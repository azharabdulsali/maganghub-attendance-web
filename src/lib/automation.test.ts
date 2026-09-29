// src/lib/automation.test.ts — uji aturan otomasi (murni).

import { describe, it, expect } from "vitest";

import {
  describeAutomation,
  describeNextRun,
  formatSchedule,
  generateWebhookKey,
  isValidSchedule,
  minutesUntilNext,
} from "./automation";

describe("generateWebhookKey", () => {
  it("menghasilkan hex 64 karakter (32 byte)", () => {
    const key = generateWebhookKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("selalu berbeda antar panggilan", () => {
    const a = generateWebhookKey();
    const b = generateWebhookKey();
    expect(a).not.toBe(b);
  });
});

describe("isValidSchedule", () => {
  it("menerima rentang sah", () => {
    expect(isValidSchedule(0, 0)).toBe(true);
    expect(isValidSchedule(7, 30)).toBe(true);
    expect(isValidSchedule(23, 59)).toBe(true);
  });

  it("menolak di luar rentang atau bukan integer", () => {
    expect(isValidSchedule(24, 0)).toBe(false);
    expect(isValidSchedule(-1, 0)).toBe(false);
    expect(isValidSchedule(7, 60)).toBe(false);
    expect(isValidSchedule(7.5, 0)).toBe(false);
    expect(isValidSchedule(NaN, 0)).toBe(false);
  });
});

describe("formatSchedule", () => {
  it("memberi dua digit", () => {
    expect(formatSchedule(7, 30)).toBe("07:30");
    expect(formatSchedule(0, 5)).toBe("00:05");
  });
});

describe("describeAutomation", () => {
  it("Aktif / Nonaktif", () => {
    expect(describeAutomation(true)).toBe("Aktif");
    expect(describeAutomation(false)).toBe("Nonaktif");
  });
});

describe("minutesUntilNext", () => {
  // 2026-01-02T00:00:00Z = 07:00 WIB.
  const now = new Date("2026-01-02T00:00:00Z");

  it("jadwal lebih lambat hari ini → selisih positif kecil", () => {
    // 07:30 WIB − 07:00 WIB = 30 menit.
    expect(minutesUntilNext(now, 7, 30)).toBe(30);
  });

  it("jadwal sudah lewat → dihitung untuk besok", () => {
    // 06:00 WIB sudah lewat → 23 jam lagi.
    expect(minutesUntilNext(now, 6, 0)).toBe(23 * 60);
  });

  it("selalu > 0 bahkan tepat pada menit jadwal", () => {
    // Tepat 07:00 WIB → dianggap untuk besok, bukan 0.
    expect(minutesUntilNext(now, 7, 0)).toBe(24 * 60);
  });
});

describe("describeNextRun", () => {
  const now = new Date("2026-01-02T00:00:00Z"); // 07:00 WIB

  it("menyebut 'hari ini' bila belum lewat", () => {
    expect(describeNextRun(now, 7, 30)).toBe("07:30 WIB hari ini");
  });

  it("menyebut 'besok' bila sudah lewat", () => {
    expect(describeNextRun(now, 6, 0)).toBe("06:00 WIB besok");
  });

  it("tepat pada menit jadwal → 'besok' (bukan hari ini)", () => {
    expect(describeNextRun(now, 7, 0)).toBe("07:00 WIB besok");
  });

  it("jadwal tidak sah → null", () => {
    expect(describeNextRun(now, 99, 0)).toBeNull();
  });
});
