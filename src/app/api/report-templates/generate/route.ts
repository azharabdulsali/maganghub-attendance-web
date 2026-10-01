// src/app/api/report-templates/generate/route.ts: susun draf 3 kolom laporan.
//
// Kenapa rute terpisah, bukan menumpang PUT /api/report-templates: menyusun
// draf TIDAK menyimpan apa pun. Pengguna harus bisa meninjau & mengedit hasil
// sebelum menekan Simpan. Menggabungkannya ke PUT akan membuat tombol
// "Generate" diam-diam menimpa template tersimpan, itu berbahaya.
//
// Penyusunnya sendiri murni (lihat src/lib/report-draft.ts), jadi rute ini
// hanya: periksa sesi → batasi laju → validasi input → panggil drafter.
// Bila kelak drafter LLM diaktifkan, bentuk rute ini tidak perlu berubah.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { reportDraftSchema } from "@/lib/validate";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { draftWithFallback } from "@/lib/report-draft";

/** POST, kembalikan draf {activity, learning, obstacles} tanpa menyimpan. */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Batasi per pengguna: menyusun draf murah, tapi ini tetap pemakaian sumber
  // daya dan (bila kelak LLM) memanggil layanan luar. Batas longgar supaya
  // tidak mengganggu pemakaian normal.
  const gate = await enforceRateLimit("reportDraft", `report-draft:${userId}`);
  if (!gate.decision.allowed) {
    return NextResponse.json(
      { error: "Terlalu sering menyusun draf. Coba lagi sebentar lagi." },
      { status: 429, headers: gate.headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan salah" }, { status: 400 });
  }

  const parsed = reportDraftSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Data tidak valid" },
      { status: 400, headers: gate.headers },
    );
  }

  // `draftWithFallback` memilih penyusun (LLM bila key terpasang) DAN menjaga
  // jaring pengaman: bila LLM gagal, kuota habis, atau timeout, draf tetap
  // pulang memakai penyusun lokal. Pengguna tidak perlu tahu providernya
  // sedang bermasalah, cukup dapat laporannya.
  const { hasil, label, fallback } = await draftWithFallback(parsed.data);

  return NextResponse.json(
    {
      ...hasil,
      // Label jujur tentang apa yang BENAR-BENAR menyusun draf ini, termasuk
      // saat turun ke lokal karena LLM gagal. UI sudah menampilkannya apa ada
      // apa, jadi tidak perlu perubahan di form.
      source: label,
      // Ditandai agar kegagalan provider bisa dicatat/dipantau tanpa harus
      // membongkar balasan. Ini bukan error bagi pengguna.
      providerFallback: fallback,
    },
    { status: 200, headers: gate.headers },
  );
}
