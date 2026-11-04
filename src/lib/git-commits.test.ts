import { describe, it, expect } from "vitest";
import {
  cleanCommitTitle,
  isGenericCommitTitle,
  commitsToKeywords,
  jakartaDayRange,
  MAX_KEYWORDS_LENGTH,
  MAX_COMMITS_IN_KEYWORDS,
  type GitCommit,
} from "./git-commits";

/** Commit tiruan dengan nilai default yang wajar. */
function commit(over: Partial<GitCommit> = {}): GitCommit {
  return {
    shortId: "abc1234",
    title: "menambah validasi form login",
    author: "Budi",
    committedAt: "2027-02-10T03:00:00Z",
    ...over,
  };
}

describe("cleanCommitTitle", () => {
  it("membuang prefix Conventional Commits", () => {
    expect(cleanCommitTitle("feat: menambah export CSV")).toBe(
      "menambah export CSV",
    );
  });

  it("membuang prefix beserta scope dan tanda !", () => {
    expect(cleanCommitTitle("fix(api)!: perbaiki rate limit")).toBe(
      "perbaiki rate limit",
    );
  });

  it("merapikan spasi berlebih", () => {
    expect(cleanCommitTitle("  tambah    filter   tanggal  ")).toBe(
      "tambah filter tanggal",
    );
  });

  it("mempertahankan judul yang bukan Conventional Commits", () => {
    expect(cleanCommitTitle("Perbaiki bug tanggal laporan")).toBe(
      "Perbaiki bug tanggal laporan",
    );
  });

  it("memotong judul yang kepanjangan dan menandainya dengan elipsis", () => {
    const panjang = "a".repeat(300);
    const hasil = cleanCommitTitle(panjang);
    expect(hasil.length).toBe(120);
    expect(hasil.endsWith("…")).toBe(true);
  });

  it("tidak menganggap 'fix bug login' sebagai prefix", () => {
    // Tanpa titik dua, "fix" adalah kata biasa, bukan prefix.
    expect(cleanCommitTitle("fix bug login")).toBe("fix bug login");
  });
});

describe("isGenericCommitTitle", () => {
  it.each(["update", "WIP", "fix", "initial commit", "", "   ", "typo"])(
    "menganggap %j tidak berguna sebagai bahan laporan",
    (judul) => {
      expect(isGenericCommitTitle(judul)).toBe(true);
    },
  );

  it.each([
    "memperbaiki filter tanggal",
    "menambah halaman riwayat",
    "update: menambah validasi email",
  ])("menganggap %j layak dipakai", (judul) => {
    expect(isGenericCommitTitle(judul)).toBe(false);
  });
});

describe("commitsToKeywords", () => {
  it("menggabungkan judul dengan pemisah titik koma", () => {
    const hasil = commitsToKeywords([
      commit({ title: "menambah export CSV" }),
      commit({ title: "memperbaiki filter tanggal" }),
    ]);
    expect(hasil).toBe("menambah export CSV; memperbaiki filter tanggal");
  });

  it("membuang judul generik", () => {
    const hasil = commitsToKeywords([
      commit({ title: "wip" }),
      commit({ title: "menambah export CSV" }),
      commit({ title: "update" }),
    ]);
    expect(hasil).toBe("menambah export CSV");
  });

  it("mendeduplikasi judul sama tanpa membedakan huruf besar-kecil", () => {
    const hasil = commitsToKeywords([
      commit({ title: "Menambah Export CSV" }),
      commit({ title: "menambah export csv" }),
    ]);
    expect(hasil).toBe("Menambah Export CSV");
  });

  it("mengembalikan string kosong bila tidak ada commit sama sekali", () => {
    expect(commitsToKeywords([])).toBe("");
  });

  it("mengembalikan string kosong bila SEMUA commit generik", () => {
    // Kasus ini penting: pemanggil harus tahu tidak ada bahan, supaya bisa
    // memberi tahu pengguna alih-alih diam-diam membuat draf generik.
    expect(commitsToKeywords([commit({ title: "wip" })])).toBe("");
  });

  it("membatasi jumlah commit yang dirangkum", () => {
    const banyak = Array.from({ length: 40 }, (_, i) =>
      commit({ title: `perubahan nomor ${i}` }),
    );
    const hasil = commitsToKeywords(banyak);
    expect(hasil.split("; ").length).toBe(MAX_COMMITS_IN_KEYWORDS);
  });

  it("membatasi panjang total keluaran", () => {
    const banyak = Array.from({ length: 15 }, () =>
      commit({ title: "x".repeat(115) }),
    );
    const hasil = commitsToKeywords(banyak);
    expect(hasil.length).toBeLessThanOrEqual(MAX_KEYWORDS_LENGTH);
  });

  it("tidak membocorkan email penulis (hanya judul yang dipakai)", () => {
    const hasil = commitsToKeywords([
      commit({ title: "menambah export CSV", author: "budi@contoh.com" }),
    ]);
    expect(hasil).not.toContain("@");
  });
});

describe("jakartaDayRange", () => {
  it("memakai batas Asia/Jakarta, BUKAN UTC", () => {
    // 2027-02-10 di WIB dimulai 2027-02-09T17:00Z.
    // Kalau kode salah memakai UTC, hasilnya akan 2027-02-10T00:00:00.000Z.
    const { sinceIso } = jakartaDayRange("2027-02-10");
    expect(sinceIso).toBe("2027-02-09T17:00:00.000Z");
    expect(sinceIso).not.toBe("2027-02-10T00:00:00.000Z");
  });

  it("mencakup sampai akhir hari WIB (23:59:59.999)", () => {
    const { untilIso } = jakartaDayRange("2027-02-10");
    expect(untilIso).toBe("2027-02-10T16:59:59.999Z");
  });

  it("memakai rentang tepat 24 jam", () => {
    const { sinceIso, untilIso } = jakartaDayRange("2027-02-10");
    const selisih = new Date(untilIso).getTime() - new Date(sinceIso).getTime();
    expect(selisih).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("commit pukul 06:30 WIB tanggal 10 TIDAK terlewat", () => {
    // Poin utama fitur: commit pagi hari harus masuk laporan hari itu juga.
    const { sinceIso, untilIso } = jakartaDayRange("2027-02-10");
    const commitPagi = new Date("2027-02-09T23:30:00Z"); // = 06:30 WIB tgl 10
    expect(commitPagi.getTime()).toBeGreaterThanOrEqual(
      new Date(sinceIso).getTime(),
    );
    expect(commitPagi.getTime()).toBeLessThanOrEqual(new Date(untilIso).getTime());
  });

  it("menolak tanggal yang tidak valid", () => {
    expect(() => jakartaDayRange("besok")).toThrow(/tidak valid/i);
  });
});
