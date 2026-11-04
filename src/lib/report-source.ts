// src/lib/report-source.ts: memilih SUMBER ISI laporan untuk satu tanggal
// (MURNI, tanpa DB/jaringan).
//
// KENAPA TERPISAH DARI template-selection.ts
// -----------------------------------------
// `template-selection.ts` menjawab "template mana?" — ia hanya mengenal template
// bertanggal dan template harian. Commit git adalah jenis bahan KETIGA yang
// aturannya berbeda: ia bukan tulisan pengguna, ia bisa gagal diambil, dan ia
// bisa kosong (pengguna tidak commit hari itu). Mencampurkan aturan itu ke
// `chooseTemplate` akan membuat satu fungsi punya dua sumbu keputusan.
//
// URUTAN (diputuskan pemilik, jangan diubah sendiri)
// --------------------------------------------------
//   1. Commit hari itu      -> itu yang paling faktual tentang pekerjaan hari ini
//   2. Template bertanggal  -> tulisan pengguna khusus untuk tanggal ini
//   3. Template harian      -> tulisan pengguna yang dipakai berulang
//   4. Tidak ada satu pun   -> BATAL; jangan mengarang laporan
//
// Aturan 1 menang atas 2 dan 3 karena isi laporan seharusnya mencerminkan apa
// yang BENAR-BENAR dikerjakan. Template hanya cadangan saat commit tidak ada.

/** Tiga kolom laporan. Bentuk minimal yang dibutuhkan untuk mengirim. */
export interface ReportContent {
  activity: string;
  learning: string;
  obstacles: string;
}

/** Dari mana isi laporan berasal. */
export type ReportSource = "COMMITS" | "DATED" | "DAILY" | "NONE";

export interface ReportSourceChoice {
  /** Isi yang dipakai, atau `null` bila tidak ada bahan sama sekali. */
  content: ReportContent | null;
  source: ReportSource;
}

/** Bahan commit yang sudah disusun menjadi tiga kolom, atau `null`. */
export type CommitDraft = ReportContent | null | undefined;

/**
 * Pilih isi laporan untuk `date` (format `YYYY-MM-DD`).
 *
 * `commitDraft` adalah hasil penyusunan draf dari commit hari itu. Ia boleh
 * `null`/`undefined` — itu artinya tidak ada commit, commit tidak layak dipakai,
 * atau pengambilan commit gagal. Ketiga keadaan itu diperlakukan SAMA: jatuh ke
 * template. Bedanya hanya perlu dilihat UI/log, bukan keputusan isi laporan.
 */
export function chooseReportContent(
  date: string,
  commitDraft: CommitDraft,
  daily: ReportContent | null,
  dated: ReadonlyArray<{ date: string } & ReportContent>,
): ReportSourceChoice {
  // 1. Commit hari itu. Diterima hanya bila ketiga kolom benar-benar terisi:
  //    draf setengah jadi (mis. penyusun gagal di tengah) tidak boleh dikirim
  //    sebagai laporan, karena portal akan menolak kolom kosong.
  if (commitDraft && isComplete(commitDraft)) {
    return { content: { ...commitDraft }, source: "COMMITS" };
  }

  // 2. Template bertanggal untuk tanggal ini.
  const match = dated.find((t) => t.date === date);
  if (match && isComplete(match)) {
    return {
      content: {
        activity: match.activity,
        learning: match.learning,
        obstacles: match.obstacles,
      },
      source: "DATED",
    };
  }

  // 3. Template harian.
  if (daily && isComplete(daily)) {
    return { content: { ...daily }, source: "DAILY" };
  }

  // 4. Tidak ada bahan yang layak. Pemanggil WAJIB membatalkan pengiriman
  //    (NO_TEMPLATE), bukan mengirim laporan kosong.
  return { content: null, source: "NONE" };
}

/** True bila ketiga kolom berisi teks (bukan hanya spasi). */
function isComplete(content: ReportContent): boolean {
  return (
    content.activity.trim() !== "" &&
    content.learning.trim() !== "" &&
    content.obstacles.trim() !== ""
  );
}

/** Label Indonesia untuk sumber isi laporan, dipakai di UI/riwayat. */
export function describeReportSource(source: ReportSource): string {
  switch (source) {
    case "COMMITS":
      return "Commit hari ini";
    case "DATED":
      return "Template khusus tanggal";
    case "DAILY":
      return "Template harian";
    case "NONE":
      return "Tidak ada bahan laporan";
  }
}
