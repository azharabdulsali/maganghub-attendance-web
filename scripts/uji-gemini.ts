/**
 * Skrip diagnosis Gemini.
 *
 * Gunanya: memisahkan "kode saya salah" dari "key/kuota/model bermasalah".
 * Tes biasa memakai `fetch` tiruan dan tidak akan pernah menangkap masalah
 * nyata seperti model yang sudah dihapus Google atau kuota habis.
 *
 * Jalankan: npx tsx scripts/uji-gemini.ts
 *
 * Bacaan hasil:
 *   - "=== SUKSES ==="          -> jalur jaringan & key benar.
 *   - "[report-draft-llm] ..."  -> lihat statusnya:
 *       404     -> model salah (pakai alias `-latest`).
 *       401/403 -> key salah / tidak punya akses.
 *       429     -> kuota habis. Cek https://ai.dev/rate-limit
 *       503     -> server Google sedang sibuk; tunggu, bukan salah Anda.
 *
 * Dilewati (bukan gagal) bila GEMINI_API_KEY belum diisi.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
// env.ts memvalidasi saat impor dan MENOLAK start bila variabel WAJIB kosong.
// Skrip ini hanya butuh jalur Gemini, jadi variabel lain diberi nilai dummy
// yang lolos skema. PENTING: nama variabel harus PERSIS seperti di
// src/lib/env.ts (NEXTAUTH_SECRET, bukan AUTH_SECRET; ENCRYPTION_KEY wajib
// 64 hex; NEXTAUTH_URL wajib URL). Salah nama = skrip langsung melempar
// "Konfigurasi environment bermasalah" sebelum Gemini pernah dipanggil.
process.env.DATABASE_URL ??= "postgresql://uji:uji@localhost:5432/uji";
process.env.DIRECT_URL ??= "postgresql://uji:uji@localhost:5432/uji";
process.env.NEXTAUTH_SECRET ??= "uji-nyata-secret-panjang-sekali-32karakter";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.ENCRYPTION_KEY ??= "0".repeat(64);

async function main() {
  const { geminiDrafter, llmConfigured } = await import("../src/lib/report-draft-llm");

  if (!llmConfigured()) {
    console.log("GEMINI_API_KEY kosong / terlalu pendek -> tidak ada yang diuji.");
    return;
  }

  console.log("Memanggil Gemini...\n");
  const hasil = await geminiDrafter.draft({
    keywords: "memperbaiki bug login, belajar React hooks",
    unit: "Divisi Teknologi",
  });

  console.log("label :", geminiDrafter.label);
  if (hasil === null) {
    console.log("\nGAGAL: drafter mengembalikan null. Lihat peringatan di atas.");
    process.exitCode = 1;
    return;
  }
  console.log("\n=== HASIL NYATA DARI GEMINI ===");
  console.log("AKTIVITAS   :", hasil.activity);
  console.log("PEMBELAJARAN:", hasil.learning);
  console.log("KENDALA     :", hasil.obstacles);
  console.log("=== SUKSES ===");
}

void main();
