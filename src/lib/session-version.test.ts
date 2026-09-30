import { describe, expect, it } from "vitest";

import { sesiMasihSah, versiSesiDariKlien } from "./session-version";

describe("sesiMasihSah", () => {
  it("token dengan versi sama dengan DB tetap sah", () => {
    expect(sesiMasihSah(0, 0)).toBe(true);
    expect(sesiMasihSah(3, 3)).toBe(true);
  });

  it("versi berbeda → sesi dicabut (ganti sandi / keluar perangkat lain)", () => {
    expect(sesiMasihSah(0, 1)).toBe(false);
    expect(sesiMasihSah(5, 4)).toBe(false);
  });

  it("token tanpa versi (sesi lama sebelum fitur ini) dianggap tidak sah", () => {
    // Sesi yang diterbitkan sebelum kolom ini ada tidak punya klaim versi.
    // Menolaknya memaksa login ulang sekali, pilihan yang aman.
    expect(sesiMasihSah(undefined, 0)).toBe(false);
    expect(sesiMasihSah(null, 0)).toBe(false);
  });

  it("nilai non-angka dari token ditolak", () => {
    expect(sesiMasihSah("0", 0)).toBe(false);
    expect(sesiMasihSah({}, 0)).toBe(false);
  });
});

describe("versiSesiDariKlien", () => {
  it("menerima angka bulat non-negatif", () => {
    expect(versiSesiDariKlien({ sessionVersion: 0 })).toBe(0);
    expect(versiSesiDariKlien({ sessionVersion: 7 })).toBe(7);
  });

  it("menolak nilai non-angka / pecahan / negatif", () => {
    expect(versiSesiDariKlien({ sessionVersion: "5" })).toBeNull();
    expect(versiSesiDariKlien({ sessionVersion: 1.5 })).toBeNull();
    expect(versiSesiDariKlien({ sessionVersion: -1 })).toBeNull();
    expect(versiSesiDariKlien({ sessionVersion: Number.NaN })).toBeNull();
  });

  it("menolak bentuk yang tidak terduga tanpa melempar", () => {
    expect(versiSesiDariKlien(null)).toBeNull();
    expect(versiSesiDariKlien(undefined)).toBeNull();
    expect(versiSesiDariKlien("apa saja")).toBeNull();
    expect(versiSesiDariKlien({})).toBeNull();
  });
});
