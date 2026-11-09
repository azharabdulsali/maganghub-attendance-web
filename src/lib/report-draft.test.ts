// src/lib/report-draft.test.ts: uji penyusun draf lokal.
//
// Yang diuji adalah JAMINAN, bukan kalimat persis: hasilnya bisa berubah bila
// pustaka frasa diedit, tetapi janji "selalu lulus checkReportField" tidak
// boleh pernah putus.

import { afterEach, describe, expect, it, vi } from "vitest";

import { localDrafter, getDrafter } from "./report-draft";
import { checkReportField, MIN_REPORT_LENGTH, countReportLength, DRAFT_MAX_LENGTH } from "./report-rules";

/**
 * Batas atas draf otomatis, dibaca dari sumbernya (bukan angka 200 yang disalin)
 * supaya tes ini ikut berubah bila keputusan produk berubah.
 */
const MAX_DRAFT_LENGTH_FOR_TEST = DRAFT_MAX_LENGTH;

const KASUS = [
  { nama: "kata kunci biasa", input: { keywords: "migrasi skema Prisma" } },
  { nama: "kata kunci + unit", input: { keywords: "rapat evaluasi", unit: "Divisi TI" } },
  { nama: "kata kunci kosong", input: { keywords: "" } },
  { nama: "hanya spasi", input: { keywords: "   " } },
  { nama: "kata kunci sangat pendek", input: { keywords: "a" } },
  {
    nama: "kata kunci panjang",
    input: { keywords: "menyusun laporan mingguan dan merekap data absensi seluruh peserta" },
  },
  { nama: "menandai tidak ada kendala", input: { keywords: "tidak ada" } },
  { nama: "kata kunci memuat lancar", input: { keywords: "kerja lancar" } },
] as const;

describe("localDrafter", () => {
  it("memiliki label yang bisa ditampilkan", () => {
    expect(localDrafter.label).toBeTruthy();
  });

  for (const kasus of KASUS) {
    it(`ketiga kolom lulus validasi, ${kasus.nama}`, async () => {
      const hasil = await localDrafter.draft(kasus.input);

      for (const [nama, teks] of Object.entries(hasil)) {
        const pesan = checkReportField(teks);
        expect(pesan, `kolom ${nama} gagal: ${pesan}`).toBeNull();
        expect(countReportLength(teks)).toBeGreaterThanOrEqual(MIN_REPORT_LENGTH);
      }
    });
  }

  it("deterministik, bahan sama menghasilkan hasil sama", async () => {
    const a = await localDrafter.draft({ keywords: "uji coba" });
    const b = await localDrafter.draft({ keywords: "uji coba" });
    expect(a).toEqual(b);
  });

  it("kolom kendala jujur bila pengguna menandai tidak ada kendala", async () => {
    const hasil = await localDrafter.draft({ keywords: "tidak ada" });
    const teks = hasil.obstacles.toLowerCase();
    // Terima kedua varian: "tidak ada kendala" atau "tanpa hambatan". Yang
    // penting maknanya jujur menyatakan hari itu lancar.
    expect(teks.includes("tidak ada kendala") || teks.includes("tanpa hambatan")).toBe(true);
  });

  it("tidak kontradiktif: tidak bilang ada kendala lalu mengaku lancar", async () => {
    const hasil = await localDrafter.draft({ keywords: "tidak ada kendala" });
    // Bila kolom kendala menyatakan tidak ada kendala, ia TIDAK boleh memuat
    // kalimat yang mengandaikan ada kendala yang diselesaikan.
    expect(hasil.obstacles.toLowerCase()).not.toContain("kendala di atas");
    expect(hasil.obstacles.toLowerCase()).not.toContain("meski sempat menghambat");
  });

  it("tidak meninggalkan placeholder yang belum diganti", async () => {
    const hasil = await localDrafter.draft({ keywords: "deploy", unit: "Tim Ops" });
    for (const teks of Object.values(hasil)) {
      expect(teks).not.toContain("{kw}");
      expect(teks).not.toContain("{unit}");
    }
  });

  it("menyisipkan kata kunci ke dalam hasil", async () => {
    const hasil = await localDrafter.draft({ keywords: "migrasi skema Prisma" });
    expect(`${hasil.activity} ${hasil.learning}`).toContain("migrasi skema Prisma");
  });

  // REGRESI: batas 200 karakter adalah aturan PEMBATAS AKHIR di penyusun lokal,
  // bukan sesuatu yang diandalkan dari modul pemasok. Sebelumnya jalur
  // `input.learning` (bahan bukti commit) dan jalur "tidak ada kendala" melewati
  // `cukupkan` TANPA pemotongan, sehingga batas itu hanya terjaga selama
  // `learningFromCommits` kebetulan ikut memotong.
  it("memotong bahan bukti yang kepanjangan ke batas draf", async () => {
    const panjang = "Memahami cara kerja migrasi basis data secara bertahap. ".repeat(20);
    expect(countReportLength(panjang)).toBeGreaterThan(MAX_DRAFT_LENGTH_FOR_TEST);

    const hasil = await localDrafter.draft({ keywords: "migrasi", learning: panjang });
    expect(countReportLength(hasil.learning)).toBeLessThanOrEqual(MAX_DRAFT_LENGTH_FOR_TEST);
    // Tetap kolom yang LAYAK disimpan, bukan kolom yang akan ditolak server.
    expect(checkReportField(hasil.learning)).toBeNull();
  });

  it("memotong kolom kendala jalur 'tidak ada kendala' ke batas draf", async () => {
    const hasil = await localDrafter.draft({ keywords: "tidak ada kendala" });
    expect(countReportLength(hasil.obstacles)).toBeLessThanOrEqual(MAX_DRAFT_LENGTH_FOR_TEST);
    expect(checkReportField(hasil.obstacles)).toBeNull();
  });

  it("semua kolom hasil lokal tidak pernah melebihi batas draf", async () => {
    // Kata kunci panjang tanpa spasi (mis. URL) adalah kasus terburuk: ia tidak
    // bisa dipotong di batas kata dan dulu bisa memaksa kolom melewati batas.
    const panjang = "https://contoh.test/" + "a".repeat(400);
    const hasil = await localDrafter.draft({ keywords: panjang, unit: "Tim Ops" });
    for (const [nama, teks] of Object.entries(hasil)) {
      expect(
        countReportLength(teks),
        `kolom ${nama} melebihi batas draf`,
      ).toBeLessThanOrEqual(MAX_DRAFT_LENGTH_FOR_TEST);
    }
  });
});

describe("getDrafter", () => {
  it("kontrak terpenuhi: punya label dan draft", () => {
    const d = getDrafter();
    expect(typeof d.label).toBe("string");
    expect(typeof d.draft).toBe("function");
  });
});

describe("draftWithFallback", () => {
  // Env WAJIB supaya `env.ts` bisa diimpor (pola sama seperti crypto.test.ts).
  // Nilainya tiruan, bukan rahasia asli.
  const ENV_WAJIB = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    DIRECT_URL: "postgresql://user:pass@localhost:5432/db",
    NEXTAUTH_SECRET: "a".repeat(32),
    NEXTAUTH_URL: "http://localhost:3000",
    ENCRYPTION_KEY: "0123456789abcdef".repeat(4),
  };

  function pasangEnv(key: string) {
    process.env = {
      ...process.env,
      ...ENV_WAJIB,
      GEMINI_API_KEY: key,
      GEMINI_MODEL: "gemini-2.0-flash",
    };
    vi.resetModules();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("tanpa key, memakai lokal dan menandai bukan fallback kegagalan", async () => {
    pasangEnv("");
    const { draftWithFallback } = await import("./report-draft");

    const hasil = await draftWithFallback({ keywords: "uji" });
    expect(hasil.label).toBe(localDrafter.label);
    // Key kosong = memang begitu konfigurasinya, bukan kegagalan LLM.
    expect(hasil.fallback).toBe(false);
    expect(checkReportField(hasil.hasil.activity)).toBeNull();
  });

  it("getDrafter() tetap bekerja tanpa key, hasilnya valid", async () => {
    pasangEnv("");
    const { getDrafter } = await import("./report-draft");
    const hasil = await getDrafter().draft({ keywords: "uji" });
    expect(checkReportField(hasil.activity)).toBeNull();
  });

  it("dengan key sehat, memakai LLM dan labelnya menyebut provider", async () => {
    pasangEnv("AIza-palsu-panjang-untuk-tes-fallback");
    const isi = {
      activity: `Mengerjakan migrasi skema basis data bersama tim dan memeriksa setiap perubahan struktur sebelum diterapkan pada lingkungan pengujian agar tidak mengganggu data yang sudah ada.`,
      learning: `Memahami pentingnya membuat pencadangan sebelum mengubah struktur basis data serta membaca dokumentasi resmi agar setiap langkah dapat dipertanggungjawabkan.`,
      obstacles: `Tidak ada kendala berarti hari ini, seluruh pekerjaan berjalan sesuai rencana yang telah disusun bersama pembimbing lapangan.`,
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(isi) }] } }],
      }),
    })) as unknown as typeof fetch);

    const { draftWithFallback } = await import("./report-draft");
    const hasil = await draftWithFallback({ keywords: "migrasi skema" });

    expect(hasil.label).toContain("Gemini");
    expect(hasil.fallback).toBe(false);
    expect(hasil.hasil.activity).toBe(isi.activity);
  });

  it("saat LLM gagal (kuota habis), DIAM-DIAM turun ke lokal, bukan error", async () => {
    pasangEnv("AIza-palsu-panjang-untuk-tes-fallback");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "quota exceeded" } }),
    })) as unknown as typeof fetch);

    const { draftWithFallback } = await import("./report-draft");
    const hasil = await draftWithFallback({ keywords: "rapat mingguan" });

    // Ini inti jaring pengamannya: pengguna TETAP dapat draf yang valid.
    expect(hasil.label).toBe(localDrafter.label);
    expect(hasil.fallback).toBe(true);
    for (const teks of Object.values(hasil.hasil)) {
      expect(checkReportField(teks)).toBeNull();
      expect(countReportLength(teks)).toBeGreaterThanOrEqual(MIN_REPORT_LENGTH);
    }
  });

  it("saat jaringan putus, juga turun ke lokal tanpa melempar error", async () => {
    pasangEnv("AIza-palsu-panjang-untuk-tes-fallback");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch);

    const { draftWithFallback } = await import("./report-draft");
    const hasil = await draftWithFallback({ keywords: "deploy" });

    expect(hasil.fallback).toBe(true);
    expect(checkReportField(hasil.hasil.learning)).toBeNull();
  });

  it("saat model membalas sampah, turun ke lokal", async () => {
    pasangEnv("AIza-palsu-panjang-untuk-tes-fallback");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "maaf saya tidak bisa" }] } }],
      }),
    })) as unknown as typeof fetch);

    const { draftWithFallback } = await import("./report-draft");
    const hasil = await draftWithFallback({ keywords: "uji" });
    expect(hasil.fallback).toBe(true);
    expect(hasil.label).toBe(localDrafter.label);
  });
});
