// src/lib/report-rules.ts: aturan penyusunan laporan yang dipakai beberapa
// tempat sekaligus (form klien, validasi server, pengiriman ke portal).
//
// Kenapa dipisah jadi modul sendiri: aturan ini HARUS sama di tiga tempat.
// Kalau form meloloskan teks yang ditolak server, pengguna baru tahu setelah
// menekan simpan; kalau server meloloskan yang ditolak portal, kita membuang
// satu percobaan submit tanpa alasan.

/**
 * Batas minimal portal Maganghub. Ini aturan PIHAK KETIGA, bukan selera kita,
 * teks di bawah angka ini ditolak portal. Disimpan sebagai konstanta bernama
 * supaya kalau portal berubah, hanya ada satu tempat yang perlu diubah.
 */
export const MIN_REPORT_LENGTH = 100;

/** `maxlength` textarea di portal Maganghub. */
export const MAX_REPORT_LENGTH = 5000;

/**
 * Menghitung panjang teks dengan aturan yang sama seperti bot Python
 * (`len(value.strip()) < 100`) dan seperti portal: spasi berlebih di tepi tidak
 * dihitung.
 *
 * Spasi di TENGAH tetap dihitung, teks "a b" panjangnya 3, bukan 2.
 *
 * `String.prototype.trim()` di JS memangkas semua spasi Unicode di tepi,
 * termasuk NBSP (U+00A0) dan ideographic space (U+3000). Ini penting karena
 * pengguna sering menempel teks dari Word yang ujungnya berisi NBSP, bukan
 * spasi biasa, sudah diuji, bukan asumsi.
 *
 * Yang TIDAK dipangkas: zero-width space (U+200B). Karakter ini tak terlihat
 * tapi dihitung sebagai panjang, jadi teks bisa terlihat "cukup" di mata
 * pengguna namun sebenarnya mengandung karakter tak terlihat. Kita tidak
 * membuangnya otomatis (itu mengubah isi tulisan orang), cukup dihitung apa
 * adanya, sama seperti portal.
 */
export function countReportLength(text: string): number {
  return text.trim().length;
}

/**
 * Memeriksa satu field laporan. Mengembalikan pesan error dalam bahasa
 * Indonesia, atau null kalau valid.
 */
export function checkReportField(text: string): string | null {
  const length = countReportLength(text);

  if (length === 0) {
    return "Wajib diisi.";
  }
  if (length < MIN_REPORT_LENGTH) {
    const kurang = MIN_REPORT_LENGTH - length;
    return `Kurang ${kurang} karakter lagi (minimal ${MIN_REPORT_LENGTH}).`;
  }
  if (length > MAX_REPORT_LENGTH) {
    return `Terlalu panjang (maksimal ${MAX_REPORT_LENGTH} karakter).`;
  }
  return null;
}

/**
 * Menyeragamkan teks sebelum disimpan: pangkas spasi tepi dan samakan akhir
 * baris ke "\n".
 *
 * Akhir baris diseragamkan karena laporan ditulis di Windows (CRLF) tapi bisa
 * juga dibuat di perangkat lain (LF). Kalau tidak disamakan, dua teks yang
 * terlihat sama persis bagi pengguna akan dianggap berbeda oleh sistem, dan
 * jumlah karakternya bisa berbeda satu per baris.
 */
export function normalizeReportText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/**
 * Kata yang sangat sering muncul di laporan magang berbahasa Indonesia.
 *
 * Dipakai sebagai BUKTI POSITIF, bukan daftar hitam. Ini pilihan sadar: daftar
 * kata asing akan selalu ketinggalan zaman, sedangkan kata fungsi Indonesia
 * (dan, yang, saya, pada, dengan, ...) stabil dan hampir mustahil tidak muncul
 * pada kalimat Indonesia yang wajar.
 */
const KATA_INDONESIA = [
  "dan",
  "yang",
  "di",
  "ke",
  "dari",
  "pada",
  "dengan",
  "untuk",
  "saya",
  "kami",
  "kegiatan",
  "hari",
  "ini",
  "kerja",
  "laporan",
  "belajar",
  "kendala",
  "tidak",
  "ada",
  "dalam",
  "adalah",
  "serta",
  "juga",
  "dapat",
  "telah",
  "sudah",
  "melakukan",
  "mengerjakan",
  "selama",
  "hasil",
  "agar",
  "karena",
  "oleh",
  "tersebut",
];

/** Kata fungsi yang sangat khas Inggris. Kemunculannya mencurigakan. */
const KATA_INGGRIS_KHAS = [
  "the",
  "and",
  "with",
  "this",
  "that",
  "from",
  "have",
  "has",
  "was",
  "were",
  "will",
  "would",
  "should",
  "there",
  "their",
  "which",
  "while",
  "about",
  "into",
  "been",
];

/**
 * Benarkah teks ini ditulis dalam bahasa Indonesia?
 *
 * Latar belakang: prompt sudah meminta bahasa Indonesia, tapi model tetap bisa
 * menjawab dalam bahasa Inggris -- dan teks Inggris yang panjang TETAP lolos
 * `checkReportField` (yang hanya memeriksa panjang). Tanpa pemeriksaan ini,
 * laporan berbahasa Inggris bisa masuk ke form dan terkirim ke portal.
 *
 * Sengaja TIDAK memakai daftar hitam kata asing: kata teknis Inggris wajar
 * muncul di laporan magang IT ("login", "deploy", "bug"). Yang diperiksa adalah
 * kata FUNGSI, yang tidak mungkin dominan pada kalimat Indonesia.
 *
 * Mengembalikan `false` juga saat teks terlalu pendek untuk dinilai, supaya
 * pemanggil bisa memperlakukannya sebagai "tidak yakin" dan menolak dengan aman.
 */
export function isIndonesianText(text: string): boolean {
  const kata = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((k) => k.length > 0);

  // Terlalu sedikit kata untuk dinilai -> jangan mengaku yakin.
  if (kata.length < 5) return false;

  const hitung = (daftar: string[]) => {
    const set = new Set(daftar);
    return kata.reduce((n, k) => n + (set.has(k) ? 1 : 0), 0);
  };

  const jumlahIndonesia = hitung(KATA_INDONESIA);
  const jumlahInggris = hitung(KATA_INGGRIS_KHAS);

  // Bukti positif yang kuat: cukup banyak kata fungsi Indonesia.
  // Ambang 2 kata supaya laporan pendek yang wajar tidak ikut ditolak.
  if (jumlahIndonesia >= 2 && jumlahIndonesia > jumlahInggris) return true;

  // Fallback: teks panjang tanpa satu pun kata fungsi Indonesia, tapi banyak
  // kata fungsi Inggris, hampir pasti bukan bahasa Indonesia.
  if (jumlahInggris >= 3 && jumlahIndonesia === 0) return false;

  // Di antaranya: tidak yakin. Terima selama ada bukti Indonesia.
  return jumlahIndonesia > 0;
}
