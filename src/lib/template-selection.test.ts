// src/lib/template-selection.test.ts
//
// Fokus: memastikan template bertanggal MENANG hanya untuk tanggalnya sendiri,
// dan tidak "bocor" ke tanggal lain. Kasus tahun/bulan berbeda disertakan karena
// itulah yang paling mudah salah kalau perbandingan tanggal tidak persis.

import { describe, expect, it } from "vitest";

import { chooseTemplate, describeTemplateSource } from "./template-selection";

const harian = {
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

describe("chooseTemplate", () => {
  it("memakai template bertanggal bila tanggalnya sama persis", () => {
    const hasil = chooseTemplate("2026-04-10", harian, [khusus]);
    expect(hasil.source).toBe("DATED");
    expect(hasil.template?.activity).toBe("Aktivitas khusus 10 April");
  });

  it("jatuh ke template harian bila tanggal tidak punya template khusus", () => {
    const hasil = chooseTemplate("2026-04-11", harian, [khusus]);
    expect(hasil.source).toBe("DAILY");
    expect(hasil.template?.activity).toBe("Aktivitas harian");
  });

  it("TIDAK tertukar antar bulan walau tanggal (hari) sama", () => {
    // Hari "10" sama, tapi bulan berbeda → harus pakai template harian.
    const hasil = chooseTemplate("2026-05-10", harian, [khusus]);
    expect(hasil.source).toBe("DAILY");
  });

  it("TIDAK tertukar antar tahun walau tanggal & bulan sama", () => {
    const hasil = chooseTemplate("2027-04-10", harian, [khusus]);
    expect(hasil.source).toBe("DAILY");
  });

  it("harian null + tidak ada yang cocok → NONE (pemanggil batalkan)", () => {
    const hasil = chooseTemplate("2026-04-11", null, [khusus]);
    expect(hasil.source).toBe("NONE");
    expect(hasil.template).toBeNull();
  });

  it("harian null TAPI ada yang cocok → tetap DATED (tidak butuh harian)", () => {
    const hasil = chooseTemplate("2026-04-10", null, [khusus]);
    expect(hasil.source).toBe("DATED");
    expect(hasil.template?.obstacles).toBe("Kendala khusus 10 April");
  });

  it("daftar bertanggal kosong + harian ada → DAILY", () => {
    const hasil = chooseTemplate("2026-04-10", harian, []);
    expect(hasil.source).toBe("DAILY");
  });

  it("memilih tanggal yang tepat di antara beberapa baris bertanggal", () => {
    const lain = { ...khusus, date: "2026-04-20", activity: "Aktivitas 20 April" };
    const hasil = chooseTemplate("2026-04-20", harian, [khusus, lain]);
    expect(hasil.template?.activity).toBe("Aktivitas 20 April");
  });

  it("mengembalikan SALINAN, bukan objek asli (tidak bisa termutasi dari luar)", () => {
    const hasil = chooseTemplate("2026-04-10", harian, [khusus]);
    hasil.template!.activity = "diubah";
    expect(khusus.activity).toBe("Aktivitas khusus 10 April");
  });
});

describe("describeTemplateSource", () => {
  it("memberi label Indonesia untuk tiap sumber", () => {
    expect(describeTemplateSource("DATED")).toContain("tanggal");
    expect(describeTemplateSource("DAILY")).toContain("harian");
    expect(describeTemplateSource("NONE")).toContain("Tidak ada");
  });
});
