import { describe, expect, it } from "vitest";

import { TOAST_TONE_CLASS } from "./toast";
import { TONE_CLASS as BADGE_TONE_CLASS } from "./badge";
import type { Tone } from "@/lib/admin";

// Toast, Badge, dan Message memakai kosakata `Tone` yang sama. Kalau seseorang
// mengubah warna di salah satu peta tapi lupa yang lain, badge di halaman bisa
// beda warna dari toast untuk keadaan yang sama — bug yang sulit terlihat.
// Uji ini mengunci agar `good`/`bad`/`neutral` tetap konsisten lintas komponen.
describe("toast tone classes", () => {
  it("mendefinisikan warna untuk setiap nada", () => {
    expect(Object.keys(TOAST_TONE_CLASS).sort()).toEqual<Tone[]>(
      ["bad", "good", "neutral"].sort() as Tone[],
    );
  });

  it("nada 'good' memakai warna yang sama dengan badge", () => {
    expect(TOAST_TONE_CLASS.good).toBe(BADGE_TONE_CLASS.good);
  });
});
