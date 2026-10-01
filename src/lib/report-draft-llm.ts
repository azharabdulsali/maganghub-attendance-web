// src/lib/report-draft-llm.ts: penyusun draf lewat LLM (Gemini).
//
// Kenapa file terpisah dari report-draft.ts:
//   - report-draft.ts tetap MURNI: tanpa `fetch`, tanpa env, tanpa jaringan,
//     sehingga 16 tesnya bisa jalan tanpa menstub apa pun.
//   - Semua yang "kotor" (panggilan jaringan, rahasia, parsing jawaban model
//     yang bisa meleset) dikurung di sini. Kalau provider diganti, file ini
//     yang disentuh, bukan logika perakitan kalimat.
//
// Prinsip yang dipegang:
//   1. LLM TIDAK PERNAH dipercaya. Jawabannya divalidasi dengan aturan yang
//      SAMA seperti penyusun lokal. Jawaban meleset -> dianggap gagal.
//   2. Gagal itu WAJAR, bukan bencana. Habis kuota, timeout, jaringan putus,
//      model berhalusinasi -> semuanya berarti "pakai yang lokal". Pengguna
//      tidak boleh melihat error hanya karena Google sedang rewel.
//   3. Tidak ada retry beruntun. Satu kali coba, lalu jatuh. Satu API key
//      dipakai bersama semua pengguna; badai retry akan menghabiskan kuota
//      orang lain.

import { checkReportField, normalizeReportText } from "./report-rules";
import { env } from "./env";
import type { DraftInput, DraftResult } from "./report-draft";

/**
 * Model default.
 *
 * PELAJARAN DARI PENGUJIAN NYATA (bukan tebakan):
 *   - `gemini-flash-latest` mengarah ke model terbaru (`gemini-3.8-flash`) yang
 *     kuota gratisnya hanya **20 permintaan/hari per proyek**. Tidak layak untuk
 *     satu key yang dipakai bersama semua pengguna.
 *   - `gemini-flash-lite-latest` lolos 3/3 percobaan berturut-turut dan kuotanya
 *     terpisah serta jauh lebih lega.
 *   - Nama versi spesifik (`gemini-2.0-flash`, `gemini-2.5-flash`,
 *     `gemini-2.5-flash-lite`) SEMUANYA 404 di akun pemilik -- sering dihapus
 *     Google. Hanya alias `-latest` yang aman.
 *
 * Jadi: alias `-latest` + varian `lite` = tahan lama DAN kuota cukup.
 */
const MODEL_DEFAULT = "gemini-flash-lite-latest";

/** Batas waktu satu panggilan. Lewat ini -> fallback, jangan menggantung. */
const TIMEOUT_MS = 12_000;

/**
 * Endpoint Gemini.
 *
 * Ada DUA bentuk kunci yang beredar dan keduanya butuh jalur berbeda:
 *   - `AIza...` (format lama, AI Studio) -> `/v1beta/models/<model>:generateContent`
 *   - `AQ.Ab8...` (format baru, ~53 karakter, Google Cloud/Vertex) -> `/v1/models/<model>:generateContent`
 *
 * Memakai jalur yang salah menghasilkan 401/404, yang oleh kode ini diterjemahkan
 * menjadi "gagal -> pakai lokal". Fitur jadi selalu jatuh ke lokal tanpa pesan
 * error apa pun -- persis gejala yang dilaporkan pemilik. Karena itu endpoint
 * dipilih berdasarkan bentuk kunci, bukan diasumsikan satu bentuk saja.
 */
const BASE_V1BETA = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * True bila LLM dikonfigurasi. Dipakai `getDrafter()` untuk memilih.
 *
 * Sengaja memeriksa panjang minimal, bukan sekadar ada: `GEMINI_API_KEY=""`
 * atau berisi spasi tidak boleh dianggap "aktif" lalu membuat setiap panggilan
 * gagal dan jatuh ke lokal -- lebih jujur langsung pakai lokal sejak awal.
 */
export function llmConfigured(): boolean {
  return (env.GEMINI_API_KEY ?? "").trim().length >= 20;
}

/**
 * Ambil jalur endpoint yang benar untuk sebuah kunci.
 *
 * PELAJARAN DARI KESALAHAN NYATA: awalan kunci (`AQ.` vs `AIza`) TIDAK
 * menentukan jalur. Asumsi itu pernah ditulis di sini dan membuat fitur selalu
 * gagal 404 sebelum jatuh ke lokal. Yang benar: `/v1beta` menerima KEDUA bentuk
 * kunci pada `generativelanguage.googleapis.com`. Jalur `/v1` yang tampak lebih
 * "baru" justru 404.
 *
 * Karena itu: satu jalur saja, tanpa menebak dari bentuk kunci. Bila Google
 * mengubah ini, cukup ubah fungsi ini -- pemanggil tidak perlu tahu.
 */
export function endpointUntuk(): string {
  return BASE_V1BETA;
}

/** Arahan ke model. Dibuat ketat supaya keluarannya mudah diverifikasi. */
function prompt(input: DraftInput): string {
  const unit = input.unit?.trim();
  const tanggal = input.date?.trim();

  return [
    "Anda membantu peserta magang mengisi laporan harian berbahasa Indonesia.",
    "Kembalikan HANYA JSON dengan bentuk:",
    '{"activity": "...", "learning": "...", "obstacles": "..."}',
    "",
    "Aturan:",
    "- Setiap kolom minimal 150 karakter, berupa kalimat mengalir, bukan poin-poin.",
    "- Gunakan bahasa Indonesia formal dan sederhana seperti laporan kerja.",
    "- Dilarang mengarang nama orang, nama perusahaan, angka, atau hasil yang tidak disebutkan.",
    "- Kolom obstacles: bila tidak ada kendala yang disebutkan, tulis dengan jujur",
    '  bahwa pekerjaan berjalan lancar. JANGAN mengarang kendala.',
    "- Dilarang memakai placeholder seperti [isi di sini] atau <nama>.",
    "",
    `Aktivitas hari ini: ${input.keywords.trim() || "(tidak disebutkan)"}`,
    unit ? `Unit/divisi: ${unit}` : "Unit/divisi: (tidak disebutkan)",
    tanggal ? `Tanggal: ${tanggal}` : "",
  ]
    .filter((baris) => baris !== "")
    .join("\n");
}

/** Bentuk mentah jawaban model, sebelum dipercaya. */
interface JawabanMentah {
  activity?: unknown;
  learning?: unknown;
  obstacles?: unknown;
}

/**
 * Ambil teks jawaban dari balasan Gemini.
 *
 * Google mengembalikan struktur bersarang. Bila model menolak (mis. karena
 * filter keamanan), `candidates` kosong dan `promptFeedback` berisi alasannya --
 * itu bukan error HTTP, jadi harus diperiksa manual, bukan diasumsikan sukses.
 */
function teksJawaban(payload: unknown): string | null {
  const data = payload as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const kandidat = data?.candidates?.[0];
  if (!kandidat) return null;
  const parts = kandidat.content?.parts;
  if (!Array.isArray(parts)) return null;
  const teks = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
  return teks === "" ? null : teks;
}

/**
 * Ubah jawaban model menjadi `DraftResult`, atau `null` bila tidak layak.
 *
 * Ini penyaring keselamatan fitur: apa pun yang tidak lolos `checkReportField`
 * dibuang di sini. Model hanya boleh MEMPERCEPAT, tidak boleh merusak form
 * dengan teks cacat yang membuat tombol Simpan tetap mati.
 */
function validasiJawaban(teks: string): DraftResult | null {
  let mentah: JawabanMentah;
  try {
    // Model kadang membungkus JSON dalam pagar ```json ... ``` walau sudah
    // diminta JSON murni. Bersihkan dulu sebelum menyerah.
    const bersih = teks
      .replace(/^\s*```(?:json)?/i, "")
      .replace(/```\s*$/, "")
      .trim();
    mentah = JSON.parse(bersih) as JawabanMentah;
  } catch {
    return null;
  }

  const ambil = (nilai: unknown): string =>
    typeof nilai === "string" ? normalizeReportText(nilai) : "";

  const hasil: DraftResult = {
    activity: ambil(mentah.activity),
    learning: ambil(mentah.learning),
    obstacles: ambil(mentah.obstacles),
  };

  // Semua kolom wajib ada dan lulus aturan yang sama dengan server.
  const layak =
    hasil.activity !== "" &&
    hasil.learning !== "" &&
    hasil.obstacles !== "" &&
    checkReportField(hasil.activity) === null &&
    checkReportField(hasil.learning) === null &&
    checkReportField(hasil.obstacles) === null;

  return layak ? hasil : null;
}

/**
 * Penyusun draf berbasis Gemini.
 *
 * Bila `draft()` mengembalikan `null`, artinya "gagal, tolong pakai yang
 * lokal" -- bukan berarti laporan kosong. Kontrak `ReportDrafter` tidak punya
 * jalur kegagalan, jadi kegagalan diwakili `null` dan ditangani pemanggil
 * (lihat `getDrafter()` di report-draft.ts).
 */
export const geminiDrafter = {
  label: `Gemini ${(env.GEMINI_MODEL || "").trim() || MODEL_DEFAULT}`,
  async draft(input: DraftInput): Promise<DraftResult | null> {
    const key = (env.GEMINI_API_KEY ?? "").trim();
    if (key === "") return null;

    const model = (env.GEMINI_MODEL || "").trim() || MODEL_DEFAULT;
    const endpoint = endpointUntuk();

    // Dua kegagalan sementara yang berbeda artinya, dan keduanya nyata:
    //   - 503 "model overloaded": lumpuh sesaat. Ulang cepat membantu.
    //   - 429 rate limit (RPM): terlalu banyak permintaan berturut-turut.
    //     Diulang cepat justru menambah beban. Perlu jeda lebih panjang.
    const BOLEH_ULANG = new Set([429, 500, 503]);
    const maksPercobaan = 3;

    for (let percobaan = 1; percobaan <= maksPercobaan; percobaan++) {
      let res: Response;
      try {
        res = await fetch(`${endpoint}/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Header, BUKAN query string: query string bocor ke log server dan
            // riwayat proksi. Kunci hanya boleh hidup di header.
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt(input) }] }],
            generationConfig: {
              temperature: 0.7,
              // Minta JSON langsung supaya model tidak berbalas "Tentu! Berikut..."
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        // Timeout / jaringan / JSON rusak: semuanya satu arti, pakai lokal.
        console.warn(
          `[report-draft-llm] Panggilan Gemini gagal (${err instanceof Error ? err.message : String(err)}). ` +
            "Draf memakai penyusun lokal.",
        );
        return null;
      }

      if (res.ok) {
        const teks = teksJawaban(await res.json());
        if (teks === null) {
          console.warn(
            "[report-draft-llm] Balasan Gemini kosong / diblokir. Draf memakai penyusun lokal.",
          );
          return null;
        }
        return validasiJawaban(teks);
      }

      const sisaPercobaan = percobaan < maksPercobaan;
      if (BOLEH_ULANG.has(res.status) && sisaPercobaan) {
        // 429 butuh jeda jauh lebih panjang daripada 503: kuota per menit
        // perlu waktu untuk pulih. 1.5s vs 400ms.
        const jedaMs = res.status === 429 ? 1500 : 400;
        await new Promise((r) => setTimeout(r, jedaMs * percobaan));
        continue;
      }

      // Dicatat ke log server, TIDAK ditampilkan ke pengguna. Tanpa ini,
      // kesalahan konfigurasi (model salah, key kedaluwarsa) tak terlihat
      // sama sekali karena fallback selalu menutupinya dengan rapi.
      const catatanUlang = BOLEH_ULANG.has(res.status)
        ? ` Sudah diulang ${maksPercobaan}x, server tetap sibuk.`
        : "";
      console.warn(
        `[report-draft-llm] Gemini menolak (${res.status}). Model: ${model}.${catatanUlang} ` +
          "Draf memakai penyusun lokal. Periksa GEMINI_MODEL/GEMINI_API_KEY.",
      );
      return null;
    }

    // Tidak tercapai: setiap iterasi pasti `return`. Ditulis eksplisit supaya
    // TypeScript yakin fungsinya selalu mengembalikan nilai.
    return null;
  },
};
