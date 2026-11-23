import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bacaToken,
  keRgb,
  luminans,
  punyaAlpha,
  rasioKontras,
} from "./color-contrast";

// Tes ini membaca `src/app/globals.css` SUNGGUHAN, bukan nilai yang disalin ke
// sini. Kalau suatu saat ada yang mengubah token menjadi terlalu pucat, tes
// gagal — itulah gunanya. Menyalin nilai ke dalam tes akan membuat tes tetap
// hijau walau CSS-nya berubah, alias tidak menjaga apa pun.

const css = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

/** Ambil token, gagal keras bila tidak ada (jangan lewati pemeriksaan diam-diam). */
function token(nama: string) {
  const t = bacaToken(css, nama);
  if (!t) throw new Error(`Token --${nama} tidak ditemukan di globals.css`);
  return t;
}

describe("konversi warna", () => {
  it("hitam & putih murni", () => {
    expect(keRgb("oklch(0% 0 0)")).toEqual({ r: 0, g: 0, b: 0 });
    expect(keRgb("oklch(100% 0 0)")).toEqual({ r: 255, g: 255, b: 255 });
    expect(keRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(keRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("hsl merah penuh", () => {
    expect(keRgb("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("luminans hitam 0 dan putih 1", () => {
    expect(luminans({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(luminans({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it("kontras hitam-putih = 21", () => {
    expect(rasioKontras("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("kontras warna sama = 1", () => {
    expect(rasioKontras("#123456", "#123456")).toBeCloseTo(1, 5);
  });

  it("urutan argumen tidak memengaruhi hasil", () => {
    expect(rasioKontras("#000000", "#ffffff")).toBeCloseTo(
      rasioKontras("#ffffff", "#000000"),
      5,
    );
  });

  it("bentuk warna tak dikenal melempar galat", () => {
    expect(() => keRgb("var(--apa-saja)")).toThrow(/tidak dikenali/);
  });
});

describe("bacaToken", () => {
  it("membaca pasangan light-dark", () => {
    const t = bacaToken(":root { --contoh: light-dark(#000000, #ffffff); }", "contoh");
    expect(t).toEqual({ terang: "#000000", gelap: "#ffffff" });
  });

  it("token tanpa light-dark berlaku di kedua mode", () => {
    const t = bacaToken(":root { --contoh: #123456; }", "contoh");
    expect(t).toEqual({ terang: "#123456", gelap: "#123456" });
  });

  it("mengembalikan null bila token tidak ada", () => {
    expect(bacaToken(":root { --lain: #000; }", "contoh")).toBeNull();
  });

  it("mengenali alpha", () => {
    expect(punyaAlpha("oklch(1 0 0 / 35%)")).toBe(true);
    expect(punyaAlpha("oklch(1 0 0)")).toBe(false);
  });
});

// Pasangan yang BENAR-BENAR dipakai di komponen. Ambang 4.5:1 = teks normal
// (WCAG 2.2 AA, 1.4.3). Semua teks di aplikasi ini berukuran normal/kecil,
// jadi ambang 3:1 untuk teks besar tidak dipakai.
const PASANGAN: Array<[string, string, string]> = [
  ["foreground", "background", "teks utama di atas latar halaman"],
  ["foreground", "secondary-background", "teks di kanvas (body/sidebar/input)"],
  ["foreground", "card", "teks di dalam kartu"],
  ["foreground", "popover", "teks di atas dialog/popover/toast"],
  ["muted-foreground", "background", "teks bantuan di atas latar halaman"],
  ["muted-foreground", "secondary-background", "teks bantuan di kanvas"],
  ["muted-foreground", "card", "teks bantuan di dalam kartu"],
  ["muted-foreground", "popover", "teks bantuan di atas dialog"],
  ["main-foreground", "main", "teks di atas tombol utama (aksen biru)"],
  ["success-foreground", "success", "teks di atas tombol sukses"],
  ["destructive-foreground", "destructive", "teks di atas tombol bahaya"],
  ["warning-foreground", "warning", "teks di atas spanduk peringatan"],
];

describe.each(["terang", "gelap"] as const)("kontras token mode %s", (mode) => {
  for (const [fg, bg, keterangan] of PASANGAN) {
    it(`${keterangan} (--${fg} di atas --${bg}) ≥ 4.5:1`, () => {
      const warnaFg = token(fg)[mode];
      const warnaBg = token(bg)[mode];
      // Token ber-alpha tidak bisa dihitung tanpa tahu latar di belakangnya;
      // lewati dengan sengaja, bukan karena lupa.
      if (punyaAlpha(warnaFg) || punyaAlpha(warnaBg)) return;
      const rasio = rasioKontras(warnaFg, warnaBg);
      expect(
        rasio,
        `--${fg} (${warnaFg}) di atas --${bg} (${warnaBg}) hanya ${rasio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
