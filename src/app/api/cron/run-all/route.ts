// src/app/api/cron/run-all/route.ts: dispatcher cron massal (Tahap 6).
//
// Masalah yang dipecahkan: sebelumnya TIAP user harus menyalin webhookKey-nya
// lalu memasang cron sendiri di cron-job.org. Dengan 20 user itu 20 langkah
// manual yang mudah terlupa. Di sini SATU pemicu admin memanggil endpoint ini
// sekali tiap jam, dan server mengurus sisanya.
//
//   GET /api/cron/run-all
//   Authorization: Bearer <CRON_SECRET>
//
// Alur:
//   1. Cocokkan CRON_SECRET (timing-safe). Salah/kosong → 401; tak diset → 503.
//   2. Ambil semua AutomationConfig.isEnabled = true.
//   3. Pilih yang jam jadwalnya (WIB) = jam sekarang (lihat cron-dispatch.ts).
//   4. Jalankan performSubmit untuk tiap user, PARALEL berbatas (bukan
//      berurutan) supaya 20 user tidak menembus batas waktu fungsi. Satu user
//      gagal TIDAK menggagalkan yang lain.
//
// Jadwal per-user TETAP dihormati: cron berjalan tiap jam, dan tiap user
// diproses pada jam jadwalnya. Menit diabaikan (lihat isDueNow), absensi
// harian tidak butuh ketepatan menit, dan menuntutnya membuat jadwal 07:30
// tak pernah kena pada cron per jam.
//
// Tidak ada rahasia yang dikembalikan: respons hanya berisi hitungan & id user.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { runDispatch } from "@/lib/cron-dispatch-run";
import { bearerTokenFrom } from "@/lib/bearer-token";

// Wajib: fungsi ini mengirim laporan untuk BANYAK user dalam satu pemanggilan.
// Tanpa ini Vercel memakai default (10s di Hobby) dan eksekusi akan dipotong.
export const maxDuration = 60;

/** Bandingkan dua string rahasia dalam waktu tetap (anti side-channel). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function GET(request: Request) {
  // 1. Gerbang rahasia. Bila belum diset, fitur ini memang nonaktif.
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Dispatcher cron belum diaktifkan (CRON_SECRET kosong)." },
      { status: 503 },
    );
  }

  const token = bearerTokenFrom(request.headers.get("authorization")) ?? "";
  if (token.length === 0 || !safeEqual(token, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  // 2–4. Seleksi per jam + kirim. Semua ada di lib bersama (cron-dispatch-run.ts)
  // supaya route ini dan tombol admin memakai aturan yang sama persis.
  const summary = await runDispatch();
  return NextResponse.json(summary);
}
