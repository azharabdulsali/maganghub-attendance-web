// src/lib/feedback.ts: aturan Kritik & Saran (MURNI, tanpa DB/jaringan).
//
// Fitur ini SATU ARAH: pengguna mengirim pesan, admin membacanya lalu menandai
// "sudah dibaca". Tidak ada balasan, jadi tidak ada status lain selain
// dibaca/belum.
//
// Batas panjang tinggal di sini supaya penghitung karakter di form memakai
// angka yang SAMA dengan yang divalidasi server (pola sama seperti
// report-rules.ts). Divalidasi dengan Zod karena seluruh input server wajib
// lewat Zod (AGENTS.md §2).

import { z } from "zod";

import type { Tone } from "@/lib/admin";

/** Terlalu pendek = tidak ada isi yang bisa ditindaklanjuti admin. */
export const FEEDBACK_MIN_LENGTH = 10;
/** Batas atas mencegah kiriman raksasa memenuhi DB & halaman admin. */
export const FEEDBACK_MAX_LENGTH = 2000;

/** Panjang pesan SETELAH trim, sama dengan yang disimpan & divalidasi. */
export function countFeedbackLength(value: string): number {
  return value.trim().length;
}

export const feedbackSchema = z.object({
  message: z
    .string()
    .trim()
    .min(
      FEEDBACK_MIN_LENGTH,
      `Tulis minimal ${FEEDBACK_MIN_LENGTH} karakter agar admin bisa menindaklanjuti.`,
    )
    .max(
      FEEDBACK_MAX_LENGTH,
      `Tulis maksimal ${FEEDBACK_MAX_LENGTH} karakter.`,
    ),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

/**
 * Validasi input API. Mengembalikan pesan yang SUDAH di-trim agar baris baru
 * di awal/akhir tidak ikut tersimpan.
 */
export function validateFeedbackInput(
  raw: { message?: unknown },
):
  | { ok: true; message: string }
  | { ok: false; error: string; field: "message" } {
  const parsed = feedbackSchema.safeParse({ message: raw.message });
  if (parsed.success) return { ok: true, message: parsed.data.message };
  return {
    ok: false,
    error:
      parsed.error.issues[0]?.message ??
      "Isi masukan tidak terbaca. Muat ulang halaman lalu coba lagi.",
    field: "message",
  };
}

/** Label status untuk pengguna & admin. MURNI. */
export function describeFeedbackState(readAt: Date | null): string {
  return readAt ? "Sudah dibaca" : "Belum dibaca";
}

/** "Sudah dibaca" hijau, "Belum dibaca" netral (bukan kesalahan pengguna). */
export function feedbackStateTone(readAt: Date | null): Tone {
  return readAt ? "good" : "neutral";
}
