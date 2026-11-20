// src/lib/work-schedule.test.ts: uji aturan MURNI jadwal kerja mingguan.
//
// Aturan di sini menentukan KAPAN server boleh menyentuh portal Monev bersama
// report-policy.ts. Kasus paling berbahaya adalah gagal-lunak: bila jadwal
// tidak tersedia, perilaku HARUS jatuh ke Senin–Jumat (perilaku lama), bukan
// "tanpa hari kerja" yang diam-diam mematikan seluruh otomasi. Tanpa tes ini,
// satu refactor kecil bisa membuat semua pengguna berhenti terkirim.

import { describe, it, expect } from "vitest";

import {
  DEFAULT_WORK_DAYS,
  describeWorkDays,
  isoWeekdayOf,
  isoWeekdayOfDate,
  isWorkDayOf,
  normalizeWorkDays,
  sameWorkDays,
  WORK_DAY_LABELS,
} from "./work-schedule";

describe("isoWeekdayOf (konversi getUTCDay → ISO)", () => {
  it("0 (Minggu) → 7, 1 (Senin) → 1, 6 (Sabtu) → 6", () => {
    expect(isoWeekdayOf(0)).toBe(7);
    expect(isoWeekdayOf(1)).toBe(1);
    expect(isoWeekdayOf(6)).toBe(6);
  });

  it("nilai di luar 0–6 → null (jangan menebak)", () => {
    expect(isoWeekdayOf(7)).toBeNull();
    expect(isoWeekdayOf(-1)).toBeNull();
    expect(isoWeekdayOf(1.5)).toBeNull();
    expect(isoWeekdayOf(NaN)).toBeNull();
  });
});

describe("isoWeekdayOfDate (tanggal polos → hari ISO)", () => {
  it("menghitung hari dengan benar tanpa zona waktu", () => {
    // 2026-09-19 Sabtu, 2026-09-20 Minggu, 2026-09-21 Senin.
    expect(isoWeekdayOfDate("2026-09-19")).toBe(6);
    expect(isoWeekdayOfDate("2026-09-20")).toBe(7);
    expect(isoWeekdayOfDate("2026-09-21")).toBe(1);
  });

  it("menerima 29 Februari tahun kabisat", () => {
    // 2028-02-29 adalah Selasa.
    expect(isoWeekdayOfDate("2028-02-29")).toBe(2);
  });

  it("bentuk tidak sah / tanggal fiktif → null, tidak melempar", () => {
    expect(isoWeekdayOfDate("bukan-tanggal")).toBeNull();
    expect(isoWeekdayOfDate("")).toBeNull();
    expect(isoWeekdayOfDate("2026-9-21")).toBeNull();
    expect(isoWeekdayOfDate("2026-02-30")).toBeNull();
  });
});

describe("normalizeWorkDays", () => {
  it("membuang nilai tidak sah, duplikat, lalu mengurutkan", () => {
    expect(normalizeWorkDays([6, 1, 1, 9, 0, 3])).toEqual([1, 3, 6]);
  });

  it("menerima apa pun tanpa melempar (boleh kosong)", () => {
    expect(normalizeWorkDays(["Senin" as unknown as number])).toEqual([]);
    expect(normalizeWorkDays([])).toEqual([]);
    expect(normalizeWorkDays([null as unknown as number])).toEqual([]);
  });
});

describe("isWorkDayOf", () => {
  it("default Senin–Jumat", () => {
    expect(DEFAULT_WORK_DAYS).toEqual([1, 2, 3, 4, 5]);
    expect(isWorkDayOf(1)).toBe(true);
    expect(isWorkDayOf(6)).toBe(false);
    expect(isWorkDayOf(7)).toBe(false);
  });

  it("jadwal khusus: Sabtu & Minggu jadi hari kerja", () => {
    const sabtuMinggu = [6, 7] as const;
    expect(isWorkDayOf(6, sabtuMinggu)).toBe(true);
    expect(isWorkDayOf(7, sabtuMinggu)).toBe(true);
    expect(isWorkDayOf(2, sabtuMinggu)).toBe(false);
  });

  it("PAGAR GAGAL-LUNAK: jadwal kosong jatuh ke default, bukan libur total", () => {
    // DB sesaat kosong/gagal tidak boleh membuat semua hari jadi libur —
    // itu mematikan manual, cron, dan dispatcher sekaligus.
    expect(isWorkDayOf(2, [])).toBe(true); // Selasa tetap hari kerja
    expect(isWorkDayOf(6, [])).toBe(false); // Sabtu tetap libur
  });
});

describe("sameWorkDays", () => {
  it("sama walau urutan & duplikatnya beda", () => {
    expect(sameWorkDays([1, 2, 3], [3, 1, 2])).toBe(true);
    expect(sameWorkDays([1, 1, 2], [2, 1])).toBe(true);
  });

  it("undefined = default Senin–Jumat", () => {
    expect(sameWorkDays(undefined, [1, 2, 3, 4, 5])).toBe(true);
    expect(sameWorkDays(undefined, [1, 2, 3, 4])).toBe(false);
  });

  it("beda isi → beda (dipakai guard 'belum disimpan' di form)", () => {
    expect(sameWorkDays([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(sameWorkDays([1, 2, 3], [1, 2])).toBe(false);
  });
});

describe("describeWorkDays (ringkasan manusia)", () => {
  it("Senin–Jumat untuk default", () => {
    expect(describeWorkDays([1, 2, 3, 4, 5])).toBe("Senin–Jumat");
    expect(describeWorkDays(undefined)).toBe("Senin–Jumat");
  });

  it("Setiap hari untuk 7 hari", () => {
    expect(describeWorkDays([7, 1, 2, 3, 4, 5, 6])).toBe("Setiap hari");
  });

  it("satu hari, dua hari berurutan, dan rentang dengan celah", () => {
    expect(describeWorkDays([6])).toBe("Sabtu");
    // Dua hari berurutan ditulis "A, B" (bukan "A–B" yang terkesan rentang).
    expect(describeWorkDays([6, 7])).toBe("Sabtu, Minggu");
    expect(describeWorkDays([1, 2, 3, 5])).toBe("Senin–Rabu, Jumat");
  });

  it("jadwal kosong jatuh ke default (konsisten dengan isWorkDayOf)", () => {
    expect(describeWorkDays([])).toBe("Senin–Jumat");
  });
});

describe("label hari", () => {
  it("lengkap untuk ketujuh hari", () => {
    expect(WORK_DAY_LABELS[1]).toBe("Senin");
    expect(WORK_DAY_LABELS[7]).toBe("Minggu");
  });
});
