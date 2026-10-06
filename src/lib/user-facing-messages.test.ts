// src/lib/user-facing-messages.test.ts: penjaga agar pesan yang DILIHAT
// pengguna tidak memuat jargon teknis (AGENTS.md §3 "Semua teks yang dilihat
// pengguna wajib dimengerti orang awam").
//
// Kenapa tes ini ada: sebagian besar pesan error API ditampilkan apa adanya di
// UI lewat `setError(data.error)` atau `toast.error(judul, data.error)`. Jadi
// string `{ error: "..." }` BUKAN pesan internal — ia tampil di layar. Tanpa
// penjaga ini, istilah seperti `userId`, `JSON`, `HTTP 403`, atau `CRON_SECRET`
// mudah lolos ke depan pengguna tanpa ada yang sadar.
//
// Tes ini memindai SUMBER (bukan menjalankan tiap fungsi) supaya langsung
// menangkap literal baru. Ruang lingkupnya sengaja dipersempit: hanya berkas
// yang benar-benar merender ke layar, dan endpoint yang audiensnya memang
// teknisi (cron/webhook/diagnostik) dikecualikan.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const AKAR = path.resolve(__dirname, "..");

/** Berkas sumber yang pesannya berpotensi tampil ke pengguna. */
function berkasSumber(): string[] {
  const hasil: string[] = [];
  const telusuri = (dir: string) => {
    for (const nama of readdirSync(dir)) {
      const penuh = path.join(dir, nama);
      if (statSync(penuh).isDirectory()) {
        telusuri(penuh);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(nama)) continue;
      if (/\.test\.tsx?$/.test(nama)) continue;
      if (penuh.includes(`${path.sep}generated${path.sep}`)) continue;
      hasil.push(penuh);
    }
  };
  for (const mulai of ["app", "lib", "components"].map((p) => path.join(AKAR, p))) {
    telusuri(mulai);
  }
  return hasil;
}

/**
 * Berkas yang audiensnya memang teknisi (penjadwal/curl/alat diagnostik admin:
 * analisis HAR & perintah curl). Pesan `HTTP`/`Authorization`/`JSON`/`HAR` di
 * sini WAJIB teknis agar bisa dipakai saat menyiapkan webhook — bukan
 * pelanggaran aturan "pesan awam".
 */
const DIKECUALIKAN = [
  `${path.sep}api${path.sep}cron${path.sep}`,
  `${path.sep}api${path.sep}dev-tools${path.sep}`,
  `${path.sep}lib${path.sep}har-capture.ts`,
];

/** Istilah yang TIDAK boleh muncul di teks yang dilihat pengguna. */
const JARGON: Array<{ pola: RegExp; saran: string }> = [
  { pola: /\bJSON\b/, saran: "sebut 'data permintaan'" },
  { pola: /\bHTTP\s*\d{3}\b/, saran: "jelaskan dalam bahasa awam" },
  { pola: /\bcf-mitigated\b/i, saran: "pakai 'proteksi anti-bot portal'" },
  { pola: /\bcontent-type\b/i, saran: "hapus dari pesan pengguna" },
  { pola: /\bBearer\b/, saran: "hapus dari pesan pengguna" },
  { pola: /\bCRON_SECRET\b/, saran: "sebut 'penjadwal belum aktif'" },
  { pola: /\buserId\b/, saran: "sebut 'data pengguna'" },
  { pola: /\baccess_token\b/, saran: "sebut 'sesi'" },
  { pola: /\bcsrf\b/i, saran: "hapus dari pesan pengguna" },
  { pola: /\bOAuth\b/i, saran: "sebut 'login otomatis'" },
  { pola: /\/auth\/login/, saran: "sebut 'portal'" },
  { pola: /Parameter\s+'/, saran: "sebut nama hal yang kurang, bukan nama parameter" },
  { pola: /Field\s+'/, saran: "sebut nama kolom dalam bahasa awam" },
  { pola: /Format permintaan/i, saran: "sebut 'data yang dikirim tidak terbaca'" },
  { pola: /\bSSO\b/, saran: "sebut 'portal Kemnaker'" },
  { pola: /\bWAF\b/, saran: "sebut 'proteksi anti-bot'" },
];

/**
 * Ambil literal string pada baris yang merupakan PESAN PENGGUNA.
 *
 * Hanya baris dengan penanda pesan (`error:`, `message:`, `toast.x(`,
 * `setError(`, `setSukses(`, `setLoginMsg(`, `setTokenMsg(`) yang diperiksa, dan
 * komentar dibuang — supaya istilah teknis di kode/nama variabel tidak ikut
 * dituduh.
 */
/** Jargon tambahan: pola teknis yang lazim lolos ke pesan tanpa disadari. */
const JARGON_EKSTRA: Array<{ pola: RegExp; saran: string }> = [
  { pola: /\bmonev_refresh_token\b/i, saran: "sebut 'sesi'" },
  { pola: /\brefresh_token\b/i, saran: "sebut 'sesi'" },
  { pola: /\baccess token\b/i, saran: "sebut 'sesi'" },
  { pola: /\bcode\b/i, saran: "sebut 'lanjutan login'" },
  { pola: /\bhop\b/i, saran: "hapus dari pesan pengguna" },
  { pola: /gerbang\s+'/i, saran: "hapus nama gerbang internal" },
  { pola: /\bauthenticated\b/i, saran: "hapus dari pesan pengguna" },
  { pola: /redirect_uri|res\.url|Location\b/, saran: "hapus detail protokol" },
  { pola: /\brespons(?:e)?\s+HTTP\b/i, saran: "jelaskan dalam bahasa awam" },
  { pola: /docs\/MONEV-API|§\d/i, saran: "hapus rujukan dokumen internal" },
];

/** Semua istilah terlarang = JARGON bawaan + tambahan. */
const SEMUA_JARGON = [...JARGON, ...JARGON_EKSTRA];

/**
 * Ambil literal string pada baris yang merupakan PESAN PENGGUNA.
 *
 * Hanya baris dengan penanda pesan (`error:`, `message:`, `toast.x(`,
 * `setError(`, `setSukses(`, `setLoginMsg(`, `setTokenMsg(`) yang diperiksa, dan
 * komentar dibuang — supaya istilah teknis di kode/nama variabel tidak ikut
 * dituduh.
 *
 * Pesan yang ditulis multi-baris (`message:\n  "a" +\n  "b"`) digabung dulu
 * menjadi satu pesan logis, dan template literal (`` `...` ``) ikut dipindai —
 * dua celah yang sempat meloloskan jargon `HTTP`/`hop` ke layar.
 */
function pesanPengguna(isi: string): Array<{ baris: number; teks: string }> {
  // Penanda nilai pesan: literal string yang muncul SETELAH `message:`/`error:`
  // atau sebagai argumen `toast.*(`/`setError(`. Ini mencegah nilai field lain
  // (mis. `step: "oauth-start"`) ikut dianggap pesan pengguna.
  const penanda =
    /\b(?:message|error)\s*:\s*|toast\.(?:error|success|info|warning)\(|setError\(|setSukses\(|setLoginMsg\(|setTokenMsg\(/;
  const keluaran: Array<{ baris: number; teks: string }> = [];
  const baris = isi.split(/\r?\n/);
  for (let i = 0; i < baris.length; i++) {
    const tanpaKomentar = baris[i].replace(/\/\/.*$/, "");
    const mPenanda = penanda.exec(tanpaKomentar);
    if (!mPenanda) continue;
    // Literal hanya dianggap pesan bila muncul SETELAH penanda (agar nama
    // field seperti `step: "oauth-start"` tidak dituduh jargon).
    const posisiPenanda = (mPenanda.index ?? 0) + mPenanda[0].length;
    let pesan = tanpaKomentar.slice(posisiPenanda);
    let j = i;
    // Teruskan ke baris berikutnya SELAMA baris sekarang diakhiri `+` (sambungan
    // string) ATAU baris sekarang belum memuat literal apa pun (kasus penanda
    // `message:` bersambung ke baris berikutnya).
    for (;;) {
      const bisaLanjut =
        /[+]\s*$/.test(pesan.replace(/\/\/.*$/, "").trimEnd()) ||
        !/[`"]/.test(pesan);
      if (!bisaLanjut || j + 1 >= baris.length) break;
      // Berhenti bila baris berikutnya terlalu jauh dari penanda (mis. baris kosong/blok baru).
      const berikut = baris[j + 1].replace(/\/\/.*$/, "");
      if (berikut.trim().length === 0) break;
      j++;
      pesan += " " + berikut;
    }
    // Pisahkan potongan teks: string biasa DAN template literal.
    const potongan = [
      ...pesan.matchAll(/`((?:[^`\\]|\\.)*)`/g),
      ...pesan.matchAll(/"((?:[^"\\]|\\.)*)"/g),
    ].map((m) => m[1]);
    // Buang rujukan interpolasi `${...}` agar tak dituduh jargon kode.
    for (const p of potongan) {
      const teks = p.replace(/\$\{[^}]*\}/g, " ").trim();
      if (teks.length > 0) keluaran.push({ baris: i + 1, teks });
    }
  }
  return keluaran;
}

describe("pesan yang dilihat pengguna bebas jargon", () => {
  const berkas = berkasSumber().filter(
    (f) => !DIKECUALIKAN.some((skip) => f.includes(skip)),
  );

  it("memindai berkas sumber yang relevan (sanitas)", () => {
    // Kalau daftar berkas kosong karena bug path, tes jadi palsu-hijau.
    expect(berkas.length).toBeGreaterThan(20);
  });

  it("tidak ada pesan yang memuat istilah teknis terlarang", () => {
    const pelanggaran: string[] = [];
    for (const berkasPath of berkas) {
      const isi = readFileSync(berkasPath, "utf8");
      for (const { baris, teks } of pesanPengguna(isi)) {
        for (const { pola, saran } of SEMUA_JARGON) {
          if (pola.test(teks)) {
            pelanggaran.push(
              `${path.relative(AKAR, berkasPath)}:${baris} → "${teks}" ` +
                `(memuat ${pola}); ${saran}.`,
            );
          }
        }
      }
    }
    expect(pelanggaran).toEqual([]);
  });
});

describe("halaman /automation menjelaskan waktu kirim bisa meleset", () => {
  // Keluhan nyata: pengguna mengira otomasi GAGAL hanya karena absensi terkirim
  // pukul 13.25 padahal dijadwalkan 13.00. Penjelasan ini harus tetap ada di UI.
  it("menyebut jadwal adalah perkiraan & bisa lebih lambat/awal", () => {
    const berkas = path.join(
      AKAR,
      "app",
      "(app)",
      "automation",
      "automation-form.tsx",
    );
    const isi = readFileSync(berkas, "utf8");
    expect(isi).toMatch(/Waktu kirim bisa meleset/);
    expect(isi).toMatch(/13\.00/);
    expect(isi).toMatch(/13\.25/);
    expect(isi).toMatch(/lebih awal/);
  });
});
