import { describe, expect, it } from "vitest";

import {
  AMBANG_CEPAT_PX_PER_DETIK,
  AMBANG_GESER_PX,
  arahGantiLembar,
} from "./landing-sheet-gesture";

// Tanda: offsetX/velocityX negatif = ke KIRI. Geser ke kiri = lembar berikutnya.

describe("arahGantiLembar", () => {
  it("geser jauh ke kiri = lembar berikutnya", () => {
    expect(arahGantiLembar(-120, 0)).toBe(1);
  });

  it("geser jauh ke kanan = lembar sebelumnya", () => {
    expect(arahGantiLembar(120, 0)).toBe(-1);
  });

  it("geser kecil dan lambat = kembali ke tempat semula", () => {
    expect(arahGantiLembar(-20, 0)).toBe(0);
  });

  it("tidak bergeser sama sekali = tidak ada perubahan", () => {
    expect(arahGantiLembar(0, 0)).toBe(0);
  });

  it("kibasan pendek tapi cepat tetap dihitung", () => {
    // Jarak 20 px jauh di bawah ambang, tetapi kecepatannya tinggi.
    expect(arahGantiLembar(-20, -900)).toBe(1);
  });

  it("kibasan pendek ke kanan = lembar sebelumnya", () => {
    expect(arahGantiLembar(20, 900)).toBe(-1);
  });

  it("seretan lambat sejauh 40 px dikembalikan walau sudah dekat ambang", () => {
    expect(arahGantiLembar(-40, -100)).toBe(0);
  });

  it("tepat di ambang jarak sudah dihitung (batas inklusif)", () => {
    expect(arahGantiLembar(-AMBANG_GESER_PX, 0)).toBe(1);
  });

  it("tepat di bawah ambang jarak belum dihitung", () => {
    expect(arahGantiLembar(-(AMBANG_GESER_PX - 1), 0)).toBe(0);
  });

  it("tepat di ambang kecepatan sudah dihitung (batas inklusif)", () => {
    expect(arahGantiLembar(0, -AMBANG_CEPAT_PX_PER_DETIK)).toBe(1);
  });

  it("kecepatan menang saat arahnya berlawanan dengan jarak", () => {
    // Sudah terseret jauh ke kiri, tetapi dilepas dengan kibasan ke kanan:
    // yang diikuti adalah kibasan terakhir, bukan posisi sesaat.
    expect(arahGantiLembar(-200, 800)).toBe(-1);
  });

  it("jarak yang dipakai bila kecepatan di bawah ambang", () => {
    expect(arahGantiLembar(-200, 100)).toBe(1);
  });

  it("NaN tidak membuat lembar melompat", () => {
    expect(arahGantiLembar(Number.NaN, 0)).toBe(0);
    expect(arahGantiLembar(0, Number.NaN)).toBe(0);
  });

  it("Infinity tidak membuat lembar melompat", () => {
    expect(arahGantiLembar(Number.POSITIVE_INFINITY, 0)).toBe(0);
    expect(arahGantiLembar(0, Number.NEGATIVE_INFINITY)).toBe(0);
  });
});
