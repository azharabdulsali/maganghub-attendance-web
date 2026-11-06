// src/lib/commit-learning.test.ts: mengunci aturan "pembelajaran harus punya
// bukti". Tes ini sengaja menekankan sisi PENOLAKAN, karena kesalahan paling
// berbahaya di sini bukan kolom kosong, melainkan kolom berisi karangan.

import { describe, expect, it } from "vitest";

import { detectChangeKind, learningFromCommits } from "./commit-learning";
import { checkReportField, countReportLength, MIN_REPORT_LENGTH } from "./report-rules";
import type { GitCommit } from "./git-commits";

function commit(title: string, body?: string): GitCommit {
  return {
    shortId: "abc1234",
    title,
    body,
    author: "Peserta Magang",
    committedAt: "2026-02-10T03:00:00.000Z",
  };
}

describe("detectChangeKind", () => {
  it("membaca prefix Conventional Commits", () => {
    expect(detectChangeKind(commit("fix: perbaiki filter tanggal"))).toBe("FIX");
    expect(detectChangeKind(commit("feat(auth): tambah login"))).toBe("FEATURE");
    expect(detectChangeKind(commit("test: uji route submit"))).toBe("TEST");
    expect(detectChangeKind(commit("docs: perbarui README"))).toBe("DOCS");
    expect(detectChangeKind(commit("refactor: rapikan service"))).toBe("REFACTOR");
    expect(detectChangeKind(commit("chore: setup workflow"))).toBe("CONFIG");
  });

  it("jatuh ke kata di judul bila tanpa prefix", () => {
    expect(detectChangeKind(commit("perbaiki bug simpan laporan"))).toBe("FIX");
    expect(detectChangeKind(commit("menambahkan halaman rekap"))).toBe("FEATURE");
  });

  it("judul tanpa sinyal apa pun = OTHER", () => {
    expect(detectChangeKind(commit("update"))).toBe("OTHER");
    expect(detectChangeKind(commit(""))).toBe("OTHER");
  });

  it("tidak salah membaca potongan kata sebagai jenis", () => {
    // "prefix" memuat "fix" sebagai potongan; \b mencegahnya terbaca sebagai FIX.
    expect(detectChangeKind(commit("menata ulang prefix"))).toBe("OTHER");
  });

  // Kasus nyata: gaya kurung siku dipakai repo pemilik. Tanpa dukungan prefix
  // ini, judul di bawah terbaca REFACTOR (kata "refactor" lebih dulu cocok saat
  // pencocokan jatuh ke judul), padahal commit-nya PERBAIKAN.
  it("membaca prefix gaya kurung siku", () => {
    expect(
      detectChangeKind(commit("[FIX]: delete External ID and refactor documentation")),
    ).toBe("FIX");
    expect(detectChangeKind(commit("[ADD] Tambah tombol di email revisi"))).toBe("FEATURE");
    expect(detectChangeKind(commit("[UP] Ubah label password"))).toBe("OTHER");
    expect(detectChangeKind(commit("[DOCS]: perbarui README"))).toBe("DOCS");
  });
});

describe("learningFromCommits — tidak mengarang", () => {
  it("tanpa commit → null (bukan teks kosong yang terlihat terisi)", () => {
    expect(learningFromCommits([])).toBeNull();
  });

  it("commit generik tanpa sinyal → null", () => {
    expect(learningFromCommits([commit("update"), commit("wip")])).toBeNull();
  });

  it("hanya commit kosong → null", () => {
    expect(learningFromCommits([commit("   ")])).toBeNull();
  });

  // Tes ini mengunci guard "tidak ada bukti" secara TERPISAH dari validasi
  // panjang. Tanpa pemisahan itu, guard bisa dihapus dan tes tetap hijau
  // (teks kosong tetap ditolak karena < MIN_REPORT_LENGTH) — tes yang lulus
  // secara kebetulan tidak menjaga apa pun. Karena itu di sini kata kunci
  // dibuat cukup panjang agar, bila guard hilang, hasilnya AKAN lolos validasi
  // panjang dan tes ini menjadi merah.
  it("kata kunci panjang tanpa sinyal jenis → tetap null, bukan teks panjang", () => {
    const panjang =
      "membantu proses pendataan anggota baru di bagian administrasi pada minggu pertama kegiatan magang berlangsung";
    expect(countReportLength(panjang)).toBeGreaterThanOrEqual(MIN_REPORT_LENGTH);
    // Prasyarat: bahan ini memang lolos validasi panjang sendiri.
    expect(checkReportField(panjang)).toBeNull();

    expect(learningFromCommits([commit(panjang)])).toBeNull();
  });
});

describe("learningFromCommits — berbasis bukti", () => {
  it("memakai topik dan jenis perubahan dari commit", () => {
    const hasil = learningFromCommits([commit("fix: perbaiki filter tanggal laporan")]);
    expect(hasil).not.toBeNull();
    expect(hasil).toContain("filter tanggal laporan");
    expect(hasil).toMatch(/akar masalah/i);
  });

  it("kolom yang dikembalikan selalu lulus validasi server", () => {
    const contoh = [
      [commit("feat: tambah ekspor CSV")],
      [commit("test: uji cron")],
      [commit("docs: README")],
      [commit("chore: env")],
      [commit("refactor: service")],
      [commit("fix: bug"), commit("feat: fitur"), commit("test: uji")],
    ];
    for (const daftar of contoh) {
      const hasil = learningFromCommits(daftar);
      if (hasil !== null) expect(checkReportField(hasil)).toBeNull();
    }
  });

  it("maksimal dua jenis pembelajaran agar tidak bertele-tele", () => {
    const hasil = learningFromCommits([
      commit("fix: bug"),
      commit("feat: fitur"),
      commit("test: uji"),
      commit("docs: dokumentasi"),
    ]);
    expect(hasil).not.toBeNull();
    // Empat jenis tersedia, tapi paling banyak dua kalimat pelajaran jenis.
    const jumlahPelajaran = (hasil!.match(/saya belajar/g) ?? []).length;
    expect(jumlahPelajaran).toBeLessThanOrEqual(2);
  });

  it("deterministik: bahan sama → hasil sama", () => {
    const daftar = [commit("fix: bug simpan"), commit("feat: ekspor")];
    expect(learningFromCommits(daftar)).toBe(learningFromCommits(daftar));
  });

  // PRINSIP INTI modul ini: klaim "mempelajari" hanya boleh berasal dari
  // `PELAJARAN_PER_JENIS`, yang punya dasar jenis perubahan. Kalimat tentang
  // TOPIK tidak boleh mengklaim apa pun soal isi kepala pengguna.
  //
  // Tes ini ada karena versi sebelumnya lolos semua tes lain sambil memuat
  // "saya mempelajari penerapannya secara langsung" di setiap keluaran —
  // klaim tanpa dasar yang selalu lolos karena tidak ada yang memeriksanya.
  it("kalimat topik TIDAK mengklaim 'mempelajari'", () => {
    const hasil = learningFromCommits([commit("fix: bug simpan data")]);
    expect(hasil).not.toBeNull();

    // Ambil HANYA kalimat pertama (kalimat topik). Kalimat jenis perubahan
    // boleh memakai kata "mempelajari/saya belajar"; kalimat topik tidak.
    const kalimatTopik = hasil!.split(/(?<=\.)\s+/)[0];
    expect(kalimatTopik).not.toMatch(/mempelajari|saya belajar/i);
    // Dan kalimat topik memang menyebut pekerjaannya, bukan kalimat kosong.
    expect(kalimatTopik).toMatch(/bug simpan data/i);
  });

  it("kata 'mempelajari' hanya muncul sebanyak kalimat pelajaran jenis", () => {
    const hasil = learningFromCommits([
      commit("fix: bug simpan data"),
      commit("feat: ekspor laporan"),
    ]);
    expect(hasil).not.toBeNull();
    const jumlah = (hasil!.match(/mempelajari|saya belajar/gi) ?? []).length;
    // Maksimal dua jenis (slice(0,2)), dan tiap jenis muncul paling banyak
    // sekali — bukan satu per commit, bukan satu tambahan dari kalimat topik.
    expect(jumlah).toBeLessThanOrEqual(2);
  });
});
