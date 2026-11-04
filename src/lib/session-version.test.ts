import { describe, expect, it } from "vitest";

import {
  sesiMasihSah,
  versiSesiDariKlien,
  wajibGantiDariKlien,
  peranSesiEfektif,
} from "./session-version";

describe("sesiMasihSah", () => {
  it("token dengan versi sama dengan DB tetap sah", () => {
    expect(sesiMasihSah(0, 0)).toBe(true);
    expect(sesiMasihSah(3, 3)).toBe(true);
  });

  it("versi berbeda → sesi dicabut (ganti sandi / keluar perangkat lain)", () => {
    expect(sesiMasihSah(0, 1)).toBe(false);
    expect(sesiMasihSah(5, 4)).toBe(false);
  });

  it("token tanpa versi (sesi lama sebelum fitur ini) dianggap tidak sah", () => {
    // Sesi yang diterbitkan sebelum kolom ini ada tidak punya klaim versi.
    // Menolaknya memaksa login ulang sekali, pilihan yang aman.
    expect(sesiMasihSah(undefined, 0)).toBe(false);
    expect(sesiMasihSah(null, 0)).toBe(false);
  });

  it("nilai non-angka dari token ditolak", () => {
    expect(sesiMasihSah("0", 0)).toBe(false);
    expect(sesiMasihSah({}, 0)).toBe(false);
  });
});

describe("versiSesiDariKlien", () => {
  it("menerima angka bulat non-negatif", () => {
    expect(versiSesiDariKlien({ sessionVersion: 0 })).toBe(0);
    expect(versiSesiDariKlien({ sessionVersion: 7 })).toBe(7);
  });

  it("menolak nilai non-angka / pecahan / negatif", () => {
    expect(versiSesiDariKlien({ sessionVersion: "5" })).toBeNull();
    expect(versiSesiDariKlien({ sessionVersion: 1.5 })).toBeNull();
    expect(versiSesiDariKlien({ sessionVersion: -1 })).toBeNull();
    expect(versiSesiDariKlien({ sessionVersion: Number.NaN })).toBeNull();
  });

  it("menolak bentuk yang tidak terduga tanpa melempar", () => {
    expect(versiSesiDariKlien(null)).toBeNull();
    expect(versiSesiDariKlien(undefined)).toBeNull();
    expect(versiSesiDariKlien("apa saja")).toBeNull();
    expect(versiSesiDariKlien({})).toBeNull();
  });
});

describe("wajibGantiDariKlien", () => {
  it("menerima boolean apa pun (true menyalakan, false mematikan spanduk)", () => {
    expect(wajibGantiDariKlien({ mustChangePassword: true })).toBe(true);
    // Setelah pengguna berhasil ganti sandi, klien mengirim false.
    expect(wajibGantiDariKlien({ mustChangePassword: false })).toBe(false);
  });

  it("menolak nilai non-boolean (klien tak dipercaya begitu saja)", () => {
    expect(wajibGantiDariKlien({ mustChangePassword: "true" })).toBeNull();
    expect(wajibGantiDariKlien({ mustChangePassword: 1 })).toBeNull();
    expect(wajibGantiDariKlien({ mustChangePassword: 0 })).toBeNull();
    expect(wajibGantiDariKlien({ mustChangePassword: null })).toBeNull();
  });

  it("menolak bentuk tak terduga tanpa melempar", () => {
    expect(wajibGantiDariKlien(null)).toBeNull();
    expect(wajibGantiDariKlien(undefined)).toBeNull();
    expect(wajibGantiDariKlien("apa saja")).toBeNull();
    expect(wajibGantiDariKlien({})).toBeNull();
  });
});

describe("peranSesiEfektif", () => {
  // INTI: peran sesi HARUS mengikuti DB, bukan potret saat login. Sebelum
  // penyegaran ini ada, admin yang diturunkan tetap lolos semua penjagaan
  // admin sampai token kedaluwarsa (token menyimpan `role` saat login).
  it("memakai peran DB, bukan peran token, saat keduanya berbeda", () => {
    // Diturunkan: token masih ADMIN, DB sudah USER -> harus USER.
    expect(peranSesiEfektif("ADMIN", "USER")).toBe("USER");
    // Dinaikkan: token masih USER, DB sudah ADMIN -> harus ADMIN.
    expect(peranSesiEfektif("USER", "ADMIN")).toBe("ADMIN");
  });

  it("tetap benar bila peran token dan DB sama", () => {
    expect(peranSesiEfektif("ADMIN", "ADMIN")).toBe("ADMIN");
    expect(peranSesiEfektif("USER", "USER")).toBe("USER");
  });

  it("tidak peka huruf besar-kecil dan spasi", () => {
    expect(peranSesiEfektif("admin", " user ")).toBe("USER");
    expect(peranSesiEfektif(" user ", "admin")).toBe("ADMIN");
  });

  // Peran tak dikenal di DB TIDAK dianggap ADMIN. Sesi lama yang kebetulan
  // masih memegang ADMIN tetap boleh ADMIN (token belum dicabut), tetapi nilai
  // asing tidak pernah MENGUBAH siapa pun menjadi ADMIN.
  it("peran DB tak dikenal tidak pernah menaikkan peran", () => {
    expect(peranSesiEfektif("USER", "SUPERADMIN")).toBe("USER");
    expect(peranSesiEfektif("user", "OWNER")).toBe("USER");
    // Token lama yang sudah ADMIN tidak diturunkan oleh nilai asing; sesi itu
    // dicabut lewat `sessionVersion`, bukan lewat tebakan peran.
    expect(peranSesiEfektif("ADMIN", "SUPERADMIN")).toBe("ADMIN");
  });

  it("memakai peran token bila DB tidak memberi peran yang bisa dipakai", () => {
    expect(peranSesiEfektif("ADMIN", "")).toBe("ADMIN");
    expect(peranSesiEfektif("ADMIN", null)).toBe("ADMIN");
    expect(peranSesiEfektif("USER", undefined)).toBe("USER");
  });

  it("tanpa peran yang bisa dipakai, hasilnya USER (menutup, bukan membuka)", () => {
    expect(peranSesiEfektif(null, null)).toBe("USER");
    expect(peranSesiEfektif(undefined, undefined)).toBe("USER");
    expect(peranSesiEfektif(123, 456)).toBe("USER");
    expect(peranSesiEfektif({}, [])).toBe("USER");
  });
});
