// src/lib/commit-draft-service.ts: menyusun draf dari commit hari itu LALU
// MENYIMPANNYA sebagai template bertanggal.
//
// KENAPA DISIMPAN, BUKAN SEKADAR DIKEMBALIKAN
// -------------------------------------------
// Diputuskan pemilik: draf dari commit harus bisa dibuka dan disunting di
// /report-templates sebelum jam kirim. Itu hanya mungkin kalau ia punya tempat
// tinggal, dan tempat yang sudah ada adalah `DatedReportTemplate` (unik per
// userId+date). Jadi tidak ada tabel baru.
//
// ATURAN YANG DIJAGA
// ------------------
// 1. **Suntingan manusia tidak pernah ditimpa.** Bila baris bertanggal untuk
//    hari itu sudah ada — apa pun asalnya — fungsi ini TIDAK menulis apa pun.
//    Cron jalan berkali-kali sehari (atau di-retry), dan commit bisa bertambah
//    setelah pengguna menyunting draf. Menimpanya berarti membuang pekerjaan
//    pengguna tanpa persetujuan.
// 2. **Kegagalan git tidak pernah melempar.** Sama seperti `resolveCommits`:
//    bila commit tidak bisa diambil, laporan tetap harus bisa dikirim dari
//    template (keputusan pemilik: "tetap kirim template harian").
// 3. **Tidak ada commit → tidak menulis apa pun.** Mengembalikan `null` supaya
//    pemanggil jatuh ke template, bukan menyimpan laporan karangan.

import { prisma } from "./prisma";
import { draftInputFromCommits, resolveCommits } from "./git-repo-service";
import { getDrafter } from "./report-draft";
import { learningFromCommits } from "./commit-learning";
import type { ReportContent } from "./report-source";

/** Hasil penyusunan draf commit untuk satu tanggal. */
export type CommitDraftOutcome =
  /** Disusun BARU dan sudah tersimpan sebagai template bertanggal. */
  | { kind: "SAVED"; content: ReportContent }
  /** Sudah ada template bertanggal hari itu (tulisan/pra-susun sendiri) — tidak ditimpa. */
  | { kind: "ALREADY_EXISTS" }
  /** Tidak ada commit, atau commit tidak layak dijadikan bahan. */
  | { kind: "NO_COMMITS"; reason: string }
  /** Commit ada tetapi penyusunan/simpan gagal. Laporan tetap bisa dikirim dari template. */
  | { kind: "FAILED"; reason: string };

/** Ubah `YYYY-MM-DD` (tanggal laporan) menjadi Date untuk kolom `@db.Date`. */
function keTanggal(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Susun draf tiga kolom dari commit `userId` pada `date`, lalu simpan sebagai
 * template bertanggal bila belum ada.
 *
 * Tidak pernah melempar: semua kegagalan menjadi `kind` yang bisa dilaporkan.
 */
export async function prepareCommitDraft(
  userId: string,
  date: string,
): Promise<CommitDraftOutcome> {
  // Cek lebih dulu, sebelum memanggil API git: kalau pengguna sudah punya
  // template untuk hari ini, tidak ada gunanya menguras kuota token dan
  // menunggu jaringan hanya untuk hasil yang akan dibuang.
  const sudahAda = await prisma.datedReportTemplate
    .findUnique({ where: { userId_date: { userId, date: keTanggal(date) } } })
    .catch(() => null);
  if (sudahAda) return { kind: "ALREADY_EXISTS" };

  const hasilGit = await resolveCommits(userId, date).catch(() => null);
  if (!hasilGit || !hasilGit.ok) {
    return {
      kind: "NO_COMMITS",
      reason: hasilGit && !hasilGit.ok ? hasilGit.message : "Gagal mengambil commit.",
    };
  }

  // `null` = tidak ada bahan yang layak (mis. semua commit generik). Jangan
  // membuat draf kosong yang terlihat terisi.
  const bahan = draftInputFromCommits(hasilGit.keywords);
  if (!bahan) {
    return { kind: "NO_COMMITS", reason: "Tidak ada commit yang bisa dipakai hari itu." };
  }

  try {
    // Kolom "Pembelajaran" diturunkan dari BUKTI commit (jenis perubahan &
    // topiknya), bukan dikarang dari template. Bila bukti tidak cukup,
    // `learningFromCommits` mengembalikan `null` dan penyusun memakai kalimat
    // netral — kolom tidak pernah diisi klaim tanpa dasar.
    const learning = learningFromCommits(hasilGit.commits) ?? undefined;
    const draf = await getDrafter().draft({ keywords: bahan.keywords, date, learning });
    const content: ReportContent = {
      activity: draf.activity,
      learning: draf.learning,
      obstacles: draf.obstacles,
    };

    // `create` (bukan `upsert`) disengaja: bila baris sudah dibuat orang lain
    // di antara pengecekan di atas dan titik ini, `create` akan melempar galat
    // unik dan kita TIDAK menimpa apa pun. Itu perilaku yang benar di sini.
    await prisma.datedReportTemplate.create({
      data: { userId, date: keTanggal(date), ...content },
    });

    return { kind: "SAVED", content };
  } catch (err) {
    // Galat unik = balapan dengan penulisan lain; perlakukan seperti sudah ada.
    if (isUniqueViolation(err)) return { kind: "ALREADY_EXISTS" };
    return {
      kind: "FAILED",
      reason: "Draf dari commit gagal disusun atau disimpan.",
    };
  }
}

/** True bila galat Prisma adalah pelanggaran kunci unik (P2002). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Helper untuk pemanggil yang hanya butuh isinya. */
export function contentOf(outcome: CommitDraftOutcome): ReportContent | null {
  return outcome.kind === "SAVED" ? outcome.content : null;
}
