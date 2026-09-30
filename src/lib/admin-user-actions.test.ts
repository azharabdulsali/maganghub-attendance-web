// src/lib/admin-user-actions.test.ts: uji aturan murni aksi admin.
//
// Yang penting diuji: penjagaan (diri sendiri & admin lain ditolak) dan bentuk
// kata sandi sementara. Keduanya tak butuh DB, jadi bisa diuji cepat.

import { describe, expect, it } from "vitest";

import {
  checkAdminTarget,
  describeActionDenial,
  generateTemporaryPassword,
  statusForDenial,
} from "./admin-user-actions";

describe("checkAdminTarget", () => {
  it("mengizinkan aksi pada pengguna biasa lain", () => {
    expect(
      checkAdminTarget("admin-1", { id: "user-1", role: "USER" }),
    ).toBeNull();
  });

  it("menolak aksi pada diri sendiri", () => {
    expect(
      checkAdminTarget("admin-1", { id: "admin-1", role: "ADMIN" }),
    ).toBe("SELF");
  });

  it("menolak aksi pada admin lain", () => {
    expect(
      checkAdminTarget("admin-1", { id: "admin-2", role: "ADMIN" }),
    ).toBe("IS_ADMIN");
  });

  it("peran tak peka huruf besar-kecil", () => {
    expect(
      checkAdminTarget("admin-1", { id: "admin-2", role: "admin" }),
    ).toBe("IS_ADMIN");
  });

  it("menolak bila sasaran tidak ada", () => {
    expect(checkAdminTarget("admin-1", null)).toBe("NOT_FOUND");
    expect(checkAdminTarget("admin-1", undefined)).toBe("NOT_FOUND");
  });

  it("diri sendiri menang atas cek admin (pesan lebih tepat)", () => {
    // Admin yang menyasar dirinya sendiri harus dapat alasan SELF, bukan IS_ADMIN.
    expect(
      checkAdminTarget("admin-1", { id: "admin-1", role: "ADMIN" }),
    ).toBe("SELF");
  });
});

describe("pesan & status penolakan", () => {
  it("memetakan tiap alasan ke pesan non-kosong", () => {
    for (const d of ["SELF", "IS_ADMIN", "NOT_FOUND"] as const) {
      expect(describeActionDenial(d).length).toBeGreaterThan(0);
    }
  });

  it("not found → 404, sisanya 403", () => {
    expect(statusForDenial("NOT_FOUND")).toBe(404);
    expect(statusForDenial("SELF")).toBe(403);
    expect(statusForDenial("IS_ADMIN")).toBe(403);
  });
});

describe("generateTemporaryPassword", () => {
  it("panjangnya 16", () => {
    expect(generateTemporaryPassword().length).toBe(16);
  });

  it("selalu memuat huruf besar, kecil, angka, dan simbol", () => {
    for (let i = 0; i < 200; i++) {
      const s = generateTemporaryPassword();
      expect(s).toMatch(/[A-Z]/);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[0-9]/);
      expect(s).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("tidak memakai karakter mudah tertukar (0/O/1/l/I)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTemporaryPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it("deterministik bila sumber acaknya disuntik", () => {
    const a = generateTemporaryPassword(() => 0);
    const b = generateTemporaryPassword(() => 0);
    expect(a).toBe(b);
  });

  it("hasil berbeda antar pemanggilan (nyata acak)", () => {
    const unik = new Set(
      Array.from({ length: 50 }, () => generateTemporaryPassword()),
    );
    expect(unik.size).toBe(50);
  });
});
