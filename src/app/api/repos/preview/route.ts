// src/app/api/repos/preview/route.ts: pratinjau commit hari itu (atau tanggal
// tertentu) sebagai bahan draf laporan.
//
// ATURAN PENTING (docs/GIT-COMMITS-PLAN.md §4, §9)
// ------------------------------------------------
// 1. **Tidak menyimpan apa pun ke DB laporan.** Rute ini hanya membaca commit
//    dan mengembalikan ringkasannya. Menyimpan ke form tetap keputusan
//    pengguna di klien. Ini mencegah laporan tercipta tanpa persetujuan.
// 2. **Memakai `ReportDrafter` yang sudah ada.** Tidak ada jalur penyusunan
//    kedua; commit hanya menyuplai `DraftInput.keywords`. Karena itu UI dan
//    rute laporan lama tidak berubah (lihat §5.4).
// 3. **Selalu 200 dengan `ok: false` untuk kegagalan git.** Kegagalan git
//    adalah keadaan normal (token kedaluwarsa, GitHub down), bukan bug
//    aplikasi. Membalas 5xx membuat klien menampilkan "terjadi kesalahan"
//    alih-alih pesan berguna.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { gitPreviewSchema } from "@/lib/validate";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import {
  draftInputFromCommits,
  resolveCommits,
  toCommitView,
} from "@/lib/git-repo-service";
import { getDrafter } from "@/lib/report-draft";

/** Ambil id user dari sesi; null kalau belum login. */
async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** POST, ambil commit untuk satu hari dan susun drafnya. */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Pratinjau memanggil API pihak ketiga, jadi dibatasi agar kuota token
  // pengguna tidak terkuras oleh klik berulang.
  const gate = await enforceRateLimit("gitRepo", rateLimitKey("gitRepo", userId));
  if (!gate.decision.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429, headers: gate.headers },
    );
  }

  let body: unknown = {};
  try {
    // Body opsional: klien boleh mengirim `{}` atau `{ date }`.
    const teks = await request.text();
    body = teks ? JSON.parse(teks) : {};
  } catch {
    return NextResponse.json(
      { error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." },
      { status: 400 },
    );
  }

  const parsed = gitPreviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 },
    );
  }

  const hasil = await resolveCommits(userId, parsed.data.date);

  if (!hasil.ok) {
    // 200 + ok:false: kegagalan git bukan kegagalan aplikasi.
    return NextResponse.json({
      ok: false,
      message: hasil.message,
      date: hasil.date,
      commits: [],
    });
  }

  // `null` = tidak ada bahan yang layak (mis. semua commit generik). Klien
  // WAJIB menampilkan pesan, bukan membuat draf kosong yang terlihat terisi.
  const bahan = draftInputFromCommits(hasil.keywords);

  // Draf disusun lewat `getDrafter()` — jalur SAMA yang dipakai tombol "Susun
  // draf" di form. Jadi commit tidak menambah cara kedua menyusun laporan.
  const draf = bahan
    ? await getDrafter().draft({ keywords: bahan.keywords, date: hasil.date })
    : null;

  return NextResponse.json({
    ok: true,
    date: hasil.date,
    count: hasil.commits.length,
    commits: toCommitView(hasil.commits),
    // Kolom "Pembelajaran" tetap diserahkan ke pengguna (keputusan Fase 3):
    // commit menunjukkan APA yang dikerjakan, bukan APA yang dipelajari.
    // UI memakai penanda ini untuk menyuruh pengguna menyuntingnya.
    draft: draf ? { ...draf, learningNeedsReview: true } : null,
  });
}
