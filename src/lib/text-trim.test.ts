// src/lib/text-trim.test.ts: mengunci janji modul pemotong teks.
//
// Yang dijaga BUKAN "hasilnya kira-kira pendek", melainkan tiga jaminan yang
// dipakai pemanggil untuk memenuhi batas 200 karakter portal:
//   1. hasil tidak pernah melebihi `max` (satu karakter lebih = ditolak),
//   2. tidak ada kata yang terpotong separuh,
//   3. teks yang sudah pendek tidak diubah.

import { describe, expect, it } from "vitest";

import { trimToChars } from "./text-trim";

const KALIMAT =
  "Saya memperbaiki filter tanggal laporan agar rentang awal dan akhir dihitung " +
  "ulang setiap kali pengguna mengganti bulan yang sedang dilihat, termasuk saat " +
  "berpindah dari bulan dengan tiga puluh satu hari ke bulan dengan dua puluh " +
  "delapan hari.";

describe("trimToChars", () => {
  it("mengembalikan teks apa adanya bila sudah muat", () => {
    expect(trimToChars("halo dunia", 100)).toBe("halo dunia");
  });

  it("merapikan spasi berlebih dan pemangkasan tepi", () => {
    expect(trimToChars("  halo    dunia  ", 100)).toBe("halo dunia");
  });

  it.each([1, 5, 10, 20, 50, 100, 199, 200])(
    "tidak pernah melebihi max=%i",
    (max) => {
      expect(trimToChars(KALIMAT, max).length).toBeLessThanOrEqual(max);
    },
  );

  it("tidak memotong kata di tengah", () => {
    const hasil = trimToChars(KALIMAT, 40);
    // Kata terakhir sebelum tanda baca harus kata utuh dari teks asli.
    const tanpaPenutup = hasil.replace(/[.!?]$/, "").trim();
    const kataTerakhir = tanpaPenutup.split(" ").pop()!;
    expect(KALIMAT).toContain(kataTerakhir);
    // Bukan penggalan: karakter sesudahnya di teks asli bukan huruf.
    const idx = KALIMAT.indexOf(kataTerakhir);
    const sesudah = KALIMAT[idx + kataTerakhir.length] ?? " ";
    expect(sesudah).not.toMatch(/[a-z]/i);
  });

  it("mengutamakan akhir kalimat bila ada di separuh terakhir", () => {
    const hasil = trimToChars(KALIMAT, 140);
    // Berakhir dengan titik, bukan elipsis menggantung.
    expect(hasil.endsWith(".")).toBe(true);
    expect(hasil.length).toBeLessThanOrEqual(140);
  });

  it("memotong paksa kata yang lebih panjang dari max, tetap <= max", () => {
    const url = "https://contoh.test/" + "a".repeat(300);
    const hasil = trimToChars(url, 20);
    expect(hasil.length).toBeLessThanOrEqual(20);
    expect(hasil.endsWith(".")).toBe(true);
  });

  it("max <= 0 menghasilkan string kosong", () => {
    expect(trimToChars("apa pun", 0)).toBe("");
    expect(trimToChars("apa pun", -5)).toBe("");
  });

  it("murni: masukan sama → keluaran sama", () => {
    expect(trimToChars(KALIMAT, 50)).toBe(trimToChars(KALIMAT, 50));
  });

  // ---------------------------------------------------------------------
  // Batas bawah (`min`)
  // ---------------------------------------------------------------------
  // Pemotongan "rapi" bisa mendarat SANGAT jauh di bawah `max`: kalau teks
  // dibuka kalimat pendek lalu satu kata sangat panjang, titik akhir kalimat
  // ada di posisi 3 dan hasilnya cuma "Ok." — 3 karakter. Untuk draf laporan
  // itu bencana: `checkReportField` menolak (< 100), kolom jadi kosong.
  describe("batas bawah `min`", () => {
    it("tanpa `min`, potongan rapi boleh sangat pendek (perilaku lama)", () => {
      const teks = "Ok. " + "x".repeat(300);
      // Ini yang HARUS dihindari pemanggil draf; dibuktikan agar jelas.
      expect(trimToChars(teks, 200).length).toBeLessThan(10);
    });

    it("dengan `min`, hasil tidak jatuh di bawah batas", () => {
      const teks = "Ok. " + "x".repeat(300);
      const hasil = trimToChars(teks, 200, 120);
      expect(hasil.length).toBeGreaterThanOrEqual(120);
      expect(hasil.length).toBeLessThanOrEqual(200);
    });

    it("tetap <= max walau `min` dipaksa", () => {
      for (const max of [20, 50, 100, 200, 200]) {
        const teks = "Ya. " + "kata ".repeat(100);
        const hasil = trimToChars(teks, max, Math.floor(max / 2));
        expect(hasil.length).toBeLessThanOrEqual(max);
      }
    });

    it("tidak mengubah hasil bila potongan rapi sudah cukup panjang", () => {
      // `min` rendah: hasil harus identik dengan pemanggilan tanpa `min`.
      expect(trimToChars(KALIMAT, 140, 10)).toBe(trimToChars(KALIMAT, 140));
    });

    it("menyerahkan potongan rapi yang sedikit di bawah min ke titik lebih jauh", () => {
      // Titik di ~posisi 100 lalu kata-kata panjang: potongan rapi < min,
      // jadi harus memakai jendela penuh.
      const teks = "a".repeat(50) + ". " + "c".repeat(200);
      const hasil = trimToChars(teks, 200, 120);
      expect(hasil.length).toBeGreaterThanOrEqual(120);
      expect(hasil.length).toBeLessThanOrEqual(200);
    });

    it("min lebih besar dari max: tetap menyerah pada max, bukan melebihi", () => {
      // Kasus salah konfigurasi. Jaminan "tidak pernah > max" harus menang.
      const hasil = trimToChars("kata ".repeat(100), 50, 500);
      expect(hasil.length).toBeLessThanOrEqual(50);
    });

    it("min = 0 (default) tidak mengubah perilaku apa pun", () => {
      expect(trimToChars(KALIMAT, 140, 0)).toBe(trimToChars(KALIMAT, 140));
    });
  });
});