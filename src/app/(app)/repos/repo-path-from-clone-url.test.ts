// src/app/(app)/repos/repo-path-from-clone-url.test.ts: tes pengurai URL clone.
//
// Fungsi ini menyentuh teks yang diketik pengguna dan menentukan nilai yang
// kemudian dikirim ke API, jadi kasus tepinya harus dikunci. Contoh nyata dari
// pemilik repo (`git@gitlab.com:azharabdulsali/jadwalmagang-app.git`) dipakai
// sebagai kasus utama, bukan karangan.

import { describe, expect, it } from "vitest";

import { repoPathFromCloneUrl } from "./repo-form";

describe("repoPathFromCloneUrl", () => {
  it("mengurai URL SSH GitLab (kasus nyata pemilik repo)", () => {
    expect(
      repoPathFromCloneUrl("git@gitlab.com:azharabdulsali/jadwalmagang-app.git"),
    ).toBe("azharabdulsali/jadwalmagang-app");
  });

  it("mengurai URL HTTPS GitLab dan membuang akhiran .git", () => {
    expect(
      repoPathFromCloneUrl("https://gitlab.com/azharabdulsali/jadwalmagang-app.git"),
    ).toBe("azharabdulsali/jadwalmagang-app");
  });

  it("mengurai URL HTTPS tanpa .git", () => {
    expect(
      repoPathFromCloneUrl("https://gitlab.com/azharabdulsali/jadwalmagang-app"),
    ).toBe("azharabdulsali/jadwalmagang-app");
  });

  it("membuang garis miring di akhir URL", () => {
    expect(
      repoPathFromCloneUrl("https://gitlab.com/azharabdulsali/jadwalmagang-app/"),
    ).toBe("azharabdulsali/jadwalmagang-app");
  });

  it("mempertahankan namespace GitLab bertingkat", () => {
    expect(
      repoPathFromCloneUrl("git@gitlab.com:grup/sub/jadwalmagang-app.git"),
    ).toBe("grup/sub/jadwalmagang-app");
  });

  it("mendukung host GitLab self-hosted", () => {
    expect(
      repoPathFromCloneUrl("https://gitlab.kantor.id/tim/proyek-app.git"),
    ).toBe("tim/proyek-app");
  });

  it("tidak mengubah jalur polos yang sudah benar", () => {
    expect(repoPathFromCloneUrl("azharabdulsali/jadwalmagang-app")).toBeNull();
  });

  it("tidak mengubah jalur bertingkat yang sudah benar", () => {
    expect(repoPathFromCloneUrl("grup/sub/proyek")).toBeNull();
  });

  it("mengembalikan null untuk teks kosong", () => {
    expect(repoPathFromCloneUrl("")).toBeNull();
    expect(repoPathFromCloneUrl("   ")).toBeNull();
  });

  it("mengembalikan null bila URL tanpa owner/repo", () => {
    expect(repoPathFromCloneUrl("https://gitlab.com/")).toBeNull();
  });
});
