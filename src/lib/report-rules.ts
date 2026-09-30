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
