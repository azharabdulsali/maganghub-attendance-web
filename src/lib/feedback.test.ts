// src/lib/feedback.test.ts: kunci aturan Kritik & Saran.
//
// Yang diuji adalah hal yang bisa diam-diam rusak: batas panjang dihitung
// SETELAH trim (pengguna sering menempel teks berbaris baru), input bukan teks
// ditolak, dan label status tidak tertukar.

import { describe, expect, it } from "vitest";

import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  countFeedbackLength,
  describeFeedbackState,
  feedbackStateTone,
  validateFeedbackInput,
} from "./feedback";

describe("countFeedbackLength", () => {
  it("menghitung setelah trim", () => {
    expect(countFeedbackLength("  halo dunia  ")).toBe(10);
    expect(countFeedbackLength("\n\n  halo  \r\n")).toBe(4);
  });

  it("string kosong / hanya spasi = 0", () => {
    expect(countFeedbackLength("")).toBe(0);
    expect(countFeedbackLength("   \n\t ")).toBe(0);
  });
});

describe("validateFeedbackInput", () => {
  it("menerima pesan yang cukup panjang dan mengembalikan versi ter-trim", () => {
    const hasil = validateFeedbackInput({ message: "  Aplikasi bagus sekali  " });
    expect(hasil).toEqual({ ok: true, message: "Aplikasi bagus sekali" });
  });

  it(`menolak pesan di bawah ${FEEDBACK_MIN_LENGTH} karakter`, () => {
    const hasil = validateFeedbackInput({ message: "pendek" });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.field).toBe("message");
      expect(hasil.error).toContain(String(FEEDBACK_MIN_LENGTH));
    }
  });

  it("menolak pesan kosong / hanya spasi", () => {
    expect(validateFeedbackInput({ message: "        " }).ok).toBe(false);
    expect(validateFeedbackInput({ message: "" }).ok).toBe(false);
  });

  it("menolak input yang bukan teks", () => {
    expect(validateFeedbackInput({ message: 123 }).ok).toBe(false);
    expect(validateFeedbackInput({ message: null }).ok).toBe(false);
    expect(validateFeedbackInput({}).ok).toBe(false);
  });

  it(`menerima tepat ${FEEDBACK_MAX_LENGTH} karakter, menolak lebih`, () => {
    expect(validateFeedbackInput({ message: "a".repeat(FEEDBACK_MAX_LENGTH) }).ok).toBe(
      true,
    );
    expect(
      validateFeedbackInput({ message: "a".repeat(FEEDBACK_MAX_LENGTH + 1) }).ok,
    ).toBe(false);
  });

  it("spasi di pinggir tidak dihitung ke batas maksimum", () => {
    const isi = "a".repeat(FEEDBACK_MAX_LENGTH);
    expect(validateFeedbackInput({ message: `  ${isi}  ` }).ok).toBe(true);
  });
});

describe("status dibaca", () => {
  it("readAt kosong = belum dibaca, terisi = sudah dibaca", () => {
    expect(describeFeedbackState(null)).toBe("Belum dibaca");
    expect(describeFeedbackState(new Date("2026-10-21T00:00:00Z"))).toBe(
      "Sudah dibaca",
    );
  });

  it("nada badge: hijau hanya setelah dibaca", () => {
    expect(feedbackStateTone(null)).toBe("neutral");
    expect(feedbackStateTone(new Date("2026-10-21T00:00:00Z"))).toBe("good");
  });
});
