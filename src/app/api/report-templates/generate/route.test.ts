// src/app/api/report-templates/generate/route.test.ts: uji penyambungan commit
// git ke tombol "Generate draf", tanpa jaringan/DB nyata.
//
// Yang diuji adalah JAMINAN perilaku, bukan detail implementasi:
//   1. Commit hari itu DIPAKAI saat kata kunci kosong (inti fitur).
//   2. Kata kunci ketikan pengguna MENANG atas commit (tidak ditimpa diam-diam).
//   3. Kegagalan git — termasuk MELEMPAR — tidak menggagalkan draf
//      (SPEC §5.4a: laporan tetap bisa disusun).
//   4. Token tidak pernah ikut terkirim ke klien.

import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const gateMock = vi.fn();
const resolveMock = vi.fn();
const draftMock = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

vi.mock("@/lib/enforce-rate-limit", () => ({
  enforceRateLimit: (...a: unknown[]) => gateMock(...a),
}));

// `draftInputFromCommits` ditulis ulang di sini, bukan diimpor dari
// implementasi aslinya: memuat modul asli akan menarik `prisma` yang butuh
// `.env.local`. Perilakunya sengaja dibuat identik (trim → null bila kosong)
// supaya rute tetap diuji pada aturan "null, bukan string kosong".
vi.mock("@/lib/git-repo-service", () => ({
  resolveCommits: (...a: unknown[]) => resolveMock(...a),
  draftInputFromCommits: (keywords: string) => {
    const bersih = (keywords ?? "").trim();
    return bersih ? { keywords: bersih } : null;
  },
}));

vi.mock("@/lib/report-draft", () => ({
  draftWithFallback: (...a: unknown[]) => draftMock(...a),
}));

import { POST } from "./route";

/** Balasan penyusun tiruan: cukup bentuk yang dibaca rute. */
function drafOk() {
  return {
    hasil: { activity: "Aktivitas", learning: "Pembelajaran", obstacles: "Kendala" },
    label: "Lokal 0-Token",
    fallback: false,
  };
}

/** Panggil rute dengan body tertentu. */
async function panggil(body: Record<string, unknown>) {
  const res = await POST(
    new Request("http://localhost/api/report-templates/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { res, data: await res.json() };
}

/** Argumen yang diterima penyusun (DraftInput). */
function inputDrafter() {
  return draftMock.mock.calls[0][0] as { keywords: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1" } });
  gateMock.mockResolvedValue({ decision: { allowed: true }, headers: {} });
  draftMock.mockResolvedValue(drafOk());
  resolveMock.mockResolvedValue({
    ok: true,
    commits: [{ shortId: "a1", title: "x", author: "a", committedAt: "" }],
    keywords: "memperbaiki validasi jalur repo, menambah tes",
    date: "2026-06-01",
  });
});

describe("POST /api/report-templates/generate + commit git", () => {
  it("memakai commit hari itu bila kata kunci kosong", async () => {
    const { res, data } = await panggil({ keywords: "" });

    expect(res.status).toBe(200);
    expect(inputDrafter().keywords).toContain("validasi jalur repo");
    expect(data.git.status).toBe("used");
    expect(data.git.commitCount).toBe(1);
  });

  it("kata kunci ketikan pengguna MENANG atas commit", async () => {
    await panggil({ keywords: "rapat mingguan" });

    expect(inputDrafter().keywords).toBe("rapat mingguan");
  });

  it("melaporkan 'ignored' saat pengguna mengetik kata kunci sendiri", async () => {
    const { data } = await panggil({ keywords: "rapat mingguan" });
    expect(data.git.status).toBe("ignored");
  });

  it("menandai kolom Pembelajaran perlu disunting saat draf dari commit", async () => {
    const { data } = await panggil({ keywords: "" });
    expect(data.git.learningNeedsReview).toBe(true);
  });

  it("TIDAK menandai Pembelajaran saat tidak memakai commit", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      message: "Repo mati",
      date: "2026-06-01",
    });

    const { data } = await panggil({ keywords: "" });
    expect(data.git.learningNeedsReview).toBe(false);
  });

  it("draf TETAP tersusun saat repo git tidak tersedia (SPEC §5.4a)", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      message: "Token git ditolak oleh GitHub.",
      date: "2026-06-01",
    });

    const { res, data } = await panggil({ keywords: "" });

    expect(res.status).toBe(200);
    expect(data.activity).toBe("Aktivitas");
    expect(data.git.status).toBe("unavailable");
    // Pesan galat git tidak boleh muncul sebagai galat form laporan.
    expect(data.error).toBeUndefined();
  });

  it("draf TETAP tersusun walau modul git MELEMPAR (jaring pengaman)", async () => {
    resolveMock.mockRejectedValue(new TypeError("fetch failed"));

    const { res, data } = await panggil({ keywords: "" });

    expect(res.status).toBe(200);
    expect(data.git.status).toBe("unavailable");
  });

  it("membedakan 'no-commits' dari 'unavailable'", async () => {
    resolveMock.mockResolvedValue({
      ok: true,
      commits: [],
      keywords: "",
      date: "2026-06-01",
    });

    const { data } = await panggil({ keywords: "" });
    expect(data.git.status).toBe("no-commits");
    expect(data.git.commitCount).toBe(0);
  });

  it("tidak mengirim galat git ke klien saat commit tak terpakai", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      message: "Token git ditolak oleh GitHub.",
      date: "2026-06-01",
    });

    const { data } = await panggil({ keywords: "" });
    expect(JSON.stringify(data)).not.toContain("ditolek");
    expect(JSON.stringify(data)).not.toContain("Token git ditolak");
  });
});
