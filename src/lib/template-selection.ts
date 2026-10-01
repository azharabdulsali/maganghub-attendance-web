// src/lib/template-selection.ts: memilih template mana yang dipakai untuk satu
// tanggal (MURNI, tanpa DB/jaringan).
//
// Kenapa modul terpisah: keputusan ini menentukan ISI laporan yang terkirim ke
// portal. Kalau salah, pengguna bisa mengirim template harian padahal sudah
// menyiapkan template khusus untuk tanggal itu — kesalahan yang tidak terlihat
// sampai laporan sudah terkirim (portal tidak bisa ditarik kembali).
//
// Aturan (diputuskan pemilik, jangan diubah sendiri):
//   1. Template bertanggal untuk tanggal yang SAMA menang atas template harian.
//   2. Bila tidak ada, pakai template harian. Tidak ada tanggal yang "kosong"
//      selama template harian terisi.
//   3. Tidak ada template sama sekali (keduanya kosong) → `null`; pemanggil
//      menandainya NO_TEMPLATE dan membatalkan sebelum menyentuh portal.
//
// Yang SENGAJA TIDAK dilakukan di sini: memeriksa hari libur. Itu urusan
// report-policy.ts (`decide()`). Memisahkannya menjaga satu aturan di satu
// tempat: menyimpan template bertanggal TIDAK pernah membuat otomasi mengirim
// di hari libur.

/** Tiga kolom laporan. Bentuk minimal yang dibutuhkan untuk memilih. */
export interface TemplateContent {
  activity: string;
  learning: string;
  obstacles: string;
}

/** Alasan pemilihan, berguna untuk audit log & pengujian. */
export type TemplateSource = "DATED" | "DAILY" | "NONE";

export interface TemplateChoice {
  /** Isi yang dipakai, atau `null` bila tidak ada template sama sekali. */
  template: TemplateContent | null;
  /** Dari mana isi itu berasal. */
  source: TemplateSource;
}

/**
 * Pilih template untuk `date` (format `YYYY-MM-DD`).
 *
 * `dated` adalah daftar template bertanggal milik SATU pengguna; yang tanggalnya
 * sama persis dengan `date` akan dipakai. Perbandingan tanggal dilakukan
 * sebagai string karena format `YYYY-MM-DD` sudah berurutan secara
 * leksikografis = kronologis, jadi tidak perlu mengurai tanggal maupun zona
 * waktu (ingat: tanggal laporan adalah tanggal kalender polos).
 *
 * Bila ada lebih dari satu kandidat bertanggal dengan tanggal sama, diambil
 * yang PERTAMA, tetapi pemanggil seharusnya sudah mencegahnya lewat
 * `@@unique([userId, date])`. Fungsi ini tidak melempar dalam kasus itu supaya
 * data lama yang aneh tetap bisa dikirim, bukan membuat otomasi berhenti.
 */
export function chooseTemplate(
  date: string,
  daily: TemplateContent | null,
  dated: ReadonlyArray<{ date: string } & TemplateContent>,
): TemplateChoice {
  const match = dated.find((t) => t.date === date);
  if (match) {
    return {
      template: {
        activity: match.activity,
        learning: match.learning,
        obstacles: match.obstacles,
      },
      source: "DATED",
    };
  }
  if (daily) {
    return { template: { ...daily }, source: "DAILY" };
  }
  return { template: null, source: "NONE" };
}

/** Label Indonesia untuk sumber template, dipakai di UI/riwayat. */
export function describeTemplateSource(source: TemplateSource): string {
  switch (source) {
    case "DATED":
      return "Template khusus tanggal";
    case "DAILY":
      return "Template harian";
    case "NONE":
      return "Tidak ada template";
  }
}
