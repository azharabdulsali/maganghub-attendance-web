// src/lib/report-rules.test.ts: uji aturan 100 karakter.
//
// Ini aturan milik PORTAL, bukan selera kita. Kalau salah hitung, pengguna
// mengira laporannya sah lalu ditolak portal tanpa penjelasan yang berguna.
// Bot Python memakai `len(value.strip()) < 100`, jadi kita harus sama.

import { describe, it, expect } from "vitest";
import {
  MIN_REPORT_LENGTH,
  MAX_REPORT_LENGTH,
  countReportLength,
  checkReportField,
  normalizeReportText,
} from "./report-rules";

/** Teks valid: tepat 100 karakter setelah dipangkas. */
const VALID = "a".repeat(100);

describe("countReportLength, cara menghitung", () => {
  it("menghitung teks biasa", () => {
    expect(countReportLength("abc")).toBe(3);
  });

  it("tidak menghitung spasi di tepi", () => {
    expect(countReportLength(`  ${VALID}  `)).toBe(100);
  });

  it("menghitung spasi di TENGAH", () => {
    expect(countReportLength("a b")).toBe(3);
  });

  it("tidak menghitung NBSP di tepi (tempelan dari Word)", () => {
    // Sudah diuji: trim() JS memang memangkas U+00A0, beda dari beberapa
    // bahasa lain. Kalau ini berubah, teks tempelan Word akan salah dihitung.
    expect(countReportLength(`\u00A0${VALID}\u00A0`)).toBe(100);
  });

  it("tidak menghitung ideographic space di tepi", () => {
    expect(countReportLength(`\u3000${VALID}`)).toBe(100);
  });

  it("tetap menghitung zero-width space (tidak dipangkas)", () => {
    // Karakter tak terlihat yang dihitung portal. Kita ikut menghitung apa
    // adanya supaya tidak meloloskan teks yang portal tolak.
    expect(countReportLength(`\u200B${VALID}`)).toBe(101);
  });

  it("menghitung newline di TENGAH sebagai karakter", () => {
    expect(countReportLength("a\nb")).toBe(3);
  });

  it("mengembalikan 0 untuk teks kosong / spasi saja", () => {
    expect(countReportLength("")).toBe(0);
    expect(countReportLength("      ")).toBe(0);
    expect(countReportLength("\n\n\t  ")).toBe(0);
  });
});

describe("checkReportField, tolak/terima", () => {
  it("menolak teks kosong", () => {
    expect(checkReportField("")).toBe("Wajib diisi.");
  });

  it("menolak teks yang hanya berisi spasi", () => {
    expect(checkReportField("     ")).toBe("Wajib diisi.");
  });

  it("menolak 99 karakter (kurang 1)", () => {
    const pesan = checkReportField("a".repeat(99));
    expect(pesan).not.toBeNull();
    expect(pesan).toContain("Kurang 1 karakter");
  });

  it("menerima tepat 100 karakter (batas)", () => {
    expect(checkReportField(VALID)).toBeNull();
  });

  it("menerima 100 karakter walau ada spasi tepi", () => {
    expect(checkReportField(`   ${VALID}   `)).toBeNull();
  });

  it("menolak 34 karakter dan menyebut kekurangannya", () => {
    expect(checkReportField("a".repeat(34))).toContain("Kurang 66 karakter");
  });

  it("menerima tepat 5000 karakter (batas atas)", () => {
    expect(checkReportField("a".repeat(MAX_REPORT_LENGTH))).toBeNull();
  });

  it("menolak 5001 karakter", () => {
    const pesan = checkReportField("a".repeat(MAX_REPORT_LENGTH + 1));
    expect(pesan).not.toBeNull();
    expect(pesan).toContain("Terlalu panjang");
  });

  it("pesan error selalu dalam bahasa Indonesia yang bisa dibaca", () => {
    // Pesan ini tampil langsung di layar pengguna, jangan bocorkan istilah
    // teknis seperti "minLength" atau "invalid input".
    const pesan = checkReportField("pendek");
    expect(pesan).toMatch(/karakter/);
    expect(pesan).not.toMatch(/invalid|undefined|null|NaN|minLength/i);
  });

  it("menghitung emoji sebagai 2 (surrogate pair), sama seperti portal", () => {
    // Portal (JavaScript di browser) memakai .length yang sama, jadi perilaku
    // kita konsisten. Kalau nanti terasa aneh, yang menentukan tetap portal.
    expect(countReportLength("\u{1F512}")).toBe(2);
  });
});

describe("normalizeReportText, penyeragaman sebelum simpan", () => {
  it("memangkas spasi tepi", () => {
    expect(normalizeReportText("  halo  ")).toBe("halo");
  });

  it("mengubah CRLF menjadi LF", () => {
    expect(normalizeReportText("a\r\nb")).toBe("a\nb");
  });

  it("mengubah CR tunggal menjadi LF", () => {
    expect(normalizeReportText("a\rb")).toBe("a\nb");
  });

  it("membiarkan LF apa adanya", () => {
    expect(normalizeReportText("a\nb")).toBe("a\nb");
  });

  it("membuat dua teks yang setara dari sistem berbeda jadi identik", () => {
    // Inti fungsi ini: laporan yang diketik di Windows dan di HP harus
    // tersimpan sebagai teks yang benar-benar sama.
    expect(normalizeReportText("baris1\r\nbaris2\r\n")).toBe(
      normalizeReportText("baris1\nbaris2\n"),
    );
  });

  it("tidak mengubah isi di dalam teks", () => {
    const asli = "Aktivitas: a  b\tc (2 spasi, 1 tab)";
    expect(normalizeReportText(asli)).toBe(asli);
  });
});

describe("normalizeReportText + countReportLength, dipakai bersama", () => {
  it("panjang setelah normalisasi sama dengan yang dihitung pengguna", () => {
    const mentah = `\u00A0${VALID}\r\n`;
    const bersih = normalizeReportText(mentah);
    expect(countReportLength(bersih)).toBe(MIN_REPORT_LENGTH);
    expect(checkReportField(bersih)).toBeNull();
  });
});

describe("konstanta", () => {
  it("MIN 100 sesuai validasi portal Maganghub", () => {
    expect(MIN_REPORT_LENGTH).toBe(100);
  });

  it("MAX 5000 sesuai maxlength textarea portal", () => {
    expect(MAX_REPORT_LENGTH).toBe(5000);
  });
});
