// src/lib/nav.test.ts: uji logika penyorotan menu sidebar (murni).

import { describe, it, expect } from "vitest";

import { activeHref, matchesPath } from "./nav";

// Menu admin seperti di app-sidebar.tsx — kasus yang dulu bermasalah.
const MENU_ADMIN = [
  { href: "/admin" },
  { href: "/admin/holidays" },
  { href: "/dev-tools" },
];

describe("matchesPath", () => {
  it("cocok persis", () => {
    expect(matchesPath("/admin", "/admin")).toBe(true);
  });

  it("cocok sebagai induk (segmen berikutnya)", () => {
    expect(matchesPath("/admin/holidays", "/admin")).toBe(true);
  });

  it("tidak cocok bila hanya awalan huruf", () => {
    expect(matchesPath("/adminx", "/admin")).toBe(false);
    expect(matchesPath("/admin-tools", "/admin")).toBe(false);
  });

  it("tidak cocok untuk rute yang tak berhubungan", () => {
    expect(matchesPath("/dashboard", "/admin")).toBe(false);
  });
});

describe("activeHref", () => {
  it("hanya menyalakan menu terdalam saat di /admin/holidays", () => {
    // Ini bug aslinya: "/admin" ikut menyala karena prefix dari
    // "/admin/holidays". Sekarang hanya yang paling spesifik.
    expect(activeHref("/admin/holidays", MENU_ADMIN)).toBe("/admin/holidays");
  });

  it("menyalakan Panel Admin saat berpindah ke /admin", () => {
    expect(activeHref("/admin", MENU_ADMIN)).toBe("/admin");
  });

  it("tetap benar untuk sub-rute yang lebih dalam dari induk yang sama", () => {
    const items = [{ href: "/admin" }, { href: "/admin/holidays/detail" }];
    expect(activeHref("/admin/holidays/detail", items)).toBe(
      "/admin/holidays/detail",
    );
    expect(activeHref("/admin/holidays/detail/edit", items)).toBe(
      "/admin/holidays/detail",
    );
  });

  it("tidak menyalakan apa pun di rute yang tak ada di menu", () => {
    expect(activeHref("/login", MENU_ADMIN)).toBeNull();
  });

  it("menyalakan dashboard hanya untuk /dashboard persis", () => {
    const items = [{ href: "/dashboard" }];
    expect(activeHref("/dashboard", items)).toBe("/dashboard");
    expect(activeHref("/dashboard/settings", items)).toBe("/dashboard");
  });
});
