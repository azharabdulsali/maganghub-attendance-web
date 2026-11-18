import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button";

// Umpan balik "ditekan" (`active:`) mudah hilang tanpa disadari: AGENTS.md
// mencatat `button.tsx` pernah tertimpa saat CLI shadcn dijalankan ulang, dan
// yang hilang justru kustomisasi proyek. Di layar sentuh tidak ada `hover:`,
// jadi bila `active:` hilang, tombol kembali tidak bereaksi sama sekali saat
// ditekan. Test ini mengunci keberadaannya.
describe("buttonVariants — umpan balik saat ditekan", () => {
  const varianBerbayang = [
    "default",
    "neutral",
    "danger",
    "success",
    "warning",
  ] as const;

  it.each(varianBerbayang)(
    "varian %s tenggelam ke bayangannya saat ditekan",
    (variant) => {
      const kelas = buttonVariants({ variant });
      expect(kelas).toContain("active:translate-x-boxShadowX");
      expect(kelas).toContain("active:translate-y-boxShadowY");
      expect(kelas).toContain("active:shadow-none");
    },
  );

  it("varian reverse kembali turun saat ditekan (keadaan istirahatnya tanpa bayangan)", () => {
    const kelas = buttonVariants({ variant: "reverse" });
    expect(kelas).toContain("active:translate-x-0");
    expect(kelas).toContain("active:translate-y-0");
    expect(kelas).toContain("active:shadow-none");
  });

  it("varian noShadow tetap memberi dorongan 1px saat ditekan", () => {
    expect(buttonVariants({ variant: "noShadow" })).toContain(
      "active:translate-y-px",
    );
  });
});
