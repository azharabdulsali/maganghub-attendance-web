import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildApiPath,
  fetchCommits,
  normalizeBranch,
  normalizeGithubCommit,
  normalizeGitlabCommit,
  GitApiError,
} from "./git-provider";

/** Balasan `fetch` tiruan dengan status & JSON tertentu. */
function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? 200;
  const spy = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

const OPSI_DASAR = {
  provider: "GITHUB" as const,
  owner: "budi",
  repo: "proyek-magang",
  token: "ghp_RAHASIA123",
  sinceIso: "2027-02-09T17:00:00.000Z",
  untilIso: "2027-02-10T16:59:59.999Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildApiPath — pencegahan SSRF", () => {
  it("merakit jalur GitHub dari owner & repo yang sah", () => {
    expect(buildApiPath("GITHUB", "budi", "proyek")).toBe(
      "/repos/budi/proyek/commits",
    );
  });

  it("merakit jalur GitLab dengan project path ter-encode", () => {
    expect(buildApiPath("GITLAB", "grup/sub", "proyek")).toBe(
      "/projects/grup%2Fsub%2Fproyek/repository/commits",
    );
  });

  it.each([
    ["http://169.254.169.254", "metadata"],
    ["budi", "../../etc/passwd"],
    ["budi", ".."],
    ["budi", "a//b"],
    ["budi", "repo?x=1"],
    ["budi", "repo#frag"],
    ["budi", "repo name"],
    ["", "repo"],
    ["budi", ""],
    ["-awal", "repo"],
    ["budi", "repo-"],
  ])("menolak owner=%j repo=%j", (owner, repo) => {
    expect(() => buildApiPath("GITHUB", owner, repo)).toThrow(GitApiError);
  });

  it("menolak owner/repo yang terlalu panjang", () => {
    expect(() => buildApiPath("GITHUB", "a".repeat(201), "repo")).toThrow(
      /terlalu panjang/,
    );
  });
});

describe("fetchCommits — branch yang dibaca", () => {
  it("mengirim ref_name untuk GitLab bila branch diisi", async () => {
    const spy = stubFetch([]);
    await fetchCommits({ ...OPSI_DASAR, provider: "GITLAB", branch: "dev-zar" });

    const [url] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("ref_name")).toBe("dev-zar");
  });

  it("mengirim sha untuk GitHub bila branch diisi", async () => {
    const spy = stubFetch([]);
    await fetchCommits({ ...OPSI_DASAR, branch: "dev-zar" });

    const [url] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("sha")).toBe("dev-zar");
  });

  it("TIDAK mengirim parameter branch bila kosong (biar API pakai default branch)", async () => {
    for (const provider of ["GITHUB", "GITLAB"] as const) {
      const spy = stubFetch([]);
      await fetchCommits({ ...OPSI_DASAR, provider, branch: "" });

      const [url] = spy.mock.calls[0] as unknown as [string, RequestInit];
      const q = new URL(url).searchParams;
      // Ini inti perilaku "kosong = default branch repo", bukan default "main".
      expect(q.get("ref_name")).toBeNull();
      expect(q.get("sha")).toBeNull();
    }
  });

  it("memperlakukan branch undefined/null sama seperti kosong", async () => {
    for (const branch of [undefined, null]) {
      const spy = stubFetch([]);
      await fetchCommits({ ...OPSI_DASAR, branch: branch ?? undefined });
      const [url] = spy.mock.calls[0] as unknown as [string, RequestInit];
      expect(new URL(url).searchParams.get("sha")).toBeNull();
    }
  });

  it("memangkas spasi di nama branch", async () => {
    const spy = stubFetch([]);
    await fetchCommits({ ...OPSI_DASAR, provider: "GITLAB", branch: "  dev-zar  " });

    const [url] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("ref_name")).toBe("dev-zar");
  });

  it.each(["main branch", "dev;rm -rf", "-danger", "a..b", "a//b", "x".repeat(201)])(
    "menolak branch tidak sah %j tanpa memanggil jaringan",
    async (branch) => {
      const spy = stubFetch([]);
      await expect(fetchCommits({ ...OPSI_DASAR, branch })).rejects.toThrow(
        GitApiError,
      );
      expect(spy).not.toHaveBeenCalled();
    },
  );
});

describe("normalizeBranch", () => {
  it("mengembalikan null untuk nilai kosong", () => {
    expect(normalizeBranch("")).toBeNull();
    expect(normalizeBranch("   ")).toBeNull();
    expect(normalizeBranch(undefined)).toBeNull();
    expect(normalizeBranch(null)).toBeNull();
  });

  it("menerima branch bertingkat dan mengembalikan bentuk terpangkas", () => {
    expect(normalizeBranch("dev-zar")).toBe("dev-zar");
    expect(normalizeBranch("feature/login-2")).toBe("feature/login-2");
    expect(normalizeBranch(" dev-zar ")).toBe("dev-zar");
  });
});

describe("fetchCommits — keamanan token", () => {
  it("mengirim token GitHub di header Authorization, bukan di URL", async () => {
    const spy = stubFetch([]);
    await fetchCommits(OPSI_DASAR);

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("ghp_RAHASIA123");
    expect(
      url.startsWith("https://api.github.com/repos/budi/proyek-magang/commits"),
    ).toBe(true);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ghp_RAHASIA123");
  });

  it("memakai header PRIVATE-TOKEN untuk GitLab", async () => {
    const spy = stubFetch([]);
    await fetchCommits({ ...OPSI_DASAR, provider: "GITLAB" });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith("https://gitlab.com/api/v4/projects/")).toBe(true);
    expect(url).not.toContain("ghp_RAHASIA123");
    const headers = init.headers as Record<string, string>;
    expect(headers["PRIVATE-TOKEN"]).toBe("ghp_RAHASIA123");
    expect(headers.Authorization).toBeUndefined();
  });

  it("hanya memakai metode GET", async () => {
    const spy = stubFetch([]);
    await fetchCommits(OPSI_DASAR);
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("GET");
  });

  it("meneruskan rentang sejak/sampai ke query", async () => {
    const spy = stubFetch([]);
    await fetchCommits(OPSI_DASAR);
    const [url] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const q = new URL(url).searchParams;
    expect(q.get("since")).toBe("2027-02-09T17:00:00.000Z");
    expect(q.get("until")).toBe("2027-02-10T16:59:59.999Z");
  });

  it("menolak token kosong tanpa memanggil jaringan", async () => {
    const spy = stubFetch([]);
    await expect(fetchCommits({ ...OPSI_DASAR, token: "  " })).rejects.toThrow(
      /Token git belum diisi/,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("fetchCommits — penanganan kegagalan", () => {
  it("memetakan 401 ke AUTH dengan pesan yang tidak memuat token", async () => {
    stubFetch({}, { ok: false, status: 401 });
    const err = await fetchCommits(OPSI_DASAR).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitApiError);
    expect((err as GitApiError).kind).toBe("AUTH");
    expect((err as GitApiError).message).not.toContain("ghp_RAHASIA123");
  });

  it("memetakan 404 ke NOT_FOUND", async () => {
    stubFetch({}, { ok: false, status: 404 });
    const err = await fetchCommits(OPSI_DASAR).catch((e: unknown) => e);
    expect((err as GitApiError).kind).toBe("NOT_FOUND");
  });

  it("memetakan 429 ke RATE_LIMIT", async () => {
    stubFetch({}, { ok: false, status: 429 });
    const err = await fetchCommits(OPSI_DASAR).catch((e: unknown) => e);
    expect((err as GitApiError).kind).toBe("RATE_LIMIT");
  });

  it("memetakan jaringan putus ke NETWORK tanpa membocorkan URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("gagal konek ke https://api.github.com/x");
      }),
    );
    const err = await fetchCommits(OPSI_DASAR).catch((e: unknown) => e);
    expect((err as GitApiError).kind).toBe("NETWORK");
    expect((err as GitApiError).message).not.toContain("api.github.com");
  });

  it("menolak balasan yang bukan array", async () => {
    stubFetch({ message: "bukan array" });
    const err = await fetchCommits(OPSI_DASAR).catch((e: unknown) => e);
    expect((err as GitApiError).kind).toBe("HTTP");
  });
});

describe("normalizeGithubCommit", () => {
  it("mengubah balasan GitHub ke bentuk internal", () => {
    const hasil = normalizeGithubCommit({
      sha: "abcdef1234567890",
      html_url: "https://github.com/budi/proyek/commit/abcdef1",
      commit: {
        message: "feat: menambah export CSV\n\nCatatan tambahan",
        author: { name: "Budi", date: "2027-02-10T03:00:00Z" },
      },
    });
    expect(hasil).toEqual({
      shortId: "abcdef1",
      title: "feat: menambah export CSV",
      body: "Catatan tambahan",
      author: "Budi",
      committedAt: "2027-02-10T03:00:00Z",
      url: "https://github.com/budi/proyek/commit/abcdef1",
    });
  });

  it("mengabaikan commit tanpa sha atau pesan", () => {
    expect(normalizeGithubCommit({})).toBeNull();
    expect(normalizeGithubCommit({ sha: "abc" })).toBeNull();
    expect(normalizeGithubCommit(null)).toBeNull();
  });

  it("memberi nilai aman bila penulis tidak ada", () => {
    const hasil = normalizeGithubCommit({
      sha: "abc1234",
      commit: { message: "perbaikan" },
    });
    expect(hasil?.author).toBe("tidak diketahui");
    // Jangan sampai `undefined` lolos ke UI.
    expect(hasil?.committedAt).toBe("");
  });
});

describe("normalizeGitlabCommit", () => {
  it("mengubah balasan GitLab ke bentuk internal", () => {
    const hasil = normalizeGitlabCommit({
      id: "0123456789abcdef",
      short_id: "01234567",
      title: "menambah export CSV",
      author_name: "Budi",
      committed_date: "2027-02-10T03:00:00.000Z",
      web_url: "https://gitlab.com/budi/proyek/-/commit/0123456",
    });
    expect(hasil).toEqual({
      shortId: "01234567",
      title: "menambah export CSV",
      author: "Budi",
      committedAt: "2027-02-10T03:00:00.000Z",
      url: "https://gitlab.com/budi/proyek/-/commit/0123456",
    });
  });

  it("memakai baris pertama `message` bila `title` tidak ada", () => {
    const hasil = normalizeGitlabCommit({
      id: "0123456789abcdef",
      message: "menambah export CSV\n\npenjelasan",
    });
    expect(hasil?.title).toBe("menambah export CSV");
  });

  it("mengabaikan commit tanpa id atau judul", () => {
    expect(normalizeGitlabCommit({})).toBeNull();
    expect(normalizeGitlabCommit({ id: "abc" })).toBeNull();
  });
});

describe("fetchCommits — integrasi normalisasi", () => {
  it("menyaring commit rusak dari daftar GitHub", async () => {
    stubFetch([
      { sha: "aaa1111", commit: { message: "satu" } },
      { tanpa_sha: true },
      { sha: "bbb2222", commit: { message: "dua" } },
    ]);
    const hasil = await fetchCommits(OPSI_DASAR);
    expect(hasil.map((c) => c.title)).toEqual(["satu", "dua"]);
  });

  it("menormalkan daftar GitLab", async () => {
    stubFetch([{ id: "0123456789abcdef", title: "satu" }]);
    const hasil = await fetchCommits({ ...OPSI_DASAR, provider: "GITLAB" });
    expect(hasil).toHaveLength(1);
    expect(hasil[0].title).toBe("satu");
  });
});
