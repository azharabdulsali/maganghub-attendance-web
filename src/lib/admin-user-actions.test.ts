// src/lib/admin-user-actions.test.ts: uji aturan murni aksi admin.
//
// Yang penting diuji: penjagaan (diri sendiri & admin lain ditolak), aturan
// perubahan PERAN, dan bentuk kata sandi sementara. Semuanya tak butuh DB.

import { describe, expect, it } from "vitest";

import {
  checkAdminTarget,
  checkRoleChange,
  describeActionDenial,
  describeRoleChangeDenial,
  generateTemporaryPassword,
  statusForDenial,
  statusForRoleChangeDenial,
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

describe("checkRoleChange", () => {
  const aktor = "admin-1";

  it("USER -> ADMIN diizinkan (promosi)", () => {
    expect(checkRoleChange(aktor, { id: "u-1", role: "USER" }, "ADMIN")).toBeNull();
  });

  it("menerima peran huruf kecil & spasi (dinormalkan)", () => {
    expect(checkRoleChange(aktor, { id: "u-1", role: "USER" }, " admin ")).toBeNull();
  });

  it("tidak boleh pada diri sendiri", () => {
    expect(checkRoleChange(aktor, { id: aktor, role: "ADMIN" }, "USER")).toBe("SELF");
  });

  it("menurunkan admin lain ditolak (cegah sistem terkunci)", () => {
    expect(checkRoleChange(aktor, { id: "admin-2", role: "ADMIN" }, "USER")).toBe("IS_ADMIN");
  });

  it("sasaran tidak ada / sudah dihapus = NOT_FOUND", () => {
    expect(checkRoleChange(aktor, null, "ADMIN")).toBe("NOT_FOUND");
  });

  it("peran tak dikenal = INVALID_ROLE", () => {
    expect(checkRoleChange(aktor, { id: "u-1", role: "USER" }, "SUPERADMIN")).toBe(
      "INVALID_ROLE",
    );
    expect(checkRoleChange(aktor, { id: "u-1", role: "USER" }, "")).toBe("INVALID_ROLE");
  });

  it("peran sama = NO_CHANGE (bukan ditulis ulang tanpa guna)", () => {
    expect(checkRoleChange(aktor, { id: "u-1", role: "USER" }, "USER")).toBe("NO_CHANGE");
  });

  // REGRESI: `checkRoleChange` sempat dibangun di atas `checkAdminTarget` apa
  // adanya. Aturan itu menolak SEMUA sasaran ber-peran ADMIN tanpa melihat
  // peran TUJUAN, sehingga promosi USER -> ADMIN ikut tertolak dan peran jadi
  // tak bisa dikelola sama sekali. Tes ini mengunci bahwa promosi tetap jalan.
  it("promosi tetap diizinkan meski sasaran nantinya admin", () => {
    expect(checkRoleChange(aktor, { id: "u-2", role: "USER" }, "ADMIN")).toBeNull();
  });
});

describe("pesan & status penolakan peran", () => {
  it("INVALID_ROLE -> 400, NO_CHANGE -> 409", () => {
    expect(statusForRoleChangeDenial("INVALID_ROLE")).toBe(400);
    expect(statusForRoleChangeDenial("NO_CHANGE")).toBe(409);
  });

  it("mewarisi status penolakan dasar", () => {
    expect(statusForRoleChangeDenial("SELF")).toBe(403);
    expect(statusForRoleChangeDenial("IS_ADMIN")).toBe(403);
    expect(statusForRoleChangeDenial("NOT_FOUND")).toBe(404);
  });

  it("setiap alasan punya pesan, dan pesan dasar tetap konsisten", () => {
    for (const d of ["INVALID_ROLE", "NO_CHANGE", "SELF", "IS_ADMIN", "NOT_FOUND"] as const) {
      expect(describeRoleChangeDenial(d).length).toBeGreaterThan(0);
    }
    expect(describeRoleChangeDenial("SELF")).toBe(describeActionDenial("SELF"));
    expect(describeRoleChangeDenial("NOT_FOUND")).toBe(describeActionDenial("NOT_FOUND"));
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
