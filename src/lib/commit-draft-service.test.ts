// src/lib/commit-draft-service.test.ts: uji penyusunan & penyimpanan draf commit.
//
// Jaminan yang diuji (bukan detail implementasi):
//   1. Suntingan manusia TIDAK PERNAH ditimpa (aturan paling mahal kalau salah).
//   2. Kegagalan git tidak melempar dan tidak menulis apa pun.
//   3. Tanpa commit → tidak menulis apa pun (jangan simpan laporan karangan).
//   4. Kuota git tidak dikuras bila template hari itu sudah ada.

import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();
const createMock = vi.fn();
const resolveMock = vi.fn();
const draftMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    datedReportTemplate: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      create: (...a: unknown[]) => createMock(...a),
    },
  },
}));

vi.mock("@/lib/git-repo-service", () => ({
  resolveCommits: (...a: unknown[]) => resolveMock(...a),
  draftInputFromCommits: (keywords: string) => {
    const bersih = (keywords ?? "").trim();
    return bersih ? { keywords: bersih } : null;
  },
}));

vi.mock("@/lib/report-draft", () => ({
  getDrafter: () => ({ draft: (...a: unknown[]) => draftMock(...a) }),
}));

import { contentOf, prepareCommitDraft } from "./commit-draft-service";

const TANGGAL = "2026-06-01";

const DRAF = {
  activity: "Aktivitas dari commit",
  learning: "Pembelajaran dari proses",
  obstacles: "Tidak ada kendala berarti",
};

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueMock.mockResolvedValue(null);
  createMock.mockResolvedValue({});
  draftMock.mockResolvedValue(DRAF);
  resolveMock.mockResolvedValue({
    ok: true,
    commits: [{ shortId: "a1" }],
    keywords: "memperbaiki validasi",
    date: TANGGAL,
  });
});

describe("prepareCommitDraft: jalur sukses", () => {
  it("menyusun draf lalu MENYIMPANNYA sebagai template bertanggal", async () => {
    const hasil = await prepareCommitDraft("u1", TANGGAL);

    expect(hasil.kind).toBe("SAVED");
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data.userId).toBe("u1");
    expect(data.activity).toBe(DRAF.activity);
    expect(data.learning).toBe(DRAF.learning);
    expect(data.obstacles).toBe(DRAF.obstacles);
  });

  it("meneruskan tanggal ke pengambil commit (bukan selalu hari ini)", async () => {
    await prepareCommitDraft("u1", TANGGAL);
    expect(resolveMock).toHaveBeenCalledWith("u1", TANGGAL);
  });

  it("contentOf mengembalikan isi hanya saat SAVED", async () => {
    expect(contentOf(await prepareCommitDraft("u1", TANGGAL))).toEqual(DRAF);
  });
});

describe("prepareCommitDraft: suntingan manusia dilindungi", () => {
  it("TIDAK menulis apa pun bila template bertanggal sudah ada", async () => {
    findUniqueMock.mockResolvedValue({ id: "t1" });

    const hasil = await prepareCommitDraft("u1", TANGGAL);

    expect(hasil.kind).toBe("ALREADY_EXISTS");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("TIDAK memanggil API git bila template sudah ada (hemat kuota)", async () => {
    findUniqueMock.mockResolvedValue({ id: "t1" });
    await prepareCommitDraft("u1", TANGGAL);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it("balapan penulisan (P2002) → ALREADY_EXISTS, bukan menimpa", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    const hasil = await prepareCommitDraft("u1", TANGGAL);

    expect(hasil.kind).toBe("ALREADY_EXISTS");
  });
});

describe("prepareCommitDraft: kegagalan tidak boleh menghalangi kirim", () => {
  it("commit gagal diambil → NO_COMMITS, tidak menulis", async () => {
    resolveMock.mockResolvedValue({ ok: false, message: "Token ditolak", date: TANGGAL });

    const hasil = await prepareCommitDraft("u1", TANGGAL);

    expect(hasil.kind).toBe("NO_COMMITS");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("modul git MELEMPAR → NO_COMMITS, tidak melempar ke pemanggil", async () => {
    resolveMock.mockRejectedValue(new TypeError("fetch failed"));

    const hasil = await prepareCommitDraft("u1", TANGGAL);

    expect(hasil.kind).toBe("NO_COMMITS");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("tidak ada commit sama sekali → NO_COMMITS", async () => {
    resolveMock.mockResolvedValue({ ok: true, commits: [], keywords: "", date: TANGGAL });

    const hasil = await prepareCommitDraft("u1", TANGGAL);

    expect(hasil.kind).toBe("NO_COMMITS");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("penyusun gagal → FAILED, tidak menulis draf setengah jadi", async () => {
    draftMock.mockRejectedValue(new Error("LLM down"));

    const hasil = await prepareCommitDraft("u1", TANGGAL);

    expect(hasil.kind).toBe("FAILED");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("cek template gagal dibaca → tetap lanjut, tidak crash", async () => {
    findUniqueMock.mockRejectedValue(new Error("DB sibuk"));

    const hasil = await prepareCommitDraft("u1", TANGGAL);

    // Asumsi aman: lanjut menyusun. `create` tetap menjaga dari penimpaan.
    expect(hasil.kind).toBe("SAVED");
  });
});
