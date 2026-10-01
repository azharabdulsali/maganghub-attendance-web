// src/lib/jam-dinding.test.ts: uji format jam dinding WIB.
//
// Format waktu gampang salah secara senyap: salah padding, jam 24:00 di tengah
// malam, atau zona server (UTC) bocor ke tampilan. Karena itu batas-batasnya
// dikunci lewat tes dengan waktu yang di-pin eksplisit (tanpa bergantung jam
// mesin yang menjalankan tes).

import { describe, it, expect } from "vitest";
import { LABEL_ZONA, ZONA_WIB, formatJamWib } from "./jam-dinding";

describe("formatJamWib, format jam dinding WIB", () => {
  it("memakai zona WIB yang terkunci, bukan zona mesin", () => {
    expect(ZONA_WIB).toBe("Asia/Jakarta");
    expect(LABEL_ZONA).toBe("WIB");
  });

  it("mengubah waktu UTC ke WIB (+7)", () => {
    // 2026-09-29T07:32:07Z → WIB 14:32:07.
    const { jam } = formatJamWib(new Date("2026-09-29T07:32:07.000Z"));
    expect(jam).toBe("14:32:07");
  });

  it("memberi tanggal singkat berbahasa Indonesia", () => {
    // 29 Sep 2026 adalah hari Selasa.
    const { tanggal } = formatJamWib(new Date("2026-09-29T07:32:07.000Z"));
    expect(tanggal).toBe("Sel, 29 Sep");
  });

  it("menampilkan tengah malam sebagai 00:00:00, bukan 24:00:00", () => {
    // 17:00:00Z → WIB 00:00:00 (hari berikutnya).
    const { jam } = formatJamWib(new Date("2026-09-29T17:00:00.000Z"));
    expect(jam).toBe("00:00:00");
  });

  it("selalu berformat HH:MM:SS dua digit (padding)", () => {
    const { jam } = formatJamWib(new Date("2026-09-29T01:02:03.000Z"));
    expect(jam).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(jam).toBe("08:02:03");
  });

  it("menggeser tanggal saat WIB melewati batas hari", () => {
    // 29 Sep 18:30Z → WIB 30 Sep 01:30.
    const { tanggal, jam } = formatJamWib(new Date("2026-09-29T18:30:00.000Z"));
    expect(jam).toBe("01:30:00");
    expect(tanggal).toBe("Rab, 30 Sep");
  });
});
