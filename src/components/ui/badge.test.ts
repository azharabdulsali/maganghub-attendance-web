import { describe, expect, it } from "vitest";

import { toneForBadgeVariant } from "./badge";

// Pemetaan nada badge dipakai bersama oleh tabel riwayat & tabel audit admin.
// Bila salah, dua halaman bisa menampilkan warna berbeda untuk status yang sama
// — persis masalah yang ingin dihindari. Jadi dikunci di sini tanpa perlu DOM.
describe("toneForBadgeVariant", () => {
  it("sukses → good, gagal → bad", () => {
    expect(toneForBadgeVariant("success")).toBe("good");
    expect(toneForBadgeVariant("failure")).toBe("bad");
  });

  it("warning (duplikat/tak dikenal) → neutral, bukan good/bad", () => {
    expect(toneForBadgeVariant("warning")).toBe("neutral");
  });
});
