// src/lib/credential-session.test.ts: uji simpan/hidup sesi Monev, tanpa DB nyata.
//
// Fokus utama: `persistRotatedRefreshToken` — karena portal MEROTASI
// `monev_refresh_token` tiap `POST /auth/refresh` sukses. Kalau token baru tidak
// tersimpan, refresh berikutnya memakai token yang sudah dicabut → 401 palsu.

import { beforeEach, describe, expect, it, vi } from "vitest";

const encryptMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/crypto", () => ({
  encrypt: (...args: unknown[]) => encryptMock(...args),
  decrypt: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    maganghubCredential: {
      update: (...args: unknown[]) => updateMock(...args),
      findUnique: vi.fn(),
    },
  },
}));

import {
  persistRotatedRefreshToken,
  pickRefreshTokenToPersist,
} from "./credential-session";

beforeEach(() => {
  vi.clearAllMocks();
  encryptMock.mockImplementation((plain: string) => ({
    ciphertext: `enc(${plain})`,
    iv: "iv-1",
    authTag: "tag-1",
  }));
  updateMock.mockResolvedValue({ userId: "u1" });
});

describe("persistRotatedRefreshToken", () => {
  it("menyimpan token baru ke KOLOM refresh (bukan access), tanpa menyentuh status", async () => {
    const ok = await persistRotatedRefreshToken("u1", "REFRESH-NEW");

    expect(ok).toBe(true);
    expect(encryptMock).toHaveBeenCalledWith("REFRESH-NEW");
    expect(updateMock).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: {
        tokenCiphertext: "enc(REFRESH-NEW)",
        tokenIv: "iv-1",
        tokenAuthTag: "tag-1",
      },
    });
    // Status TIDAK ikut diubah: rotasi bukan bukti sesi ACTIVE/INVALID.
    const data = updateMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("accessCiphertext");
  });

  it("token kosong → tidak menyentuh DB, kembalikan false", async () => {
    expect(await persistRotatedRefreshToken("u1", "")).toBe(false);
    expect(await persistRotatedRefreshToken("u1", "   ")).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("kegagalan DB ditelan → false, bukan lempar", async () => {
    updateMock.mockRejectedValueOnce(new Error("DB mati"));
    await expect(persistRotatedRefreshToken("u1", "REFRESH-NEW")).resolves.toBe(
      false,
    );
  });
});

// Regresi bug "rotasi terbalik": pada jalur tempel token, route verify pernah
// menimpa token rotasi (hidup) dengan token tempelan pengguna (sudah dicabut).
// Fungsi ini memastikan token rotasi SELALU menang.
describe("pickRefreshTokenToPersist", () => {
  it("token rotasi menang atas token tempelan (intinya fix ini)", () => {
    expect(pickRefreshTokenToPersist("ROTATED", "PASTED")).toBe("ROTATED");
  });

  it("tanpa rotasi → pakai token tempelan apa adanya", () => {
    expect(pickRefreshTokenToPersist(undefined, "PASTED")).toBe("PASTED");
  });

  it("rotasi null → pakai token tempelan", () => {
    expect(pickRefreshTokenToPersist(null, "PASTED")).toBe("PASTED");
  });

  it("rotasi kosong/whitespace dianggap tidak ada → token tempelan", () => {
    expect(pickRefreshTokenToPersist("", "PASTED")).toBe("PASTED");
    expect(pickRefreshTokenToPersist("   ", "PASTED")).toBe("PASTED");
  });

  it("rotasi di-trim sebelum disimpan", () => {
    expect(pickRefreshTokenToPersist("  ROTATED  ", "PASTED")).toBe("ROTATED");
  });
});
