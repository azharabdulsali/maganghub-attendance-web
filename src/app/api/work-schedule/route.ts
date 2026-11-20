// src/app/api/work-schedule/route.ts: jadwal kerja mingguan milik pengguna.
//
// Satu pengguna punya satu baris `WorkSchedule` (userId @unique) berisi hari
// kerja (ISO-8601: 1=Senin … 7=Minggu). Jadwal ini yang menentukan kapan
// otomasi (cron, dispatch, tombol jalankan admin) benar-benar mengirim laporan,
// hari mana yang ditandai libur di kalender, dan tanggal mana yang bisa dipilih
// di pemilih tanggal.
//
// Keamanan & konsistensi (sama seperti route template):
//   - Hanya pemilik sesi yang boleh membaca/menyentuh jadwalnya sendiri.
//   - Body TIDAK memuat userId; selalu dari sesi.
//   - Jadwal bukan rahasia, boleh dikembalikan penuh ke klien.
//   - Menyimpan jadwal TIDAK mengirim laporan apa pun; ia hanya mengubah
//     kebijakan hari kerja yang dipakai bersama oleh semua jalur kirim.
//
// Gagal-lunak ada di sisi BACA (`loadWorkSchedule`: tanpa baris/DB error →
// Senin–Jumat). Sisi SIMPAN sengaja tidak gagal-lunak: kalau DB menolak, route
// membalas pesan ramah supaya pengguna tidak mengira jadwalnya tersimpan.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { workScheduleSchema } from "@/lib/validate";
import { normalizeWorkDays, type WorkDay } from "@/lib/work-schedule";
import { loadWorkScheduleState, saveWorkSchedule } from "@/lib/work-schedule-repo";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * GET, jadwal kerja milik user yang sedang masuk.
 *
 * `exists: false` berarti pengguna belum pernah menyimpan jadwal dan yang
 * dikembalikan adalah default Senin–Jumat. Bedanya penting untuk UI: pengguna
 * baru melihat centang bawaan, bukan daftar kosong.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const state = await loadWorkScheduleState(userId);
  return NextResponse.json(state);
}

/** PUT, simpan jadwal kerja (upsert: satu baris per pengguna). */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const gate = await enforceRateLimit(
    "workSchedule",
    rateLimitKey("workSchedule", userId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak perubahan. Coba lagi dalam ${Math.ceil(
          gate.decision.retryAfterSeconds / 60,
        )} menit.`,
      },
      { status: 429, headers: gate.headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." },
      { status: 400 },
    );
  }

  const parsed = workScheduleSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Data tidak valid",
        field: typeof field === "string" ? field : undefined,
      },
      { status: 400 },
    );
  }

  // Normalisasi di sini juga (bukan hanya di repo): duplikat & urutan dirapikan
  // supaya yang disimpan deterministik, dan skema sudah menjamin tidak kosong.
  const days: WorkDay[] = normalizeWorkDays(parsed.data.days);

  try {
    const saved = await saveWorkSchedule(userId, days);
    return NextResponse.json({ ok: true, days: saved }, { status: 200 });
  } catch {
    // Jangan bocorkan pesan DB ke klien; pengguna hanya perlu tahu apa yang
    // harus dilakukan berikutnya. Detail asli tetap ada di log server (Prisma
    // mencetaknya sendiri), tidak di sini.
    return NextResponse.json(
      {
        error:
          "Jadwal kerja belum tersimpan karena layanan sedang bermasalah. Coba lagi beberapa saat lagi.",
      },
      { status: 500 },
    );
  }
}
