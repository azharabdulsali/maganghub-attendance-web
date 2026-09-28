// src/lib/validate.test.ts — uji skema kredensial & template laporan.
//
// Ini bukan test "formalitas": aturan di sini menentukan data apa yang masuk
// ke database. Terutama normalisasi email — kalau gagal, kredensial bisa
// tersimpan dengan huruf besar/kecil berbeda dan tidak cocok saat login.

import { describe, it, expect } from "vitest";
import {
  credentialsSchema,
  reportTemplatesSchema,
  monevTokenSchema,
} from "./validate";

describe("credentialsSchema — email Monev", () => {
  it("menerima email yang wajar", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(true);
  });

  it("menormalkan email ke huruf kecil", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "Budi.Santoso@Contoh.COM",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.emailMonev).toBe("budi.santoso@contoh.com");
  });

  it("memangkas spasi di awal/akhir email", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "  budi@contoh.com  ",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.emailMonev).toBe("budi@contoh.com");
  });

  it("menolak email tanpa @", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "bukan-email",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(false);
  });

  it("menolak email kosong", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "",
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(false);
  });

  it("menolak email yang terlalu panjang (>200)", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: `${"a".repeat(200)}@contoh.com`,
      passwordMonev: "rahasia",
    });
    expect(r.success).toBe(false);
  });
});

describe("credentialsSchema — password Monev", () => {
  it("menerima password 1 karakter (tidak ada aturan minimal)", () => {
    // Password Monev milik portal orang lain — kita tidak berhak memaksa
    // aturan panjang. Yang salah di sini akan ditolak saat login ke portal.
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "x",
    });
    expect(r.success).toBe(true);
  });

  it("TIDAK memangkas spasi password (spasi bisa sah)", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: " ada spasi ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.passwordMonev).toBe(" ada spasi ");
  });

  it("menerima password dengan karakter khusus & unicode", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "P@ssw0rd!#äöü🔐",
    });
    expect(r.success).toBe(true);
  });

  it("menolak password kosong", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "",
    });
    expect(r.success).toBe(false);
  });

  it("menolak password >200 karakter", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("menolak password yang bukan string (mis. angka)", () => {
    const r = credentialsSchema.safeParse({
      emailMonev: "budi@contoh.com",
      passwordMonev: 12345,
    });
    expect(r.success).toBe(false);
  });
});

/** Teks valid: 100 karakter setelah dipangkas (batas portal Maganghub). */
const VALID100 = "a".repeat(100);

/** Template valid dengan ketiga field memenuhi syarat. */
const TEMPLATE_OK = {
  activity: VALID100,
  learning: VALID100,
  obstacles: VALID100,
};

describe("reportTemplatesSchema — template laporan", () => {
  it("menerima tiga field yang semuanya >= 100 karakter", () => {
    expect(reportTemplatesSchema.safeParse(TEMPLATE_OK).success).toBe(true);
  });

  it("menerima teks panjang dengan spasi nyata di dalamnya", () => {
    const teks =
      "Hari ini saya mengerjakan modul absensi dan menambahkan validasi " +
      "panjang teks agar sesuai dengan aturan portal Maganghub yang berlaku.";
    expect(teks.trim().length).toBeGreaterThanOrEqual(100);
    const r = reportTemplatesSchema.safeParse({
      activity: teks,
      learning: teks,
      obstacles: teks,
    });
    expect(r.success).toBe(true);
  });

  it("menolak kalau activity kurang dari 100 karakter", () => {
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      activity: "a".repeat(99),
    });
    expect(r.success).toBe(false);
  });

  it("menolak kalau learning kurang dari 100 karakter", () => {
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      learning: "pendek",
    });
    expect(r.success).toBe(false);
  });

  it("menolak kalau obstacles kurang dari 100 karakter", () => {
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      obstacles: "",
    });
    expect(r.success).toBe(false);
  });

  it("menolak teks yang terlihat cukup tetapi hanya berisi spasi", () => {
    // Jebakan nyata: pengguna menekan spasi 100 kali, atau menempel teks yang
    // seluruhnya spasi. Panjang mentah 100, panjang bersih 0.
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      activity: " ".repeat(100),
    });
    expect(r.success).toBe(false);
  });

  it("menerima teks 100 karakter yang diapit spasi", () => {
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      activity: `   ${VALID100}   `,
    });
    expect(r.success).toBe(true);
  });

  it("menolak kalau ada field yang hilang sama sekali", () => {
    expect(
      reportTemplatesSchema.safeParse({ activity: VALID100, learning: VALID100 })
        .success,
    ).toBe(false);
  });

  it("menolak kalau field bukan string", () => {
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      activity: 1234567890,
    });
    expect(r.success).toBe(false);
  });

  it("melaporkan error pada field yang benar saja", () => {
    // Pesan error harus bisa dipetakan ke kotak input yang tepat — kalau
    // semuanya masuk ke "activity", pengguna bingung mencarinya.
    const r = reportTemplatesSchema.safeParse({
      activity: VALID100,
      learning: "pendek",
      obstacles: VALID100,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const fields = r.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("learning");
      expect(fields).not.toContain("activity");
      expect(fields).not.toContain("obstacles");
    }
  });

  it("menyebut kekurangan karakter pada pesan error", () => {
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      obstacles: "a".repeat(50),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain("50 karakter");
    }
  });

  it("menolak teks di atas 5000 karakter (batas atas portal)", () => {
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      activity: "a".repeat(5001),
    });
    expect(r.success).toBe(false);
  });

  it("menerima tepat 5000 karakter (batas atas)", () => {
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      activity: "a".repeat(5000),
    });
    expect(r.success).toBe(true);
  });

  it("tidak memangkas isi teks — hanya menilai panjangnya", () => {
    // Template disimpan apa adanya (kecuali diseragamkan terpisah lewat
    // normalizeReportText). Skema ini tidak boleh diam-diam mengubah tulisan.
    const r = reportTemplatesSchema.safeParse({
      ...TEMPLATE_OK,
      activity: `  ${VALID100}  `,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.activity).toBe(`  ${VALID100}  `);
  });
});

describe("monevTokenSchema — bentuk JWT", () => {
  it("menerima JWT tiga bagian", () => {
    const r = monevTokenSchema.safeParse("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig");
    expect(r.success).toBe(true);
  });

  it("memangkas spasi di tepi (tempelan DevTools sering ada spasi)", () => {
    const r = monevTokenSchema.safeParse("  eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig");
  });

  it("menolak string tanpa titik", () => {
    expect(monevTokenSchema.safeParse("bukan-token-sama-sekali-panjang").success).toBe(
      false,
    );
  });

  it("menolak JWT dengan bagian kosong", () => {
    expect(monevTokenSchema.safeParse("aaa..ccc").success).toBe(false);
  });

  it("menolak token terlalu pendek", () => {
    expect(monevTokenSchema.safeParse("a.b.c").success).toBe(false);
  });
});

