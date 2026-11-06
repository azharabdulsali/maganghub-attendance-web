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
import {
  draftInputFromCommits,
  resolveCommits,
} from "@/lib/git-repo-service";

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
    return NextResponse.json({ error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." }, { status: 400 });
  }

  const parsed = reportDraftSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Data tidak valid" },
      { status: 400, headers: gate.headers },
    );
  }

  // Ambil commit hari itu sebagai bahan. Ini SENGAJA dibungkus try/catch di
  // sini meskipun `resolveCommits` sudah berjanji tidak melempar: janji itu
  // milik modul lain, dan tombol Susun draf tidak boleh ikut mati bila modul
  // itu keliru di kemudian hari. SPEC §5.4a: kegagalan git tidak boleh
  // menghalangi penyusunan laporan dengan cara biasa.
  const hasilGit = await resolveCommits(userId).catch(() => null);
  const bahanGit =
    hasilGit?.ok === true ? draftInputFromCommits(hasilGit.keywords) : null;

  // Kenapa kata kunci ketikan pengguna MENANG, bukan commit: pengguna yang
  // mengetik kata kunci sedang menyatakan maksudnya secara sadar. Commit hanya
  // bahan otomatis. Menimpanya diam-diam akan membuat laporan berisi hal yang
  // tidak diminta.
  const ketikan = parsed.data.keywords.trim();
  const keywords = ketikan !== "" ? ketikan : (bahanGit?.keywords ?? "");

  // Asal bahan dilaporkan apa adanya, supaya UI bisa jujur soal apakah commit
  // benar-benar terpakai atau tidak.
  const commitCount =
    hasilGit?.ok === true && bahanGit ? hasilGit.commits.length : 0;
  const gitStatus: "used" | "no-commits" | "unavailable" | "ignored" =
    ketikan !== ""
      ? "ignored"
      : bahanGit
        ? "used"
        : hasilGit?.ok === true
          ? "no-commits"
          : "unavailable";

  // `draftWithFallback` memilih penyusun (LLM bila key terpasang) DAN menjaga
  // jaring pengaman: bila LLM gagal, kuota habis, atau timeout, draf tetap
  // pulang memakai penyusun lokal. Pengguna tidak perlu tahu providernya
  // sedang bermasalah, cukup dapat laporannya.
  const { hasil, label, fallback } = await draftWithFallback({
    ...parsed.data,
    keywords,
  });

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
      // Asal bahan draf. `used` berarti commit hari itu benar-benar dipakai.
      // `unavailable` sengaja TIDAK membawa pesan galat git: pengguna tidak
      // meminta fitur git di sini, jadi kegagalannya bukan urusannya dan tidak
      // boleh muncul sebagai error merah di form laporan.
      git: {
        status: gitStatus,
        commitCount,
        // Kolom "Pembelajaran" tidak diisi dari commit (keputusan Fase 3):
        // commit menunjukkan APA yang dikerjakan, bukan APA yang dipelajari.
        learningNeedsReview: gitStatus === "used",
      },
    },
    { status: 200, headers: gate.headers },
  );
}
