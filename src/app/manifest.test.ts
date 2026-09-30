// src/app/manifest.test.ts
//
// Mengunci web app manifest. Yang penting diuji bukan "isinya ada", melainkan
// invarian yang kalau rusak membuat "Tambahkan ke Layar Utama" gagal senyap:
// ikon harus menunjuk rute internal, dan start_url harus ada. Sama seperti
// site.test.ts, env tiruan disiapkan SEBELUM impor.

import { describe, it, expect, beforeAll } from "vitest";

type ManifestModule = typeof import("./manifest");
let manifestFn: ManifestModule["default"];

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.DIRECT_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.NEXTAUTH_SECRET = "a".repeat(32);
  process.env.NEXTAUTH_URL = "https://contoh.test";
  process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
  delete process.env.ADMIN_EMAIL;

  manifestFn = (await import("./manifest")).default;
});

describe("web app manifest", () => {
  it("memakai SITE_NAME sebagai short_name dan punya start_url", async () => {
    const m = manifestFn();
    expect(m.short_name).toBe("MagangHub");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("id");
  });

  it("semua ikon menunjuk rute LOKAL (bukan URL luar / data URI)", () => {
    const m = manifestFn();
    expect(m.icons && m.icons.length).toBeGreaterThan(0);
    for (const icon of m.icons ?? []) {
      // Ikon harus path absolut internal. URL luar akan gagal saat offline dan
      // menambah ketergantungan yang tidak perlu.
      expect(typeof icon.src).toBe("string");
      expect(String(icon.src).startsWith("/")).toBe(true);
      expect(String(icon.src)).not.toMatch(/^https?:|^data:/);
    }
  });

  it("warna tema sama dengan themeColor di layout (tidak ada dua warna beda)", () => {
    // Bila keduanya berbeda, bilah status Android dan bilah browser akan
    // tampak beda warna saat aplikasi dipasang.
    const m = manifestFn();
    expect(m.theme_color).toBe("#5294ff");
    expect(m.background_color).toBe("#0a0a0a");
  });
});
