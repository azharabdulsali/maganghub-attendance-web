// src/lib/validate-git-repo.test.ts: uji skema Zod untuk konfigurasi repo git.
//
// KENAPA DIPISAH DAN DIUJI KETAT
// ------------------------------
// `repoPath` adalah satu-satunya bagian URL API git yang berasal dari pengguna.
// Kalau lolos karakter aneh (`..`, `//`, `@`, spasi), permintaan bisa dibelokkan
// ke host/path lain. `buildApiPath` punya penjaga sendiri, tetapi skema ini
// adalah lapis pertama yang harus menolak lebih dulu — dan tes ini mengunci
// daftar hal yang ditolak supaya tidak dilonggarkan tanpa sengaja.

import { describe, expect, it } from "vitest";

import { gitPreviewSchema, gitRepoSchema, gitRepoToggleSchema } from "./validate";

const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123";

function valid(overrides: Record<string, unknown> = {}) {
  return { provider: "GITHUB", repoPath: "budi/proyek", token: TOKEN, ...overrides };
}

describe("gitRepoSchema", () => {
  it("menerima bentuk normal dan mengisi branch default 'main'", () => {
    const hasil = gitRepoSchema.safeParse(valid());
    expect(hasil.success).toBe(true);
    if (hasil.success) expect(hasil.data.branch).toBe("main");
  });

  it("menerima GitLab dengan namespace bertingkat", () => {
    const hasil = gitRepoSchema.safeParse(
      valid({ provider: "GITLAB", repoPath: "grup/sub/proyek" }),
    );
    expect(hasil.success).toBe(true);
  });

  it("menerima nama repo dengan titik, garis bawah, dan tanda hubung", () => {
    expect(gitRepoSchema.safeParse(valid({ repoPath: "budi_99/proyek-ku.js" })).success).toBe(
      true,
    );
  });

  it("menolak provider di luar GITHUB/GITLAB (host tidak pernah dari input)", () => {
    expect(gitRepoSchema.safeParse(valid({ provider: "BITBUCKET" })).success).toBe(false);
    expect(gitRepoSchema.safeParse(valid({ provider: "https://evil.example" })).success).toBe(
      false,
    );
  });

  it.each([
    ["https://evil.example/x", "URL lengkap"],
    ["budi/../etc", "traversal '..'"],
    ["budi//proyek", "garis miring ganda"],
    ["budi/proyek/", "diakhiri garis miring"],
    ["budi proyek/x", "spasi"],
    ["budi/proyek?x=1", "query string"],
    ["budi/proyek#frag", "fragment"],
    ["user:pass@host/repo", "kredensial dalam URL"],
    ["/proyek", "diawali garis miring"],
    ["proyek", "tanpa owner"],
  ])("menolak repoPath %s (%s)", (repoPath) => {
    expect(gitRepoSchema.safeParse(valid({ repoPath })).success).toBe(false);
  });

  it("menolak token terlalu pendek", () => {
    expect(gitRepoSchema.safeParse(valid({ token: "pendek" })).success).toBe(false);
  });

  it("menolak branch dengan karakter yang tidak diizinkan", () => {
    expect(gitRepoSchema.safeParse(valid({ branch: "main branch" })).success).toBe(false);
    expect(gitRepoSchema.safeParse(valid({ branch: "main;rm -rf" })).success).toBe(false);
  });

  it("pesan galat menunjuk format yang benar", () => {
    const hasil = gitRepoSchema.safeParse(valid({ repoPath: "proyek" }));
    expect(hasil.success).toBe(false);
    if (!hasil.success) {
      expect(hasil.error.issues[0].message).toContain("owner/nama-repo");
    }
  });
});

describe("gitPreviewSchema", () => {
  it("menerima body kosong (memakai hari ini)", () => {
    expect(gitPreviewSchema.safeParse({}).success).toBe(true);
  });

  it("menerima tanggal YYYY-MM-DD", () => {
    expect(gitPreviewSchema.safeParse({ date: "2026-06-01" }).success).toBe(true);
  });

  it.each(["01-06-2026", "2026/06/01", "kemarin", "2026-13-45"])(
    "menolak tanggal %s",
    (date) => {
      expect(gitPreviewSchema.safeParse({ date }).success).toBe(false);
    },
  );
});

// Sakelar repo: hanya `enabled` (boolean). Sengaja TIDAK menerima token, supaya
// permintaan sakelar tidak bisa dipakai untuk menimpa token.
describe("gitRepoToggleSchema", () => {
  it("menerima true dan false", () => {
    expect(
      gitRepoToggleSchema.safeParse({ action: "toggle", enabled: true }).success,
    ).toBe(true);
    expect(
      gitRepoToggleSchema.safeParse({ action: "toggle", enabled: false }).success,
    ).toBe(true);
  });

  it("menolak nilai yang bukan boolean", () => {
    // "true" sebagai STRING adalah kesalahan klasik dari klien yang lupa
    // mengirim boolean. Kalau diloloskan, Prisma akan menyimpan nilai yang
    // sudah dikonversi diam-diam dan sakelar bisa "nyangkut".
    expect(gitRepoToggleSchema.safeParse({ enabled: "true" }).success).toBe(false);
    expect(gitRepoToggleSchema.safeParse({ enabled: 1 }).success).toBe(false);
    expect(gitRepoToggleSchema.safeParse({}).success).toBe(false);
  });
});

