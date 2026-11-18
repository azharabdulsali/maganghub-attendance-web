import { describe, expect, it } from "vitest";

import {
  INTERVAL_OTOMATIS_MS,
  bolehJalanOtomatis,
  type KeadaanOtomatis,
} from "./landing-sheet-autoplay";

/** Keadaan "semua aman": tiga lembar, tidak ada yang menahan. */
const AMAN: KeadaanOtomatis = {
  jumlahLembar: 3,
  kurangiGerak: false,
  sudahDisentuh: false,
  sedangGeser: false,
  tabTersembunyi: false,
};

describe("bolehJalanOtomatis", () => {
  it("berjalan saat semua pagar terbuka", () => {
    expect(bolehJalanOtomatis(AMAN)).toBe(true);
  });

  it("tidak berjalan bila hanya ada satu lembar", () => {
    expect(bolehJalanOtomatis({ ...AMAN, jumlahLembar: 1 })).toBe(false);
  });

  it("tidak berjalan bila tidak ada lembar sama sekali", () => {
    expect(bolehJalanOtomatis({ ...AMAN, jumlahLembar: 0 })).toBe(false);
  });

  it("tidak berjalan saat pengguna meminta animasi dikurangi", () => {
    expect(bolehJalanOtomatis({ ...AMAN, kurangiGerak: true })).toBe(false);
  });

  it("tidak berjalan lagi setelah lembar disentuh", () => {
    expect(bolehJalanOtomatis({ ...AMAN, sudahDisentuh: true })).toBe(false);
  });

  it("tidak berjalan di tengah geseran", () => {
    expect(bolehJalanOtomatis({ ...AMAN, sedangGeser: true })).toBe(false);
  });

  it("tidak berjalan saat tab tidak terlihat", () => {
    expect(bolehJalanOtomatis({ ...AMAN, tabTersembunyi: true })).toBe(false);
  });

  it("satu pagar saja sudah cukup untuk menghentikan", () => {
    // Setiap pagar diuji sendiri-sendiri: kalau salah satu lupa diperiksa di
    // komponen, tes ini tetap hijau, jadi komponen WAJIB memakai fungsi ini
    // dan tidak menulis ulang syaratnya.
    const pagar: (keyof KeadaanOtomatis)[] = [
      "kurangiGerak",
      "sudahDisentuh",
      "sedangGeser",
      "tabTersembunyi",
    ];
    for (const nama of pagar) {
      expect(bolehJalanOtomatis({ ...AMAN, [nama]: true })).toBe(false);
    }
  });

  it("semua pagar tertutup bersamaan tetap berjalan", () => {
    expect(bolehJalanOtomatis({ ...AMAN })).toBe(true);
  });
});

describe("INTERVAL_OTOMATIS_MS", () => {
  it("tidak lebih cepat dari 5 detik", () => {
    // Di bawah 5 detik, teks berganti sebelum selesai dibaca.
    expect(INTERVAL_OTOMATIS_MS).toBeGreaterThanOrEqual(5000);
  });

  it("tidak lebih lambat dari 10 detik", () => {
    // Terlalu lambat membuat pengunjung tidak pernah melihat lembar kedua.
    expect(INTERVAL_OTOMATIS_MS).toBeLessThanOrEqual(10000);
  });
});
