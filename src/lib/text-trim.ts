// src/lib/text-trim.ts: memotong teks panjang ke batas karakter TANPA memotong
// kata di tengah, dan bila perlu MENYELESAIKAN kalimatnya dengan tanda baca
// yang pantas alih-alih menggantung dengan elipsis.
//
// KENAPA MODUL SENDIRI, BUKAN `slice()` DI TEMPAT PEMAKAIAN
// --------------------------------------------------------
// Ada tiga pemakai dengan kebutuhan yang sama (draf commit, draf LLM, dan
// penyusun lokal), dan `String.slice()` yang ditulis di masing-masing tempat
// akan menyimpang satu sama lain. Yang paling berbahaya justru bentuk naif
// `text.slice(0, 200)`: ia memotong kata terakhir menjadi potongan seperti
// "menye" yang tetap lolos semua validasi panjang dan masuk ke laporan.
//
// KENAPA TIDAK SELALU DIAKHIRI ELIPSIS
// ------------------------------------
// Teks ini dibaca manusia sebagai laporan magang, bukan cuplikan log. Laporan
// yang berakhir "…" terbaca seperti tulisan yang belum selesai, dan laporan
// yang secara harfiah berakhir dengan tiga titik ("...") terbaca seperti
// kesalahan penulisan. Bila titik potong yang rapi jatuh terlalu pendek
// (`min`), kita memilih memotong di TENGAH KLAUSA lalu menutupnya dengan
// tanda baca yang membuatnya tetap kalimat utuh -- lihat `tutupKalimat`.
//
// ATURAN YANG DIJAGA
// ------------------
// 1. **Potong di batas kata.** Bila potongan terakhir bukan kata utuh, kata itu
//    dibuang (bukan dipotong separuh).
// 2. **Jangan pernah menambah panjang.** Hasil SELALU <= `max` karakter,
//    termasuk saat kita menambahkan elipsis atau tanda penutup.
// 3. **Kalimat utuh lebih diutamakan.** Bila ada akhir kalimat (`.`/`!`/`?`)
//    pada separuh terakhir jendela, potong di situ supaya hasilnya kalimat yang
//    selesai, bukan kalimat yang menggantung.
// 4. **Tanpa elipsis menggantung.** Elipsis hanya dipakai sebagai upaya
//    TERAKHIR; jalur normal menutup kalimat dengan `.`.
// 5. **Murni.** Tanpa I/O, tanpa `Date`, tanpa env — bisa dites tanpa stub.

/** Elipsis satu karakter. Upaya terakhir, bukan penutup utama. */
const ELIPSIS = "…";

/**
 * Elipsis plus tanda titik di belakangnya, untuk membersihkan teks yang SUDAH
 * berakhir dengan elipsis ("…" atau "..."). Jangan biarkan laporan berakhir
 * "…" atau "..." -- itu yang dikeluhkan pengguna.
 */
const AKHIR_ELIPSIS = /(?:\u2026|\.{2,})$/;

/**
 * Akhiran yang membuat sebuah kalimat TIDAK layak dipotong di situ sebagai
 * kalimat utuh: kata sambung, preposisi, kata bantu, dan singkatan bergaya
 * "dll."/"dsb." yang titiknya bukan akhir kalimat.
 *
 * KENAPA PERLU: memotong tepat setelah "...saya belajar memecah pekerjaan
 * menjadi" lalu menambahkan titik menghasilkan kalimat yang runtuh tata
 * bahasanya ("...menjadi."). Lebih baik mundur satu klausa lagi.
 */
const AKHIRAN_MENGGANTUNG = new Set([
  "dan",
  "atau",
  "serta",
  "karena",
  "agar",
  "supaya",
  "sehingga",
  "untuk",
  "dengan",
  "pada",
  "dalam",
  "dari",
  "ke",
  "di",
  "saat",
  "ketika",
  "bila",
  "jika",
  "kalau",
  "yang",
  "akan",
  "telah",
  "sudah",
  "masih",
  "lebih",
  "sangat",
  "secara",
  "melalui",
  "seperti",
  "sebagai",
  "maupun",
  "tetapi",
  "tapi",
  "namun",
  "lalu",
  "kemudian",
  "dll.",
  "dsb.",
  "dst.",
  "dkk.",
  "mis.",
  "spt.",
]);

/**
 * Kata yang membuat klausa menggantung bila dipakai sebagai akhir potongan.
 * Diekspor agar penyusun laporan memakai daftar yang SAMA, bukan salinan.
 */
export const AKHIRAN_GANTUNG = AKHIRAN_MENGGANTUNG;

/** True bila `teks` berakhir dengan kata yang membuat klausanya menggantung. */
function menggantung(teks: string): boolean {
  const kata = teks.slice(teks.lastIndexOf(" ") + 1).toLowerCase();
  return AKHIRAN_MENGGANTUNG.has(kata);
}

/**
 * Tutup `teks` menjadi kalimat yang utuh.
 *
 * Elipsis dibuang (lalu diganti titik) karena laporan jadi terkesan belum
 * selesai. Kalimat yang sudah berakhir dengan `.`/`!`/`?` dibiarkan -- KECUALI
 * titik itu berdiri setelah tanda kutip penutup (`...peserta."`), sebab titik di
 * luar kutip membuat tanda bacanya ganda saat dibaca ("titik, kutip, titik").
 * Titik dipindahkan ke dalam kutipan.
 */
function tutupKalimat(teks: string): string {
  const tanpaElipsis = teks.replace(AKHIR_ELIPSIS, "").trimEnd();
  if (tanpaElipsis.length === 0) return tanpaElipsis;

  // Buang tanda baca penggantung di ujung SEBELUM menutup: koma, titik dua, dan
  // titik koma bukan akhir kalimat. Mengabaikannya menghasilkan "mengubah
  // kode,." -- terlihat seperti salah ketik, dan itu juga terjadi saat potongan
  // mendarat tepat setelah koma.
  const bersih = tanpaElipsis.replace(/[,;:]+$/, "").trimEnd();
  const dasar = bersih.length > 0 ? bersih : tanpaElipsis;

  // `...peserta"` -> `...peserta."`: titik dipindah ke DALAM kutipan, bukan
  // ditambahkan setelahnya. Titik di luar kutip (`...peserta".`) terbaca sebagai
  // tanda baca ganda dan itulah yang tampil sebagai "titik dua" di laporan.
  if (dasar.endsWith('"')) {
    const dalam = dasar.slice(0, -1).trimEnd();
    if (/[.!?]$/.test(dalam)) return dasar;
    return `${dalam}."`;
  }
  return /[.!?]$/.test(dasar) ? dasar : `${dasar}.`;
}

/**
 * Potong `text` menjadi paling banyak `max` karakter pada batas kata.
 *
 * @param text Teks sumber.
 * @param max  Batas atas karakter (termasuk elipsis).
 * @param min  Batas bawah yang harus tetap dicapai bila memungkinkan. Bila
 *             potongan "rapi" (di akhir kalimat / batas kata) jatuh di bawah
 *             nilai ini, pemotongan dilakukan lebih dekat ke `max` dengan
 *             mengabaikan preferensi akhir kalimat. Dipakai penyusun draf:
 *             kolom yang terpotong jadi 4 karakter akan DITOLAK server
 *             (minimal 100), sehingga "rapi" berubah jadi kolom kosong.
 * @returns Teks yang sudah dipangkas. Bila `text` sudah pendek, dikembalikan
 *          apa adanya (hanya spasinya yang dirapikan).
 */
/**
 * Rapikan penutup hasil potong agar terbaca sebagai kalimat utuh.
 *
 * Dipakai oleh DUA jalur, bukan satu: jalur "potong di akhir kalimat" dan jalur
 * "potong di batas kata". Keduanya bisa menghasilkan `...peserta."` -- titik
 * yang berdiri setelah tanda kutip penutup topik -- sehingga pembersihannya
 * harus berada di satu tempat, bukan ditempel di salah satu jalur saja.
 *
 * @param isi Potongan teks (belum ditutup tanda baca).
 * @param max Batas atas; fungsi ini tidak pernah mengembalikan > `max`.
 */
function rapikanPenutup(isi: string, max: number): string {
  const akhir = tutupKalimat(isi);
  if (akhir.length > 0 && akhir.length <= max) return akhir;

  // Penutup titik membuat hasil melewati `max` (mungkin bila `isi` tepat `max`
  // karakter). Buang satu kata supaya titiknya tetap muat.
  const dipendekkan = isi.slice(0, isi.lastIndexOf(" ")).trimEnd();
  const akhirPendek = tutupKalimat(dipendekkan.length > 0 ? dipendekkan : isi);
  if (akhirPendek.length <= max) return akhirPendek;

  // `max` sangat kecil (mis. 1): tidak ada ruang untuk isi + penutup. Kembalikan
  // potongan keras sepanjang `max` -- aturan "<= max" tidak boleh dilanggar.
  return isi.slice(0, max);
}

/**
 * Potong `text` menjadi paling banyak `max` karakter pada batas kata.
 *
 * Penutupnya mengikuti di mana pemotongan mendarat:
 * - **Tepat di akhir kalimat** -> dipakai kalimat utuh itu (berakhir `.`/`!`/`?`).
 * - **Di tengah kalimat** -> diberi elipsis (`…`), karena menambahkan titik akan
 *   mengarang akhir kalimat yang tidak pernah ditulis sumbernya.
 * - **Kata lebih panjang dari `max`** (URL tanpa spasi) -> potong paksa + elipsis.
 *
 * Tidak ada jalur yang menghasilkan `...` atau titik ganda setelah tanda kutip.
 *
 * @param text Teks sumber.
 * @param max  Batas atas karakter (termasuk elipsis/penutup).
 * @param min  Batas bawah yang harus tetap dicapai bila memungkinkan. Bila
 *             potongan rapi (di akhir kalimat) jatuh di bawah nilai ini,
 *             pemotongan dilakukan lebih dekat ke `max`. Dipakai penyusun draf:
 *             kolom yang terpotong jadi 4 karakter akan DITOLAK server
 *             (minimal 100), sehingga "rapi" berubah jadi kolom kosong.
 * @returns Teks yang sudah dipangkas. Bila `text` sudah pendek, dikembalikan
 *          apa adanya (hanya spasinya yang dirapikan).
 */
export function trimToChars(text: string, max: number, min = 0): string {
  const bersih = (text ?? "").replace(/\s+/g, " ").trim();
  if (max <= 0) return "";
  if (bersih.length <= max) return bersih;

  // Ruang untuk tanda penutup. Tanpa ini, hasil potong + titik/elipsis bisa
  // melewati `max` satu karakter -- cukup untuk menggagalkan pemeriksaan
  // panjang di tempat lain.
  //
  // Jendela selalu `max - 1` supaya ada tempat untuk penutup 1 karakter. Bila
  // sebuah kalimat utuh ditemukan LEBIH PENDEK dari itu, kalimat itu dipakai
  // apa adanya (sudah berakhir `.`/`!`/`?`) sehingga tidak perlu ruang penutup.
  const jendelaPenuh = max > ELIPSIS.length;
  const jendela = bersih.slice(0, jendelaPenuh ? max - ELIPSIS.length : max);

  // Titik akhir kalimat TERAKHIR di dalam jendela = isi paling banyak, dan
  // paling dekat dengan batas atas. Ambang "separuh jendela" yang dulu dipakai
  // terlalu kaku: pada jendela 199 karakter ia menuntut titik di indeks >= 99,
  // sehingga kalimat yang berakhir di indeks 93 (6 karakter lebih pendek)
  // dilewati dan pemotongan jatuh di tengah klausa.
  const akhirKalimat = Math.max(
    jendela.lastIndexOf(". "),
    jendela.lastIndexOf("! "),
    jendela.lastIndexOf("? "),
  );
  if (akhirKalimat >= 0) {
    const kalimat = jendela.slice(0, akhirKalimat + 1).trim();
    // Hormati `min`: kalimat utuh yang terlalu pendek (mis. "Ok." lalu satu kata
    // sangat panjang) akan DITOLAK `checkReportField`, jadi harus dilewati dan
    // pemotongan dilakukan lebih jauh di dalam jendela.
    //
    // Tetap lewat `rapikanPenutup`: titik di sini bisa berdiri setelah tanda
    // kutip penutup topik (`...peserta."`), yang harus dipindah ke dalam.
    if (kalimat.length > 0 && kalimat.length >= min) {
      return rapikanPenutup(kalimat, max);
    }
  }

  // Titik potong cadangan: spasi terakhir, supaya tidak ada kata yang separuh.
  const spasiTerakhir = jendela.lastIndexOf(" ");
  // Kata pertama bisa lebih panjang daripada `max` (mis. URL tanpa spasi). Di
  // kasus itu tidak ada batas kata yang bisa dipakai, jadi potong paksa dan
  // BERI ELIPSIS: ini satu-satunya tempat elipsis tetap dipakai, karena tanpa
  // penanda hasilnya terbaca seperti URL/ID yang sah padahal terpotong.
  if (spasiTerakhir <= 0) {
    const keras = jendela.trimEnd();
    return `${keras}${jendelaPenuh ? ELIPSIS : ""}`;
  }
  const potongMentah = jendela.slice(0, spasiTerakhir);

  // Jangan tutup klausa yang menggantung: "...belajar memecah pekerjaan
  // menjadi." runtuh tata bahasanya. Mundur ke batas kata sebelum kata
  // sambung/preposisi terakhir, selama hasilnya tetap memenuhi `min`.
  let isi = potongMentah.trimEnd();
  while (isi.length > 0 && menggantung(isi)) {
    const sebelumnya = isi.lastIndexOf(" ");
    if (sebelumnya <= 0) break;
    const kandidat = isi.slice(0, sebelumnya).trimEnd();
    // Berhenti mundur bila sudah melewati batas bawah: klausa menggantung yang
    // pendek masih lebih baik daripada kolom yang ditolak server.
    if (min > 0 && kandidat.length < min) break;
    isi = kandidat;
  }
  if (isi.length === 0) isi = jendela.trimEnd();

  // Potongan ini berada di TENGAH kalimat, jadi penanda potong wajib ada:
  // elipsis, bukan titik. Memberi titik akan mengarang akhir kalimat yang tidak
  // pernah ditulis sumbernya.
  const akhir = `${isi}${jendelaPenuh ? ELIPSIS : ""}`;

  // Jaring pengaman `min`: bila mundur tadi membuat hasil lebih pendek dari
  // batas bawah, ambil jendela penuh. Hasilnya mungkin memotong satu kata di
  // tengah, tetapi itu jauh lebih baik daripada kolom yang ditolak server.
  if (min > 0 && akhir.length < min) {
    return `${jendela.trimEnd()}${jendelaPenuh ? ELIPSIS : ""}`;
  }
  return akhir;
}
