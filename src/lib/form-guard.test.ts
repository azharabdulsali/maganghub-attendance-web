import { describe, expect, it } from "vitest";

// form-guard.ts saat ini hanya mengekspor hook React yang isinya event listener
// bawaan browser. Logika yang bisa diuji di Node: sebuah FUNGSI penentu "apakah
// form dianggap kotor" — diekstrak agar aturan bisa dites tanpa DOM.
//
// Aturan: form dianggap KOTOR hanya bila ada minimal satu kolom yang isinya
// berbeda dari nilai awalnya (trim dulu — spasi di awal/akhir tidak dihitung
// perubahan bermakna, sama seperti trim() di server). Form kosong vs template
// kosong tidak dianggap kotor.
import { apakahKotor } from "./form-guard";

describe("apakahKotor", () => {
  it("bersih bila semua kolom sama dengan awal", () => {
    expect(apakahKotor({ a: "x", b: "y" }, { a: "x", b: "y" })).toBe(false);
  });

  it("bersih bila beda hanya spasi di awal/akhir", () => {
    expect(apakahKotor({ a: "x" }, { a: "  x  " })).toBe(false);
  });

  it("kotor bila satu kolom berubah", () => {
    expect(apakahKotor({ a: "x", b: "y" }, { a: "x", b: "z" })).toBe(true);
  });

  it("kotor bila kolom baru muncul (awalnya kosong)", () => {
    expect(apakahKotor({ a: "" }, { a: "teks baru" })).toBe(true);
  });

  it("bersih bila kosong vs kosong", () => {
    expect(apakahKotor({ a: "", b: "" }, { a: "", b: "" })).toBe(false);
  });

  it("kotor bila isi dikosongkan padahal awalnya terisi", () => {
    expect(apakahKotor({ a: "ada" }, { a: "" })).toBe(true);
  });

  it("spasi di tengah dihitung perubahan (bukan di-trim)", () => {
    expect(apakahKotor({ a: "dua kata" }, { a: "dua  kata" })).toBe(true);
  });
});
