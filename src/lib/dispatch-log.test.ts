// src/lib/dispatch-log.test.ts: uji pencatatan ringkasan dispatch.
//
// Dua hal yang dijaga:
//   1. Data yang dicatat HANYA angka — `userId` tidak boleh ikut ke log sistem.
//   2. Pencatatan TIDAK PERNAH menjatuhkan dispatch, apa pun yang terjadi.

import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminActionLog: { create: (...a: unknown[]) => createMock(...a) },
    user: { findFirst: (...a: unknown[]) => findFirstMock(...a) },
  },
}));

import {
  dispatchLogFields,
  formatDispatchLog,
  recordDispatchLog,
  systemActorId,
} from "./dispatch-log";
import type { DispatchSummary } from "./cron-dispatch-run";

const SUMMARY: DispatchSummary = {
  ok: true,
  hour: 7,
  considered: 12,
  processed: 10,
  deferred: 2,
  topUpPending: 2,
  note: "2 user tertunda akan dicoba lagi pada pemanggilan berikutnya.",
  deadlineHit: true,
  // Id user di sini WAJIB tidak ikut tercatat.
  results: [
    { userId: "rahasia-1", kind: "SUCCESS" },
    { userId: "rahasia-2", kind: "DEFERRED" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue({ id: "log1" });
  findFirstMock.mockResolvedValue({ id: "admin-1" });
});

describe("dispatchLogFields", () => {
  it("hanya mengambil angka, TANPA userId", () => {
    const fields = dispatchLogFields(SUMMARY);

    expect(fields).toEqual({
      hour: 7,
      considered: 12,
      processed: 10,
      deferred: 2,
      topUpPending: 2,
      deadlineHit: true,
    });
    expect(JSON.stringify(fields)).not.toContain("rahasia");
  });
});

describe("formatDispatchLog", () => {
  it("memuat jam, hasil, dan penanda tenggat", () => {
    const teks = formatDispatchLog(dispatchLogFields(SUMMARY));

    expect(teks).toContain("jam 7 WIB");
    expect(teks).toContain("10/12");
    expect(teks).toContain("TENGGAT TERCAPAI");
    expect(teks).not.toContain("rahasia");
  });

  it("tidak menyebut tenggat bila tidak tercapai", () => {
    const teks = formatDispatchLog({
      hour: 7,
      considered: 3,
      processed: 3,
      deferred: 0,
      topUpPending: 0,
      deadlineHit: false,
    });

    expect(teks).not.toContain("TENGGAT");
    expect(teks).not.toContain("menunggu dikejar");
  });
});

describe("recordDispatchLog", () => {
  it("menulis action SYSTEM_DISPATCH dengan ringkasan angka", async () => {
    const ok = await recordDispatchLog({
      actorId: "admin-1",
      targetId: "admin-1",
      summary: SUMMARY,
    });

    expect(ok).toBe(true);
    const arg = createMock.mock.calls[0][0];
    expect(arg.action ?? arg.data.action).toBe("SYSTEM_DISPATCH");
    expect(arg.data.reason).not.toContain("rahasia");
  });

  it("melewati pencatatan bila actor/target tidak ada (tidak mencatat id palsu)", async () => {
    const ok = await recordDispatchLog({
      actorId: null,
      targetId: null,
      summary: SUMMARY,
    });

    expect(ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("tidak melempar saat DB gagal — dispatch tetap selamat", async () => {
    createMock.mockRejectedValue(new Error("db down"));

    await expect(
      recordDispatchLog({ actorId: "a", targetId: "b", summary: SUMMARY }),
    ).resolves.toBe(false);
  });
});

describe("systemActorId", () => {
  it("memilih admin aktif pertama secara deterministik", async () => {
    const id = await systemActorId();

    expect(id).toBe("admin-1");
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where.role).toBe("ADMIN");
    expect(arg.where.deletedAt).toBeNull();
    // Urutan eksplisit: tanpa ini "admin pertama" bisa berubah tiap query.
    expect(arg.orderBy.createdAt).toBe("asc");
  });

  it("null bila belum ada admin, dan tidak melempar saat DB gagal", async () => {
    findFirstMock.mockResolvedValue(null);
    expect(await systemActorId()).toBeNull();

    findFirstMock.mockRejectedValue(new Error("db down"));
    await expect(systemActorId()).resolves.toBeNull();
  });
});
