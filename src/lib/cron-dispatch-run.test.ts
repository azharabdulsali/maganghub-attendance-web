// src/lib/cron-dispatch-run.test.ts
//
// Fokus: URUTAN sumber isi laporan yang benar-benar sampai ke `performSubmit`
// lewat cron, karena inilah jalur yang membuat laporan terkirim tanpa dibaca
// siapa pun. Bila urutan salah di sini, kesalahannya baru ketahuan di portal.
//
// Yang diuji:
//   1. commit menang atas template bertanggal & harian
//   2. tanpa commit → template bertanggal → harian
//   3. draf commit yang BARU disimpan langsung terpakai (tidak basi)
//   4. kegagalan git tidak menghalangi kirim (jatuh ke template)
//   5. benar-benar tidak ada bahan → template null (performSubmit yang membatalkan)

import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
const performSubmitMock = vi.fn();
const prepareCommitDraftMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationConfig: { findMany: (...a: unknown[]) => findManyMock(...a) },
  },
}));

vi.mock("@/lib/perform-submit", () => ({
  performSubmit: (...a: unknown[]) => performSubmitMock(...a),
}));

vi.mock("@/lib/commit-draft-service", () => ({
  prepareCommitDraft: (...a: unknown[]) => prepareCommitDraftMock(...a),
  contentOf: (o: { kind: string; content?: unknown }) =>
    o.kind === "SAVED" ? o.content : null,
}));

import { runDispatch } from "./cron-dispatch-run";

const COMMIT_ISI = {
  activity: "Aktivitas dari commit hari ini",
  learning: "Pembelajaran dari commit",
  obstacles: "Kendala dari commit",
};

const HARIAN = {
  activity: "Aktivitas harian",
  learning: "Pembelajaran harian",
  obstacles: "Kendala harian",
};

// `date` di DB bertipe `@db.Date` sehingga Prisma mengembalikan `Date`, BUKAN
// string. Tes harus meniru bentuk itu: `toPlainDate` memanggil `getUTCFullYear()`
// dan akan melempar bila diberi string.
const DATED = {
  date: new Date("2026-06-01T00:00:00.000Z"),
  activity: "Aktivitas khusus tanggal",
  learning: "Pembelajaran khusus tanggal",
  obstacles: "Kendala khusus tanggal",
};

/** Waktu yang jatuh pada jam 7 WIB. */
const SEKARANG = new Date("2026-06-01T00:30:00.000Z");

function config(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    hour: 7,
    minute: 0,
    user: {
      template: HARIAN,
      datedTemplates: [],
      credential: null,
      ...overrides,
    },
  };
}

/** Isi template yang akhirnya dikirim ke performSubmit. */
function templateDikirim() {
  return performSubmitMock.mock.calls[0][0].template;
}

beforeEach(() => {
  vi.clearAllMocks();
  findManyMock.mockResolvedValue([config()]);
  performSubmitMock.mockResolvedValue({ kind: "SUCCESS", date: "2026-06-01" });
  prepareCommitDraftMock.mockResolvedValue({ kind: "NO_COMMITS", reason: "tidak ada" });
});

describe("runDispatch: urutan sumber isi", () => {
  it("commit menang atas template bertanggal DAN harian", async () => {
    findManyMock.mockResolvedValue([config({ datedTemplates: [DATED] })]);
    prepareCommitDraftMock.mockResolvedValue({ kind: "SAVED", content: COMMIT_ISI });

    await runDispatch(SEKARANG);

    expect(templateDikirim()).toEqual(COMMIT_ISI);
  });

  it("tanpa commit → template bertanggal", async () => {
    findManyMock.mockResolvedValue([config({ datedTemplates: [DATED] })]);

    await runDispatch(SEKARANG);

    expect(templateDikirim().activity).toBe("Aktivitas khusus tanggal");
  });

  it("tanpa commit & tanpa template bertanggal → template harian", async () => {
    await runDispatch(SEKARANG);
    expect(templateDikirim()).toEqual(HARIAN);
  });

  it("tidak ada bahan sama sekali → template null (dibatalkan performSubmit)", async () => {
    findManyMock.mockResolvedValue([config({ template: null })]);

    await runDispatch(SEKARANG);

    expect(templateDikirim() ?? null).toBeNull();
  });
});

describe("runDispatch: draf yang baru disimpan langsung dipakai", () => {
  it("draf SAVED terpakai walau belum terbaca ulang dari DB", async () => {
    // `datedTemplates` di sini kosong: meniru data yang dibaca SEBELUM simpan.
    // Tanpa penyuntikan isi segar, laporan akan jatuh ke template harian.
    prepareCommitDraftMock.mockResolvedValue({ kind: "SAVED", content: COMMIT_ISI });

    await runDispatch(SEKARANG);

    expect(templateDikirim()).toEqual(COMMIT_ISI);
  });

  it("draf sudah ada (suntingan pengguna) → TIDAK ditimpa, isi DB yang dipakai", async () => {
    findManyMock.mockResolvedValue([config({ datedTemplates: [DATED] })]);
    prepareCommitDraftMock.mockResolvedValue({ kind: "ALREADY_EXISTS" });

    await runDispatch(SEKARANG);

    expect(templateDikirim().activity).toBe("Aktivitas khusus tanggal");
  });

  it("menyusun draf untuk tanggal hari ini (WIB), bukan tanggal lain", async () => {
    await runDispatch(SEKARANG);
    expect(prepareCommitDraftMock).toHaveBeenCalledWith("u1", "2026-06-01");
  });
});

describe("runDispatch: ketahanan", () => {
  it("git gagal → laporan TETAP dikirim dari template", async () => {
    prepareCommitDraftMock.mockResolvedValue({ kind: "NO_COMMITS", reason: "token ditolak" });

    const hasil = await runDispatch(SEKARANG);

    expect(hasil.results[0].kind).toBe("SUCCESS");
    expect(templateDikirim()).toEqual(HARIAN);
  });

  it("penyusun draf MELEMPAR → user tidak jatuh, kirim dari template", async () => {
    prepareCommitDraftMock.mockRejectedValue(new Error("LLM down"));

    const hasil = await runDispatch(SEKARANG);

    expect(hasil.results[0].kind).toBe("ERROR");
    expect(performSubmitMock).not.toHaveBeenCalled();
  });

  it("satu user gagal tidak menjatuhkan user lain", async () => {
    findManyMock.mockResolvedValue([
      { ...config(), userId: "u1" },
      { ...config(), userId: "u2" },
    ]);
    prepareCommitDraftMock.mockImplementation((id: string) =>
      id === "u1"
        ? Promise.reject(new Error("bom"))
        : Promise.resolve({ kind: "NO_COMMITS", reason: "x" }),
    );

    const hasil = await runDispatch(SEKARANG);

    expect(hasil.results.map((r) => r.kind).sort()).toEqual(["ERROR", "SUCCESS"]);
  });
});
