// src/lib/git-repo-service.test.ts: uji lapisan service repo git, tanpa DB nyata.
//
// Yang diuji di sini adalah JAMINAN, bukan detail implementasi:
//   1. Token tidak pernah muncul di objek yang dikirim ke klien.
//   2. Kegagalan git menjadi `{ ok: false }`, tidak pernah melempar.
//   3. `draftInputFromCommits` mengembalikan `null` (bukan string kosong) saat
//      tidak ada bahan, supaya pemanggil tidak membuat laporan palsu.

import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();
// `update` dan `updateMany` dipisah walau perilakunya mirip: perbedaannya
// BUKAN kosmetik. `update` melempar P2025 bila baris hilang, `updateMany`
// hanya mengembalikan count 0. Pencatatan status (`lastError`) harus tahan
// baris hilang, sedangkan `setRepoEnabled` butuh nilai balik -> keduanya
// memakai operasi berbeda dan tes harus bisa membedakannya.
const updateMock = vi.fn();
const updateManyMock = vi.fn();
const upsertMock = vi.fn();
const decryptMock = vi.fn();
const encryptMock = vi.fn();
const fetchCommitsMock = vi.fn();

vi.mock("@/lib/crypto", () => ({
  encrypt: (...a: unknown[]) => encryptMock(...a),
  decrypt: (...a: unknown[]) => decryptMock(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gitRepoConfig: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      // Pencatatan `lastError`/`lastFetchedAt` memakai `updateMany` (lihat
      // komentar di git-repo-service.ts): `update` melempar P2025 bila baris
      // hilang dan galatnya tertelan `.catch`, sehingga kegagalan simpan
      // status tak pernah terlihat. `setRepoEnabled` tetap memakai `update`
      // karena nilai `enabled` terbaru dipakai pemanggil.
      updateMany: (...a: unknown[]) => updateManyMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
      upsert: (...a: unknown[]) => upsertMock(...a),
    },
  },
}));

vi.mock("@/lib/git-provider", async () => {
  const asli = await vi.importActual<typeof import("./git-provider")>(
    "./git-provider",
  );
  return {
    ...asli,
    fetchCommits: (...a: unknown[]) => fetchCommitsMock(...a),
  };
});

import {
  draftInputFromCommits,
  gitCommitsEnabled,
  resolveCommits,
  saveRepoConfig,
  setRepoEnabled,
  toCommitView,
  toRepoView,
} from "./git-repo-service";
import { GitApiError } from "./git-provider";
import type { GitCommit } from "./git-commits";

/** Baris DB tiruan; sengaja memuat token palsu untuk menguji kebocoran. */
function baris(overrides: Record<string, unknown> = {}) {
  return {
    provider: "GITHUB" as const,
    repoPath: "budi/proyek",
    branch: "main",
    enabled: true,
    ciphertext: "CIPHER",
    iv: "IV",
    authTag: "TAG",
    lastFetchedAt: null,
    lastError: null,
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

function commit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    shortId: "abc1234",
    title: "migrasi skema Prisma",
    author: "Budi",
    committedAt: "2026-06-01T03:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GIT_COMMITS_ENABLED;
  decryptMock.mockReturnValue("TOKEN-RAHASIA-SEKALI");
  encryptMock.mockReturnValue({ ciphertext: "C", iv: "I", authTag: "T" });
  updateMock.mockResolvedValue({ userId: "u1" });
  // `updateMany` mengembalikan `{ count }`, bukan baris. Nilai ini dipakai
  // `.catch()` di service, jadi HARUS promise — bukan undefined.
  updateManyMock.mockResolvedValue({ count: 1 });
  findUniqueMock.mockResolvedValue(baris());
  fetchCommitsMock.mockResolvedValue([commit()]);
});

describe("toRepoView (jaminan: token tidak bocor)", () => {
  it("tidak memuat ciphertext/token dalam bentuk apa pun", () => {
    const view = toRepoView(baris());
    const json = JSON.stringify(view);

    expect(json).not.toContain("CIPHER");
    expect(json).not.toContain("TOKEN-RAHASIA-SEKALI");
    expect(view.hasToken).toBe(true);
  });

  it("baris null menjadi exists:false dengan hasToken:false", () => {
    expect(toRepoView(null)).toEqual({ exists: false, hasToken: false });
  });

  it("hasToken:false bila ciphertext kosong", () => {
    expect(toRepoView(baris({ ciphertext: "" })).hasToken).toBe(false);
  });
});

describe("gitCommitsEnabled (default aktif, env sebagai kill switch)", () => {
  it("aktif bila env tidak diisi", () => {
    expect(gitCommitsEnabled()).toBe(true);
  });

  it.each(["0", "false", "no"])("nonaktif bila env=%s", (nilai) => {
    process.env.GIT_COMMITS_ENABLED = nilai;
    expect(gitCommitsEnabled()).toBe(false);
  });

  it.each(["1", "true", "yes"])("aktif bila env=%s", (nilai) => {
    process.env.GIT_COMMITS_ENABLED = nilai;
    expect(gitCommitsEnabled()).toBe(true);
  });
});

describe("draftInputFromCommits (sinyal 'jangan buat draf palsu')", () => {
  it("mengembalikan null untuk string kosong / spasi", () => {
    expect(draftInputFromCommits("")).toBeNull();
    expect(draftInputFromCommits("   ")).toBeNull();
  });

  it("mengembalikan nilai yang sudah dirapikan", () => {
    expect(draftInputFromCommits("  a, b  ")).toEqual({ keywords: "a, b" });
  });
});

describe("toCommitView", () => {
  it("hanya memuat field tampilan", () => {
    const [c] = toCommitView([commit()]);
    expect(c).toEqual({
      shortId: "abc1234",
      title: "migrasi skema Prisma",
      author: "Budi",
      committedAt: "2026-06-01T03:00:00.000Z",
    });
  });

  it("menyertakan url commit bila ada", () => {
    const [c] = toCommitView([
      commit({ url: "https://github.com/b/p/commit/x" }),
    ]);
    expect(c.url).toBe("https://github.com/b/p/commit/x");
  });
});

describe("saveRepoConfig", () => {
  it("mengenkripsi token dan tidak mengembalikannya", async () => {
    upsertMock.mockResolvedValue({
      provider: "GITHUB",
      repoPath: "budi/proyek",
      branch: "main",
    });

    const saved = await saveRepoConfig("u1", {
      provider: "GITHUB",
      repoPath: "budi/proyek",
      branch: "main",
      token: "TOKEN-RAHASIA-SEKALI",
    });

    expect(encryptMock).toHaveBeenCalledWith("TOKEN-RAHASIA-SEKALI");
    expect(JSON.stringify(saved)).not.toContain("TOKEN-RAHASIA-SEKALI");

    const arg = upsertMock.mock.calls[0][0];
    expect(arg.create.ciphertext).toBe("C");
    expect(JSON.stringify(arg)).not.toContain("TOKEN-RAHASIA-SEKALI");
  });

  it("mengganti token membersihkan lastError lama dan mengaktifkan kembali", async () => {
    upsertMock.mockResolvedValue({});
    await saveRepoConfig("u1", {
      provider: "GITHUB",
      repoPath: "budi/proyek",
      branch: "main",
      token: "TOKEN-RAHASIA-SEKALI",
    });

    const arg = upsertMock.mock.calls[0][0];
    expect(arg.update.lastError).toBeNull();
    expect(arg.update.enabled).toBe(true);
  });
});

describe("setRepoEnabled", () => {
  it("mematikan repo tanpa menyentuh kolom token", async () => {
    await setRepoEnabled("u1", false);
    const arg = updateMock.mock.calls[0][0];
    expect(arg.data).toEqual({ enabled: false });
    // Jaminan penting: hanya `enabled` yang berubah. Kalau suatu saat ada yang
    // menambahkan penulisan ulang token di sini, token akan hilang/berubah
    // hanya karena pengguna menjeda fitur.
    expect(Object.keys(arg.data)).toEqual(["enabled"]);
  });

  it("menyalakan kembali repo", async () => {
    await setRepoEnabled("u1", true);
    expect(updateMock.mock.calls[0][0].data).toEqual({ enabled: true });
  });

  it("mengembalikan null bila belum ada repo (bukan melempar)", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(setRepoEnabled("u1", false)).resolves.toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("mengembalikan null bila baris hilang di sela pemeriksaan (P2025), bukan 500", async () => {
    // Skenario nyata: pengguna menghapus repo di tab lain tepat setelah
    // `findUnique` melihatnya ada. Tanpa penanganan, galat Prisma lolos ke
    // rute dan pengguna melihat 500 padahal kondisinya cuma "repo sudah tidak
    // ada" — yang seharusnya 404.
    updateMock.mockRejectedValue(
      Object.assign(new Error("Record to update not found."), { code: "P2025" }),
    );
    await expect(setRepoEnabled("u1", true)).resolves.toBeNull();
  });
});

describe("resolveCommits", () => {
  it("mengambil commit dan meneruskan rentang hari WIB ke provider", async () => {
    const hasil = await resolveCommits("u1", "2026-06-01");

    expect(hasil.ok).toBe(true);
    expect(fetchCommitsMock).toHaveBeenCalledOnce();
    const arg = fetchCommitsMock.mock.calls[0][0];
    // 00:00 WIB = 17:00 UTC hari sebelumnya. Ini bug zona waktu yang pernah
    // terjadi di fitur lain, jadi dikunci di tes.
    expect(arg.sinceIso).toBe("2026-05-31T17:00:00.000Z");
    expect(arg.token).toBe("TOKEN-RAHASIA-SEKALI");
  });

  it("memecah repoPath menjadi owner+repo", async () => {
    await resolveCommits("u1", "2026-06-01");
    const arg = fetchCommitsMock.mock.calls[0][0];
    expect(arg.owner).toBe("budi");
    expect(arg.repo).toBe("proyek");
  });

  // BUG NYATA (dilaporkan pemilik repo): field Branch ADA di form dan tersimpan
  // benar di DB, tetapi `resolveCommits` tidak pernah meneruskannya ke
  // `fetchCommits`. Akibatnya API memakai DEFAULT BRANCH repo, dan commit di
  // branch kerja (mis. dev-zar) tidak pernah terlihat — pesannya
  // "Tidak ada commit pada hari itu" padahal commit-nya ada.
  it("meneruskan branch tersimpan ke provider", async () => {
    findUniqueMock.mockResolvedValue(baris({ branch: "dev-zar" }));

    await resolveCommits("u1", "2026-06-01");

    const arg = fetchCommitsMock.mock.calls[0][0];
    expect(arg.branch).toBe("dev-zar");
  });

  // Branch kosong BUKAN "main". Nilai kosong harus diteruskan apa adanya agar
  // provider memakai default branch repo (bisa master/develop/apa pun).
  it("meneruskan branch kosong apa adanya, tidak menebak 'main'", async () => {
    findUniqueMock.mockResolvedValue(baris({ branch: "" }));

    await resolveCommits("u1", "2026-06-01");

    const arg = fetchCommitsMock.mock.calls[0][0];
    expect(arg.branch).toBe("");
  });

  // Tes ini sebelumnya mengharapkan owner="grup", repo="sub/proyek". Itu
  // MENGUNCI BUG: `buildApiPath` menolak repo yang mengandung "/", sehingga
  // setiap repo GitLab bertingkat gagal dengan "Nama owner/repo tidak valid".
  // Segmen pertama bukan owner; segmen TERAKHIR adalah nama repo.
  it("mendukung namespace GitLab bergaris miring banyak", async () => {
    findUniqueMock.mockResolvedValue(
      baris({ provider: "GITLAB", repoPath: "grup/sub/proyek" }),
    );
    const hasil = await resolveCommits("u1", "2026-06-01");
    expect(hasil.ok).toBe(true);
    const arg = fetchCommitsMock.mock.calls[0][0];
    expect(arg.owner).toBe("grup/sub");
    expect(arg.repo).toBe("proyek");
  });

  // Kasus nyata dari pemilik repo, dipakai sebagai regresi: repo di subgrup
  // GitLab harus benar-benar sampai ke `fetchCommits`, bukan ditolak di lokal.
  it("menerima jalur GitLab nyata dari subgrup (it-sigap/after-sales/...)", async () => {
    findUniqueMock.mockResolvedValue(
      baris({
        provider: "GITLAB",
        repoPath: "it-sigap/after-sales/laporan-bulanan",
      }),
    );
    const hasil = await resolveCommits("u1", "2026-06-01");
    expect(hasil.ok).toBe(true);
    const arg = fetchCommitsMock.mock.calls[0][0];
    expect(arg.owner).toBe("it-sigap/after-sales");
    expect(arg.repo).toBe("laporan-bulanan");
  });

  it("menerima jalur 2 segmen tanpa mengubah perilaku", async () => {
    findUniqueMock.mockResolvedValue(
      baris({ provider: "GITLAB", repoPath: "azharabdulsali/jadwalmagang-app" }),
    );
    await resolveCommits("u1", "2026-06-01");
    const arg = fetchCommitsMock.mock.calls[0][0];
    expect(arg.owner).toBe("azharabdulsali");
    expect(arg.repo).toBe("jadwalmagang-app");
  });

  it("menolak GitLab bertingkat? Tidak — GitHub yang menolak, dengan pesan jelas", async () => {
    findUniqueMock.mockResolvedValue(
      baris({ provider: "GITHUB", repoPath: "grup/sub/proyek" }),
    );
    const hasil = await resolveCommits("u1", "2026-06-01");
    // `ResolveResult` adalah union; assert dulu agar TypeScript bisa
    // mempersempit dan `message`/`commits` boleh diakses.
    expect(hasil.ok).toBe(false);
    if (hasil.ok) throw new Error("seharusnya gagal");
    expect(hasil.message).toContain("GitHub tidak mendukung repo bertingkat");
    // Tidak boleh sampai memanggil API dengan jalur yang pasti salah.
    expect(fetchCommitsMock).not.toHaveBeenCalled();
  });

  it("menolak jalur tanpa '/' dengan pesan bentuk yang benar", async () => {
    findUniqueMock.mockResolvedValue(
      baris({ provider: "GITLAB", repoPath: "proyek-saja" }),
    );
    const hasil = await resolveCommits("u1", "2026-06-01");
    expect(hasil.ok).toBe(false);
    if (hasil.ok) throw new Error("seharusnya gagal");
    expect(hasil.message).toContain("owner/nama-repo");
    expect(fetchCommitsMock).not.toHaveBeenCalled();
  });

  it("commit kosong hari ini bukan galat: ok true dengan daftar kosong", async () => {
    // Inilah yang seharusnya terjadi saat pengguna belum commit hari ini.
    fetchCommitsMock.mockResolvedValue([]);
    const hasil = await resolveCommits("u1", "2026-06-01");
    expect(hasil.ok).toBe(true);
    if (!hasil.ok) throw new Error("seharusnya sukses");
    expect(hasil.commits).toEqual([]);
  });

  it("hasil sukses TIDAK memuat token", async () => {
    const hasil = await resolveCommits("u1", "2026-06-01");
    expect(JSON.stringify(hasil)).not.toContain("TOKEN-RAHASIA-SEKALI");
  });

  it("mencatat lastFetchedAt dan membersihkan lastError saat sukses", async () => {
    await resolveCommits("u1", "2026-06-01");
    // `updateMany`, bukan `update`: bila baris repo hilang di sela permintaan,
    // `update` melempar P2025 dan galatnya tertelan `.catch` -> "sukses"
    // padahal status tak tersimpan. `updateMany` = 0 baris, tanpa galat.
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        data: expect.objectContaining({ lastError: null }),
      }),
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("gagal anggun bila belum ada repo", async () => {
    findUniqueMock.mockResolvedValue(null);
    const hasil = await resolveCommits("u1", "2026-06-01");

    expect(hasil.ok).toBe(false);
    expect(fetchCommitsMock).not.toHaveBeenCalled();
  });

  it("gagal anggun bila repo dinonaktifkan", async () => {
    findUniqueMock.mockResolvedValue(baris({ enabled: false }));
    const hasil = await resolveCommits("u1", "2026-06-01");

    expect(hasil.ok).toBe(false);
    expect(fetchCommitsMock).not.toHaveBeenCalled();
  });

  it("gagal anggun bila fitur dimatikan operator", async () => {
    process.env.GIT_COMMITS_ENABLED = "false";
    const hasil = await resolveCommits("u1", "2026-06-01");

    expect(hasil.ok).toBe(false);
    expect(fetchCommitsMock).not.toHaveBeenCalled();
  });

  it("gagal anggun bila dekripsi token gagal (kunci enkripsi berganti)", async () => {
    decryptMock.mockImplementation(() => {
      throw new Error("bad auth tag");
    });
    const hasil = await resolveCommits("u1", "2026-06-01");

    expect(hasil.ok).toBe(false);
    expect(fetchCommitsMock).not.toHaveBeenCalled();
    // Pesan harus memberi tindakan yang jelas, bukan kode galat mentah.
    if (!hasil.ok) expect(hasil.message).toContain("Tempel ulang token");
  });

  it("mengubah GitApiError menjadi pesan aman dan menyimpannya ke lastError", async () => {
    fetchCommitsMock.mockRejectedValue(
      new GitApiError("AUTH", "Token git ditolak oleh GitHub."),
    );
    const hasil = await resolveCommits("u1", "2026-06-01");

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.message).toBe("Token git ditolak oleh GitHub.");
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastError: "Token git ditolak oleh GitHub." },
      }),
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("tetap mengembalikan hasil saat penyimpanan status gagal (baris repo hilang)", async () => {
    // `updateMany` tidak melempar P2025, tapi DB tetap bisa galat (mis. sibuk).
    // `.catch` kosong di service disengaja: kegagalan mencatat status TIDAK
    // boleh membatalkan commit yang sudah berhasil diambil.
    updateManyMock.mockRejectedValue(new Error("database sedang sibuk"));
    const hasil = await resolveCommits("u1", "2026-06-01");
    expect(hasil.ok).toBe(true);
  });

  it("TIDAK melempar untuk galat tak terduga (GitHub down, DNS, dsb.)", async () => {
    fetchCommitsMock.mockRejectedValue(new TypeError("fetch failed"));
    const hasil = await resolveCommits("u1", "2026-06-01");

    expect(hasil.ok).toBe(false);
    // Pesan galat mentah tidak boleh diteruskan ke pengguna.
    if (!hasil.ok) {
      expect(hasil.message).not.toContain("fetch failed");
      expect(hasil.message.length).toBeGreaterThan(10);
    }
  });

  it("mengembalikan keywords yang siap dipakai penyusun draf", async () => {
    const hasil = await resolveCommits("u1", "2026-06-01");
    if (hasil.ok) {
      expect(hasil.keywords).toContain("migrasi skema Prisma");
    }
  });
});
