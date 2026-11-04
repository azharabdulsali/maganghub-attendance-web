// src/lib/cron-topup.test.ts: uji aturan pemanggilan ULANG (MURNI).
//
// Yang dijaga: user yang tertunda pada jam jadwalnya harus dikejar pada jam
// berikutnya, tetapi hanya bila BELUM tuntas hari ini. Bila aturan ini salah
// ke arah "terlalu longgar", laporan terkirim dua kali; ke arah "terlalu
// ketat", laporan hilang diam-diam. Keduanya buruk, jadi batasnya dikunci.

import { describe, expect, it } from "vitest";

import { isOverdueNow, planTopUp, topUpNote } from "./cron-topup";

const user = (userId: string, hour: number) => ({ userId, hour, minute: 0 });

describe("isOverdueNow", () => {
  it("jam jadwal sudah lewat → true", () => {
    expect(isOverdueNow(user("u1", 12), 13)).toBe(true);
    expect(isOverdueNow(user("u1", 12), 23)).toBe(true);
  });

  it("jam jadwal belum tiba → false (tidak boleh dikirim lebih awal)", () => {
    expect(isOverdueNow(user("u1", 12), 9)).toBe(false);
  });

  it("jam SAMA bukan urusan top-up (slot itu milik planDispatch)", () => {
    // Bila ini true, user yang sama akan dipilih dua kali dalam satu
    // pemanggilan: sekali oleh planDispatch, sekali oleh planTopUp.
    expect(isOverdueNow(user("u1", 12), 12)).toBe(false);
  });

  it("jadwal kemarin tengah malam tidak dikejar (laporan beda tanggal)", () => {
    // 23:00 tertunda, cron berikutnya 00:xx → tidak boleh mengejar, karena
    // laporan yang terkirim akan tercatat sebagai hari ini, bukan kemarin.
    expect(isOverdueNow(user("u1", 23), 0)).toBe(false);
  });
});

describe("planTopUp", () => {
  it("memilih yang jadwalnya lewat DAN belum tuntas hari ini", () => {
    const hasil = planTopUp(
      [user("lunas", 8), user("tertunda", 8), user("belum-jam", 20)],
      13,
      new Set(["lunas"]),
      10,
    );
    expect(hasil.due.map((c) => c.userId)).toEqual(["tertunda"]);
    expect(hasil.remaining).toBe(0);
  });

  it("user yang belum pernah dicoba sama sekali ikut dikejar", () => {
    // Kasus nyata: server mati pada jam jadwalnya, jadi tidak ada SubmitLog apa
    // pun. Tanpa pengejaran, laporan hari itu hilang tanpa jejak.
    const hasil = planTopUp([user("u1", 7)], 15, new Set(), 10);
    expect(hasil.due.map((c) => c.userId)).toEqual(["u1"]);
  });

  it("user yang gagal hari ini (log FAILED) tetap dikejar", () => {
    // FAILED tidak masuk `settledUserIds`, jadi lolos dengan sendirinya.
    const hasil = planTopUp([user("u1", 7)], 15, new Set(), 10);
    expect(hasil.due).toHaveLength(1);
  });

  it("menghormati batas per pemanggilan dan melaporkan sisanya", () => {
    const hasil = planTopUp(
      [user("a", 7), user("b", 7), user("c", 7)],
      15,
      new Set(),
      2,
    );
    expect(hasil.due.map((c) => c.userId)).toEqual(["a", "b"]);
    expect(hasil.remaining).toBe(1);
  });

  it("batas 0 (kuota batch habis) → tidak ada yang diambil, semua dilaporkan", () => {
    const hasil = planTopUp([user("a", 7), user("b", 7)], 15, new Set(), 0);
    expect(hasil.due).toHaveLength(0);
    expect(hasil.remaining).toBe(2);
  });

  it("tidak memilih siapa pun bila semua sudah tuntas", () => {
    const hasil = planTopUp(
      [user("a", 7), user("b", 7)],
      15,
      new Set(["a", "b"]),
      10,
    );
    expect(hasil.due).toHaveLength(0);
    expect(hasil.remaining).toBe(0);
  });
});

describe("topUpNote", () => {
  it("null bila tidak ada yang tertunda", () => {
    expect(topUpNote(0)).toBeNull();
  });

  it("menyebut jumlahnya bila ada yang tertunda", () => {
    expect(topUpNote(3)).toContain("3");
  });
});
