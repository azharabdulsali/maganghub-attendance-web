// src/lib/text-trim.ts: memotong teks panjang ke batas karakter TANPA memotong
// kata di tengah.
//
// KENAPA MODUL SENDIRI, BUKAN `slice()` DI TEMPAT PEMAKAIAN
// --------------------------------------------------------
// Ada tiga pemakai dengan kebutuhan yang sama (draf commit, draf LLM, dan
// penyusun lokal), dan `String.slice()` yang ditulis di masing-masing tempat
// akan menyimpang satu sama lain. Yang paling berbahaya justru bentuk naif
// `text.slice(0, 200)`: ia memotong kata terakhir menjadi potongan seperti
// "menye" yang tetap lolos semua validasi panjang dan masuk ke laporan.
//
// ATURAN YANG DIJAGA
// ------------------
// 1. **Potong di batas kata.** Bila potongan terakhir bukan kata utuh, kata itu
//    dibuang (bukan dipotong separuh).
// 2. **Jangan pernah menambah panjang.** Hasil SELALU <= `max` karakter,
//    termasuk saat kita menambahkan elipsis.
// 3. **Kalimat utuh lebih diutamakan.** Bila ada akhir kalimat (`.`/`!`/`?`)
//    pada separuh terakhir jendela, potong di situ supaya hasilnya kalimat yang
//    selesai, bukan kalimat yang menggantung.
// 4. **Murni.** Tanpa I/O, tanpa `Date`, tanpa env — bisa dites tanpa stub.

/** Elipsis satu karakter. Dipakai, bukan "...", agar hemat 2 karakter. */
const ELIPSIS = "…";

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
export function trimToChars(text: string, max: number, min = 0): string {
  const bersih = (text ?? "").replace(/\s+/g, " ").trim();
  if (max <= 0) return "";
  if (bersih.length <= max) return bersih;

  // Ruang untuk elipsis. Tanpa ini, hasil potong + elipsis bisa melewati `max`
  // satu karakter — cukup untuk menggagalkan pemeriksaan panjang di tempat lain.
  // Bila `max` begitu kecil sehingga tidak ada ruang untuk isi + elipsis, elipsis
  // DIBUANG: jaminan "tidak pernah melebihi max" lebih penting daripada penanda
  // bahwa teks dipotong. (Ditemukan oleh tes `max=1`.)
  const jendelaPenuh = max > ELIPSIS.length;
  const jendela = bersih.slice(0, jendelaPenuh ? max - ELIPSIS.length : max);
  const elipsis = jendelaPenuh ? ELIPSIS : "";

  // Utamakan akhir kalimat pada separuh terakhir jendela: memotong di situ
  // menghasilkan kalimat yang selesai. Ambang separuh mencegah kita berhenti
  // terlalu awal sehingga isinya jadi terlalu sedikit.
  const batasKalimat = Math.floor(jendela.length / 2);
  const akhirKalimat = Math.max(
    jendela.lastIndexOf(". "),
    jendela.lastIndexOf("! "),
    jendela.lastIndexOf("? "),
  );
  if (akhirKalimat >= batasKalimat) {
    const kalimat = jendela.slice(0, akhirKalimat + 1).trim();
    // Kalimat lengkap tanpa elipsis: lebih enak dibaca daripada dipotong.
    //
    // KECUALI bila terlalu pendek (`min`): kalimat yang "selesai" tapi hanya
    // 4 karakter lebih buruk daripada potongan yang kurang rapi tapi lolos
    // validasi. Bandingkan `kalimat.length` dengan `min` tanpa elipsis, sebab
    // elipsis hanya ditambahkan pada jalur potong-di-spasi di bawah.
    if (kalimat.length > 0 && kalimat.length >= min) return kalimat;
  }

  // Potong di spasi terakhir supaya tidak ada kata yang separuh.
  const spasiTerakhir = jendela.lastIndexOf(" ");
  const potong = spasiTerakhir > 0 ? jendela.slice(0, spasiTerakhir) : jendela;

  // Kata pertama bisa lebih panjang daripada `max` (mis. URL panjang tanpa
  // spasi). Dalam kasus itu memotong paksa lebih baik daripada mengembalikan
  // string kosong — tetapi hasilnya tetap wajib <= `max`, karena itu `jendela`
  // sudah menyisakan tempat untuk elipsis.
  const hasil = potong.trimEnd();
  const isi = (hasil.length > 0 ? hasil : jendela).trimEnd();

  // Elipsis ditambahkan bila teks benar-benar terpotong, yaitu bila `isi`
  // bukan seluruh teks asli.
  //
  // KENAPA DIBANDINGKAN DENGAN `bersih`, BUKAN `jendela`: `jendela` selalu
  // `max - 1` karakter, sedangkan `bersih` adalah teks asli. Bila sumbernya
  // hanya 1 karakter lebih panjang dari `max` (mis. 140 vs 139), sisa yang
  // dibuang cuma 1 huruf/spasi terakhir -- dulu elipsis tetap ditambahkan
  // sehingga hasilnya berakhir "kata…" padahal nyaris utuh, dan sebaliknya
  // teks yang benar-benar terpotong bisa kehilangan penandanya. Membandingkan
  // dengan `bersih` membuat penanda elipsis jujur: ada bila ada yang hilang.
  const terpotong = isi !== bersih;
  const akhir = `${isi}${terpotong ? elipsis : ""}`;

  // Jaring pengaman terakhir terhadap `min`: bila titik potong "rapi" masih
  // membuat hasil lebih pendek dari `min`, ambil jendela penuh. Hasilnya
  // mungkin memotong satu kata di tengah, tapi itu jauh lebih baik daripada
  // kolom yang ditolak server dan membuat tombol Simpan mati. Dijamin tetap
  // <= `max` karena `jendela` sendiri sudah dipotong ke situ.
  if (min > 0 && akhir.length < min) {
    return `${jendela.trimEnd()}${elipsis}`;
  }
  return akhir;
}
