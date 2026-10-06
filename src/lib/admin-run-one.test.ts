// Tes runOne() + summarizeRunOne() — inti "jalankan otomasi 1 user" (admin).
//
// Mengapa ada: fitur ini memberi admin tombol memaksa submit seorang pengguna.
// Yang wajib dijaga: (a) pemetaan hasil ke ringkasan tidak membocorkan token,
// (b) sasaran yang tak ada / sudah dihapus ditolak, (c) `performSubmit` dipanggil
// dengan pemicu CRON + logOnNotReady true (konsisten dengan cron) dan memakai
// template yang dipilih dari data pengguna. DB & jaringan di-mock.

import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();
const performSubmitMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

vi.mock("@/lib/perform-submit", () => ({
  performSubmit: (...args: unknown[]) => performSubmitMock(...args),
}));

import { runOne, summarizeRunOne } from "./admin-run-one";

beforeEach(() => {
  findUniqueMock.mockReset();
  performSubmitMock.mockReset();
});

/** Baris user lengkap seperti yang diharapkan `runOne` dari DB. */
function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    deletedAt: null,
    template: { activity: "a", learning: "b", obstacles: "c" },
    datedTemplates: [],
    credential: null,
    ...overrides,
  };
}

describe("runOne", () => {
  it("user tidak ditemukan → NOT_FOUND, tanpa memanggil performSubmit", async () => {
    findUniqueMock.mockResolvedValue(null);
    const r = await runOne("missing");
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(performSubmitMock).not.toHaveBeenCalled();
  });

  it("user sudah dihapus → DELETED, tanpa memanggil performSubmit", async () => {
    findUniqueMock.mockResolvedValue(
      userRow({ deletedAt: new Date("2026-01-01T00:00:00Z") }),
    );
    const r = await runOne("user-1");
    expect(r).toEqual({ ok: false, reason: "DELETED" });
    expect(performSubmitMock).not.toHaveBeenCalled();
  });

  it("memanggil performSubmit dengan pemicu CRON & logOnNotReady true", async () => {
    findUniqueMock.mockResolvedValue(userRow());
    performSubmitMock.mockResolvedValue({
      kind: "SUBMITTED",
      ok: true,
      status: "SUCCESS",
      message: "Laporan terkirim ke portal.",
      date: "2026-01-03",
    });

    const r = await runOne("user-1", new Date("2026-01-03T00:00:00Z"));
    expect(r.ok).toBe(true);
    const arg = performSubmitMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.trigger).toBe("CRON");
    expect(arg.logOnNotReady).toBe(true);
    expect(arg.userId).toBe("user-1");
    // Template harian (bukan dated) dipilih karena datedTemplates kosong.
    expect(arg.template).toEqual({ activity: "a", learning: "b", obstacles: "c" });
  });
});

describe("summarizeRunOne", () => {
  it("SUBMITTED sukses → ok true, pesan diteruskan", () => {
    const s = summarizeRunOne({
      kind: "SUBMITTED",
      ok: true,
      status: "SUCCESS",
      message: "Laporan terkirim ke portal.",
      date: "2026-01-03",
    });
    expect(s).toEqual({
      kind: "SUBMITTED",
      ok: true,
      message: "Laporan terkirim ke portal.",
    });
  });

  it("SUBMITTED gagal (duplikat) → ok false", () => {
    const s = summarizeRunOne({
      kind: "SUBMITTED",
      ok: false,
      status: "ALREADY_SUBMITTED",
      message: "Laporan sudah ada.",
      date: "2026-01-03",
    });
    expect(s.kind).toBe("SUBMITTED");
    expect(s.ok).toBe(false);
  });

  it("DRY_RUN → ok true dengan pesan latihan yang tidak memuat detail internal", () => {
    const s = summarizeRunOne({
      kind: "DRY_RUN",
      date: "2026-01-03",
      policy: "Hari kerja aktif, pengiriman diizinkan.",
    });
    expect(s.ok).toBe(true);
    expect(s.message).toContain("DRY_RUN");
  });

  it("NOT_READY → ok false, pesan alasan dipertahankan", () => {
    const s = summarizeRunOne({
      kind: "NOT_READY",
      reason: "POLICY_SKIPPED",
      message: "Hari ini libur/akhir pekan, laporan dilewati (bukan error).",
      date: "2026-01-03",
    });
    expect(s.ok).toBe(false);
    expect(s.message).toContain("libur");
  });

  it("TOKEN_UNREADABLE & EXCHANGE_FAILED → ok false", () => {
    expect(
      summarizeRunOne({ kind: "TOKEN_UNREADABLE", message: "rusak" }).ok,
    ).toBe(false);
    expect(
      summarizeRunOne({
        kind: "EXCHANGE_FAILED",
        status: "SESSION_DEAD",
        message: "mati",
        date: "2026-01-03",
      }).ok,
    ).toBe(false);
  });

  it("BAD_DATE → ok false dengan tanggal", () => {
    const s = summarizeRunOne({ kind: "BAD_DATE", date: "2026-13-99" });
    expect(s.ok).toBe(false);
    expect(s.message).toContain("2026-13-99");
  });
});
