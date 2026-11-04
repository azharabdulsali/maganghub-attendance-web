// src/lib/report-source.test.ts
//
// Fokus: mengunci URUTAN sumber isi laporan yang diputuskan pemilik:
//   commit hari itu -> template bertanggal -> template harian -> batal.
//
// Yang paling mudah salah dan paling mahal akibatnya: commit setengah jadi
// (sebagian kolom kosong) yang lolos ke portal. Portal menolak kolom kosong,
// dan laporan yang gagal kirim baru ketahuan di jam kirim.

import { describe, expect, it } from "vitest";

import {
  chooseReportContent,
  describeReportSource,
  type ReportContent,
} from "./report-source";

const commitDraf: ReportContent = {
  activity: "Memperbaiki validasi jalur repo dan menambah tes regresi.",
  learning: "Dari proses ini saya belajar bahwa tes harus bisa membuktikan kesalahan.",
  obstacles: "Tidak ada kendala berarti, pekerjaan berjalan lancar hari ini.",
};

const harian: ReportContent = {
  activity: "Aktivitas harian",
  learning: "Pembelajaran harian",
  obstacles: "Kendala harian",
};

const khusus = {
  date: "2026-04-10",
  activity: "Aktivitas khusus 10 April",
  learning: "Pembelajaran khusus 10 April",
  obstacles: "Kendala khusus 10 April",
};

describe("chooseReportContent: urutan sumber", () => {
  it("commit menang atas template bertanggal DAN harian", () => {
    const hasil = chooseReportContent("2026-04-10", commitDraf, harian, [khusus]);
    expect(hasil.source).toBe("COMMITS");
    expect(hasil.content?.activity).toBe(commitDraf.activity);
  });

  it("tanpa commit → template bertanggal untuk tanggal itu", () => {
    const hasil = chooseReportContent("2026-04-10", null, harian, [khusus]);
    expect(hasil.source).toBe("DATED");
    expect(hasil.content?.activity).toBe("Aktivitas khusus 10 April");
  });

  it("tanpa commit & tanpa template bertanggal → template harian", () => {
    const hasil = chooseReportContent("2026-04-11", null, harian, [khusus]);
    expect(hasil.source).toBe("DAILY");
    expect(hasil.content?.activity).toBe("Aktivitas harian");
  });

  it("tidak ada bahan sama sekali → batal, BUKAN laporan kosong", () => {
    const hasil = chooseReportContent("2026-04-11", null, null, []);
    expect(hasil.source).toBe("NONE");
    expect(hasil.content).toBeNull();
  });
});

describe("chooseReportContent: commit yang tidak layak", () => {
  it("commit undefined (tidak ada commit) → jatuh ke template", () => {
    const hasil = chooseReportContent("2026-04-10", undefined, harian, [khusus]);
    expect(hasil.source).toBe("DATED");
  });

  it("commit setengah jadi (satu kolom kosong) TIDAK dipakai", () => {
    // Ini kejadian nyata bila penyusun gagal di tengah: sebagian kolom terisi.
    const separuh = { ...commitDraf, learning: "   " };
    const hasil = chooseReportContent("2026-04-11", separuh, harian, []);

    expect(hasil.source).toBe("DAILY");
    expect(hasil.content?.learning).toBe("Pembelajaran harian");
  });

  it("commit setengah jadi TANPA template → batal, tidak dikirim", () => {
    const separuh = { ...commitDraf, obstacles: "" };
    const hasil = chooseReportContent("2026-04-11", separuh, null, []);
    expect(hasil.source).toBe("NONE");
  });
});

describe("chooseReportContent: ketahanan", () => {
  it("template bertanggal setengah jadi dilewati ke harian", () => {
    const rusak = { ...khusus, learning: "" };
    const hasil = chooseReportContent("2026-04-10", null, harian, [rusak]);
    expect(hasil.source).toBe("DAILY");
  });

  it("TIDAK tertukar antar bulan walau tanggal (hari) sama", () => {
    const hasil = chooseReportContent("2026-05-10", null, harian, [khusus]);
    expect(hasil.source).toBe("DAILY");
  });

  it("mengembalikan SALINAN, bukan objek asli", () => {
    const hasil = chooseReportContent("2026-04-10", null, harian, [khusus]);
    hasil.content!.activity = "diubah";
    expect(khusus.activity).toBe("Aktivitas khusus 10 April");
  });
});

describe("describeReportSource", () => {
  it("memberi label Indonesia untuk tiap sumber", () => {
    expect(describeReportSource("COMMITS")).toContain("Commit");
    expect(describeReportSource("DATED")).toContain("tanggal");
    expect(describeReportSource("DAILY")).toContain("harian");
    expect(describeReportSource("NONE")).toContain("Tidak ada");
  });
});
