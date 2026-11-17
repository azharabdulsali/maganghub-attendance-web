import { describe, expect, it } from "vitest";

import { effectiveRoleForEmail, hasPassword } from "./auth-accounts";

describe("hasPassword", () => {
  it("null/kosong/tanpa baris berarti tidak punya kata sandi", () => {
    expect(hasPassword(null)).toBe(false);
    expect(hasPassword(undefined)).toBe(false);
    expect(hasPassword({ passwordHash: null })).toBe(false);
    expect(hasPassword({ passwordHash: "" })).toBe(false);
    expect(hasPassword({})).toBe(false);
  });

  it("hash bcrypt yang sah berarti punya kata sandi", () => {
    expect(hasPassword({ passwordHash: "$2b$12$contoh" })).toBe(true);
  });
});

describe("effectiveRoleForEmail", () => {
  const admin = (email: string) => email === "admin@contoh.com";

  it("email ADMIN_EMAIL selalu menjadi ADMIN, walau peran lama USER", () => {
    expect(effectiveRoleForEmail("admin@contoh.com", admin, "USER")).toBe(
      "ADMIN",
    );
  });

  it("spasi & huruf besar pada email tidak menggagalkan pencocokan", () => {
    expect(effectiveRoleForEmail("  Admin@Contoh.com ", admin, "USER")).toBe(
      "ADMIN",
    );
  });

  it("email lain mempertahankan peran ADMIN dari DB", () => {
    expect(effectiveRoleForEmail("lain@contoh.com", admin, "ADMIN")).toBe(
      "ADMIN",
    );
  });

  it("email lain tanpa peran (akun Google baru) jatuh ke USER", () => {
    expect(effectiveRoleForEmail("baru@contoh.com", admin, null)).toBe("USER");
  });

  it("email kosong tidak pernah menaikkan peran", () => {
    expect(effectiveRoleForEmail(null, admin, undefined)).toBe("USER");
    expect(effectiveRoleForEmail("", admin, undefined)).toBe("USER");
  });
});
