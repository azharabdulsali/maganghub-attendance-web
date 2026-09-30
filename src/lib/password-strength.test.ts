// src/lib/password-strength.test.ts — uji indikator kekuatan kata sandi.
//
// Indikator ini hanya memberi umpan balik visual, tetapi kalau perkiraannya
// ngawur (mis. menyebut "password123" kuat) ia justru menyesatkan pengguna.
// Karena itu batas-batasnya dikunci lewat tes.

import { describe, it, expect } from "vitest";
import { hitungKekuatan } from "./password-strength";

describe("hitungKekuatan — indikator kekuatan kata sandi", () => {
  it("mengembalikan level 'kosong' untuk string kosong", () => {
    const s = hitungKekuatan("");
    expect(s.level).toBe("kosong");
    expect(s.skor).toBe(0);
    expect(s.saran).toBe("");
  });

  it("menilai kata sandi pendek sebagai lemah", () => {
    expect(hitungKekuatan("abc").level).toBe("lemah");
  });

  it("menolak menilai kata sandi umum sebagai kuat berapa pun panjangnya", () => {
    // 12 karakter — panjangnya "memadai", tetapi sering dipakai orang.
    expect(hitungKekuatan("password1234").level).toBe("lemah");
    expect(hitungKekuatan("qwertyuiopas").level).toBe("lemah");
  });

  it("menaikkan skor saat jenis karakter bertambah", () => {
    const hanyHurufKecil = hitungKekuatan("kucingtidur");
    const denganBesarAngkaSimbol = hitungKekuatan("Kucing-Tidur-72");
    expect(denganBesarAngkaSimbol.skor).toBeGreaterThan(hanyHurufKecil.skor);
  });

  it("menilai kata sandi panjang bercampur sebagai kuat", () => {
    expect(hitungKekuatan("Kucing-Tidur-72!").level).toBe("kuat");
  });

  it("memberi saran yang berguna pada level lemah", () => {
    expect(hitungKekuatan("abc").saran.length).toBeGreaterThan(0);
  });

  it("skor selalu berada di rentang 0–4", () => {
    for (const s of ["", "a", "abcdefgh", "abcdefgh1", "Abcdefgh1!", "x".repeat(300)]) {
      const skor = hitungKekuatan(s).skor;
      expect(skor).toBeGreaterThanOrEqual(0);
      expect(skor).toBeLessThanOrEqual(4);
    }
  });

  it("memaksa kata sandi umum tetap di skor rendah (<= 1)", () => {
    expect(hitungKekuatan("letmein12345").skor).toBeLessThanOrEqual(1);
  });
});
