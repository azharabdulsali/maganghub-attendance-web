// src/lib/commit-learning.test.ts: mengunci aturan "pembelajaran harus punya
// bukti". Tes ini sengaja menekankan sisi PENOLAKAN, karena kesalahan paling
// berbahaya di sini bukan kolom kosong, melainkan kolom berisi karangan.

import { describe, expect, it } from "vitest";

import { detectChangeKind, learningFromCommits } from "./commit-learning";
import {
  checkReportField,
  countReportLength,
  DRAFT_MAX_LENGTH,
  MIN_REPORT_LENGTH,
} from "./report-rules";
import type { GitCommit } from "./git-commits";

function commit(
  title: string,
  bodyOrTime?: string,
  committedAt = "2026-02-10T03:00:00.000Z",
): GitCommit {
  return {
    shortId: "abc1234",
    title,
    // Argumen kedua boleh berupa waktu commit (string ISO) untuk tes urutan,
    // atau isi pesan commit untuk tes lain.
    body: bodyOrTime && !bodyOrTime.includes("T") ? bodyOrTime : undefined,
    author: "Peserta Magang",
    committedAt:
      bodyOrTime && bodyOrTime.includes("T") ? bodyOrTime : committedAt,
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

  // BATAS ATAS 200 KARAKTER (keputusan pemilik: draf harus 100-200 karakter).
  // Dua-duanya wajib: batas bawah dari `MIN_REPORT_LENGTH` (dipenuhi penutup
  // netral), batas atas dari pemotongan di modul ini. Sebelum perbaikan, modul
  // ini TIDAK punya batas atas sama sekali — pesan commit panjang menghasilkan
  // kolom 400+ karakter yang ditolak portal, padahal drafter lain sudah dibatasi.
  it("tidak pernah melewati batas atas 200 karakter", () => {
    // Judul sangat panjang: satu commit saja sudah cukup membuat keluaran
    // melewati batas bila tidak dipotong.
    const judulPanjang =
      "fix: perbaiki filter tanggal laporan bulanan agar rentang awal dan akhir " +
      "dihitung ulang setiap kali pengguna mengganti bulan yang sedang dilihat, " +
      "termasuk saat berpindah dari bulan dengan 31 hari ke bulan dengan 28 hari";
    const hasil = learningFromCommits([
      commit(judulPanjang),
      commit("feat: tambah ekspor CSV dengan kolom lengkap untuk arsip"),
    ]);
    expect(hasil).not.toBeNull();
    expect(countReportLength(hasil!)).toBeLessThanOrEqual(DRAFT_MAX_LENGTH);
    // Tetap memenuhi batas bawah, jadi tidak perlu dipotong sampai kosong.
    expect(countReportLength(hasil!)).toBeGreaterThanOrEqual(MIN_REPORT_LENGTH);
  });

  it("pemotongan di batas kata: tidak memotong di tengah kata yang terlihat", () => {
    const hasil = learningFromCommits([
      commit(
        "fix: perbaiki validasi kolom uraian aktivitas yang menolak teks sah " +
          "karena menghitung spasi ganda sebagai karakter tambahan",
      ),
    ]);
    expect(hasil).not.toBeNull();
    // Tidak berakhir dengan penggal kata + elipsis (mis. "aktivit…").
    // `trimToChars` memotong di batas kata, jadi sebelum "…" selalu ada
    // karakter utuh atau tanda baca.
    expect(hasil!).not.toMatch(/[a-z]…$/);
  });

  // Regresi: dulu topik dipenggal dengan `judul.slice(0, 69) + "…"`, sehingga
  // elipsis menempel langsung pada penggal kata ("…teks sah karena…").
  // Pemotongan mentah tidak tahu batas kata; `trimToChars` tahu. Yang diperiksa
  // di sini adalah DI DALAM tanda kutip topik, bukan hanya ujung kalimat, karena
  // penggalan itu terjadi di tengah hasil gabungan.
  it("topik yang dipenggal tidak berakhir dengan penggal kata", () => {
    const hasil = learningFromCommits([
      commit(
        "fix: perbaiki validasi kolom uraian aktivitas yang menolak teks sah " +
          "karena menghitung spasi ganda sebagai karakter tambahan",
      ),
    ]);
    expect(hasil).not.toBeNull();
    // Yang diperiksa BUKAN "tidak ada elipsis" (elipsis memang wajar), juga
    // bukan "elipsis tidak didahului huruf" — `"…teks sah…"` didahului huruf
    // "h" dan itu SAH, karena "sah" adalah kata utuh. Yang salah adalah
    // elipsis yang menempel pada PENGGAL kata, dan itu tidak bisa dibedakan
    // dari bentuk teksnya saja. Karena itu yang diperiksa adalah kata SEBELUM
    // elipsis: ia harus muncul utuh di judul commit asli.
    //
    // Dibatasi pada isi tanda kutip (bagian TOPIK). Elipsis lain berasal dari
    // pemotongan ekor kalimat, wilayah yang sudah diuji tes di atas.
    const judul =
      "perbaiki validasi kolom uraian aktivitas yang menolak teks sah " +
      "karena menghitung spasi ganda sebagai karakter tambahan";
    const topik = hasil!.match(/mencakup "([^"]*)"/)?.[1];
    expect(topik).toBeDefined();
    for (const cocok of topik!.matchAll(/(\S+)…/gu)) {
      expect(judul.split(" ")).toContain(cocok[1]);
    }
  });

  it("topik panjang tetap dipenggal, tidak dibiarkan utuh", () => {
    const judul =
      "fix: perbaiki pemrosesan berkas ekspor yang sebelumnya gagal ketika " +
      "nama kolom mengandung spasi dan karakter khusus";
    const hasil = learningFromCommits([commit(judul)]);
    expect(hasil).not.toBeNull();
    // Topiknya dipenggal (ada elipsis di dalam kutip)...
    expect(hasil!).toContain("…");
    // ...tapi total tetap dalam batas.
    expect(countReportLength(hasil!)).toBeLessThanOrEqual(DRAFT_MAX_LENGTH);
  });

  // Urutan bahan: commit TERAWAL dulu. Ini yang membuat narasi "mulai dari X,
  // lalu Y" masuk akal; urutan sebaliknya (default GitHub/GitLab) membuat
  // kalimat pertama menyebut pekerjaan terakhir hari itu.
  it("menyusun topik dari commit terlama dulu, bukan terbaru", () => {
    const hasil = learningFromCommits([
      // Sengaja diberi urutan terbaru-dulu seperti keluaran API git.
      commit("fix: perbaiki filter tanggal laporan", "2026-04-10T15:00:00.000Z"),
      commit("feat: tambah ekspor CSV", "2026-04-10T08:00:00.000Z"),
    ]);
    expect(hasil).not.toBeNull();
    // Kalimat topik memakai topik commit TERAWAL (08:00), yaitu ekspor CSV.
    const kalimatTopik = hasil!.split(/(?<=\\.)\\s+/)[0];
    expect(kalimatTopik).toMatch(/ekspor csv/i);
  });
});
