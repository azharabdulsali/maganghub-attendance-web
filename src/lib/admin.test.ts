// src/lib/admin.test.ts — uji logika tampilan halaman admin (murni).

import { describe, it, expect } from "vitest";

import {
  credentialStatusTone,
  describeCredentialStatus,
  formatJoinDate,
  initialsFor,
  isAdminRole,
  summarizeUsers,
  type AdminUserRow,
} from "./admin";

function row(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    email: "user@example.com",
    name: null,
    role: "USER",
    credentialStatus: null,
    hasTemplate: false,
    automationEnabled: false,
    reportCount: 0,
    submitCount: 0,
    lastSubmitAt: null,
    ...overrides,
  };
}

describe("isAdminRole", () => {
  it("hanya ADMIN yang dianggap admin", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("admin")).toBe(true); // peka huruf besar-kecil
    expect(isAdminRole("USER")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("describeCredentialStatus", () => {
  it("memberi label manusia, termasuk saat kosong", () => {
    expect(describeCredentialStatus("ACTIVE")).toBe("Aktif");
    expect(describeCredentialStatus("INVALID")).toBe("Perlu diperbarui");
    expect(describeCredentialStatus("UNVERIFIED")).toBe("Belum diuji");
    expect(describeCredentialStatus(null)).toBe("Belum diisi");
    expect(describeCredentialStatus(undefined)).toBe("Belum diisi");
  });
});

describe("credentialStatusTone", () => {
  it("aktif hijau, invalid merah, sisanya netral", () => {
    expect(credentialStatusTone("ACTIVE")).toBe("good");
    expect(credentialStatusTone("INVALID")).toBe("bad");
    expect(credentialStatusTone("UNVERIFIED")).toBe("neutral");
    expect(credentialStatusTone(null)).toBe("neutral");
  });
});

describe("summarizeUsers", () => {
  it("daftar kosong menghasilkan semua nol, bukan NaN", () => {
    expect(summarizeUsers([])).toEqual({
      totalUsers: 0,
      admins: 0,
      credentialActive: 0,
      automationEnabled: 0,
      everSubmitted: 0,
    });
  });

  it("menghitung tiap kategori dengan benar", () => {
    const rows = [
      row({ role: "ADMIN", credentialStatus: "ACTIVE", automationEnabled: true, submitCount: 5 }),
      row({ credentialStatus: "ACTIVE", submitCount: 0 }),
      row({ credentialStatus: "INVALID", submitCount: 2 }),
      row(),
    ];
    expect(summarizeUsers(rows)).toEqual({
      totalUsers: 4,
      admins: 1,
      credentialActive: 2,
      automationEnabled: 1,
      everSubmitted: 2,
    });
  });

  it("everSubmitted tidak pernah melebihi totalUsers", () => {
    const rows = [row({ submitCount: 3 }), row({ submitCount: 0 })];
    const s = summarizeUsers(rows);
    expect(s.everSubmitted).toBeLessThanOrEqual(s.totalUsers);
  });
});

describe("formatJoinDate", () => {
  it("memformat waktu ke zona Asia/Jakarta", () => {
    // 2024-01-31T18:00Z = 01 Feb 2024 WIB (UTC+7).
    const out = formatJoinDate(new Date("2024-01-31T18:00:00Z"));
    expect(out).toContain("2024");
    expect(out).toContain("Feb");
  });

  it("mengembalikan null untuk tanggal tidak sah (bukan 'Invalid Date')", () => {
    expect(formatJoinDate(new Date("bukan-tanggal"))).toBeNull();
  });
});

describe("initialsFor", () => {
  it("memakai nama bila ada", () => {
    expect(initialsFor({ email: "a@b.com", name: "Siti Aminah" })).toBe("SA");
  });

  it("jatuh ke email bila nama kosong", () => {
    expect(initialsFor({ email: "budi@example.com", name: null })).toBe("BU");
    expect(initialsFor({ email: "budi@example.com", name: "   " })).toBe("BU");
  });

  it("mengembalikan '?' saat email & nama kosong", () => {
    expect(initialsFor({ email: "   ", name: null })).toBe("?");
  });
});
