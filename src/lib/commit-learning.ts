// src/lib/commit-learning.ts: menurunkan kolom "Pembelajaran yang Diperoleh"
// dari BUKTI yang benar-benar ada di commit — bukan mengarang.
//
// KENAPA MODUL INI ADA (docs/GIT-COMMITS-PLAN.md §8 Fase 3):
// Kolom pembelajaran sebelumnya sengaja dibiarkan kosong dengan alasan yang
// benar: commit menunjukkan *apa yang dikerjakan*, bukan *apa yang dipelajari*.
// Mengisinya dengan kalimat template generik berarti mengarang isi kepala orang
// lain, dan laporan magang berisi karangan lebih buruk daripada kolom kosong.
//
// Aturan yang dipakai: sebuah kalimat pembelajaran HANYA boleh muncul bila ada
// BUKTI di commit yang mendasarinya. Bukti yang dipakai adalah sinyal yang
// benar-benar terlihat dari data commit:
//   - jenis perubahan (perbaikan bug, penambahan fitur, pengujian, dokumentasi,
//     penataan ulang, konfigurasi), dari prefix Conventional Commits atau kata
//     kerja di judul;
//   - topik yang dikerjakan, dari judul commit yang bermakna.
//
// Kalau tidak ada bukti yang layak, fungsi mengembalikan `null` dan pemanggil
// WAJIB membiarkan kolom kosong + `learningNeedsReview: true`. `null` di sini
// adalah hasil yang sah, bukan kegagalan.
//
// Modul ini MURNI: tanpa `fetch`, tanpa env, tanpa I/O, tanpa `Date.now()`.

import {
  cleanCommitTitle,
  isGenericCommitTitle,
  sortCommitsAscending,
  type GitCommit,
} from "./git-commits";
import {
  checkReportField,
  countReportLength,
  MIN_REPORT_LENGTH,
  normalizeReportText,
  DRAFT_MAX_LENGTH,
  DRAFT_MIN_LENGTH,
} from "./report-rules";
import { trimToChars, AKHIRAN_GANTUNG } from "./text-trim";

/** Jenis perubahan yang bisa dikenali dari sebuah commit. */
export type ChangeKind =
  | "FIX"
  | "FEATURE"
  | "TEST"
  | "DOCS"
  | "REFACTOR"
  | "CONFIG"
  | "OTHER";

/**
 * Kalimat pembelajaran per jenis perubahan.
 *
 * Setiap kalimat menjelaskan apa yang WAJAR dipelajari dari jenis pekerjaan itu,
 * dan selalu merujuk pada pekerjaan yang benar-benar ada di commit. Tidak ada
 * klaim tentang perasaan atau penilaian pribadi pengguna.
 */
const PELAJARAN_PER_JENIS: Record<Exclude<ChangeKind, "OTHER">, string> = {
  FIX:
    "Dari perbaikan bug tersebut saya belajar menelusuri akar masalah lebih dulu sebelum mengubah kode, karena memperbaiki gejala tanpa tahu penyebabnya berisiko memunculkan masalah baru.",
  FEATURE:
    "Saat menambah fitur baru, saya belajar memecah pekerjaan menjadi bagian kecil yang bisa diuji sendiri-sendiri sehingga kesalahan lebih mudah ditemukan sejak awal.",
  TEST:
    "Menulis pengujian membuat saya belajar memastikan perubahan benar-benar berjalan sesuai harapan, bukan hanya terlihat benar saat dicoba sekali.",
  DOCS:
    "Menuliskan dokumentasi membantu saya belajar merangkum keputusan teknis dengan bahasa yang bisa dipahami orang lain, bukan hanya oleh saya sendiri.",
  REFACTOR:
    "Dari penataan ulang kode saya belajar bahwa struktur yang rapi memudahkan perubahan berikutnya, dan bahwa hasil akhir yang sama belum tentu sama kualitasnya.",
  CONFIG:
    "Mengurus konfigurasi membuat saya belajar bahwa detail kecil pada pengaturan lingkungan bisa berpengaruh besar terhadap jalannya aplikasi.",
};

/**
 * Kata kunci untuk mengenali jenis perubahan dari JUDUL commit.
 *
 * Dicocokkan pada kata utuh (bukan potongan) supaya "prefix" tidak terbaca
 * sebagai "fix". Urutan penting: TEST/DOCS/REFACTOR/CONFIG diperiksa sebelum
 * FIX, dan FIX sebelum FEATURE, karena judul seperti "fix fitur login" lebih
 * tepat dibaca sebagai perbaikan.
 */
const POLA_JENIS: ReadonlyArray<{ kind: Exclude<ChangeKind, "OTHER">; pola: RegExp }> = [
  { kind: "TEST", pola: /\b(test|tests|testing|uji|pengujian|spec)\b/i },
  { kind: "DOCS", pola: /\b(doc|docs|dokumentasi|readme|komentar|catatan)\b/i },
  {
    kind: "REFACTOR",
    pola: /\b(refactor|refaktor|rapikan|merapikan|susun ulang|pindahkan)\b/i,
  },
  {
    kind: "CONFIG",
    pola: /\b(config|konfigurasi|env|setup|workflow|ci|dependency|dependencies|paket)\b/i,
  },
  {
    kind: "FIX",
    pola: /\b(fix|fixes|fixed|perbaiki|memperbaiki|perbaikan|benahi|bug|error|galat|salah)\b/i,
  },
  {
    kind: "FEATURE",
    pola:
      /\b(feat|feature|fitur|tambah|menambah|menambahkan|buat|membuat|implement|implementasi|add)\b/i,
  },
];

/**
 * Kenali jenis perubahan dari pesan commit.
 *
 * Prefix diperiksa lebih dulu karena itu penanda paling eksplisit. Yang
 * dikenali bukan hanya Conventional Commits (`fix:` / `feat(api):`), tetapi
 * juga gaya kurung siku (`[FIX]:` / `[ADD] ...`) — gaya terakhir itulah yang
 * dipakai repo nyata, dan tanpa dukungan ini judul `[FIX]: ... refactor ...`
 * salah terbaca REFACTOR karena kata "refactor" lebih dulu cocok saat
 * pencocokan jatuh ke judul.
 *
 * Bila tidak ada prefix yang dikenal, pencocokan jatuh ke kata di judul.
 */
export function detectChangeKind(commit: GitCommit): ChangeKind {
  const mentah = (commit.title ?? "").trim();

  // Ambil prefix dari gaya mana pun: `type(scope)!:` atau `[TAG]`.
  // `parsePrefixTag` sengaja tidak dipakai langsung agar modul ini tetap murni
  // dan tidak bergantung pada urutan fungsi di `git-commits.ts`.
  const prefiks =
    mentah.match(/^[a-z]+(?:\([^)]*\))?!?:/i)?.[0]?.replace(/:$/, "").replace(/\(.*\)/, "") ??
    mentah.match(/^\[([A-Za-z0-9]{1,16})\]/)?.[1];

  if (prefiks) {
    const kunci = prefiks.toLowerCase();
    const cocok = POLA_JENIS.find((p) => p.pola.test(kunci === "perf" ? "feat" : kunci));
    if (cocok) return cocok.kind;
  }

  const judul = cleanCommitTitle(mentah);
  if (judul.length === 0) return "OTHER";
  return POLA_JENIS.find((p) => p.pola.test(judul))?.kind ?? "OTHER";
}

/**
 * Ambil topik bermakna dari judul commit.
 *
 * Judul generik ("update", "wip") dibuang karena tidak memberi bahan apa pun.
 *
 * Urutannya kronologis NAIK (lihat `sortCommitsAscending`), bukan urutan balasan
 * API. Tanpa ini, topik yang disebut adalah pekerjaan PALING AKHIR hari itu,
 * padahal kalimat pembelajaran dibaca sebagai rangkuman hari.
 */
function topikBermakna(commits: readonly GitCommit[], batas = 2): string[] {
  const hasil: string[] = [];
  const dilihat = new Set<string>();
  for (const c of sortCommitsAscending(commits)) {
    if (isGenericCommitTitle(c.title)) continue;
    const judul = cleanCommitTitle(c.title);
    if (judul.length === 0) continue;
    const kunci = judul.toLowerCase();
    if (dilihat.has(kunci)) continue;
    dilihat.add(kunci);
    // Judul panjang dipenggal supaya kalimatnya tetap wajar dibaca.
    //
    // Dipotong di BATAS KATA, bukan `slice(0, 69)`: potongan mentah bisa
    // mendarat di tengah kata dan menghasilkan penggal kata yang terbaca seperti
    // salah ketik.
    //
    // PENANDA POTONG DIBUANG dari topik (`...` dan elipsis). Topik ini ditaruh
    // di dalam tanda kutip di kalimat pembuka; penanda di situ terbaca sebagai
    // salah ketik, dan elipsis yang tersisa membuat laporan berakhir "…" setelah
    // titik kutip ditambahkan. Judul yang dipenggal cukup berhenti di kata
    // terakhir yang utuh.
    const ringkas =
      judul.length > 70
        ? trimToChars(judul, 70, 0)
            .replace(/(?:\u2026|\.{2,})$/, "")
            .replace(/[.!?]+$/, "")
            .trimEnd()
        : judul;
    hasil.push(ringkas);
    if (hasil.length >= batas) break;
  }
  return hasil;
}

/**
 * Buang KALIMAT UTUH dari belakang sampai teks muat dalam `max`.
 *
 * KENAPA BUKAN `trimToChars` SAJA: memotong di tengah kalimat lalu menempelkan
 * elipsis menghasilkan laporan yang berakhir "…" -- terbaca seperti tulisan
 * belum selesai, dan itu persis yang dilaporkan pengguna sebagai bug. Membuang
 * satu kalimat penuh menghasilkan teks yang setiap kalimatnya selesai.
 *
 * Batas bawah `min` dihormati: kalimat TIDAK dibuang bila hasilnya jadi lebih
 * pendek dari `min`, sebab kolom seperti itu akan DITOLAK `checkReportField`
 * dan pengguna kehilangan kolom "Pembelajaran" sama sekali. Dalam kasus itu
 * teks dikembalikan apa adanya (masih > `max`) dan pemanggil memotongnya
 * dengan jaring terakhir.
 *
 * Kalimat pertama SELALU dipertahankan, walau ia sendiri sudah melebihi `max`
 * (mis. judul commit tanpa spasi).
 */
function potongKalimatUtuh(teks: string, max: number, min: number): string {
  if (teks.length <= max) return teks;

  // Pecah pada batas kalimat, tetap menyertakan tanda bacanya.
  const kalimat = teks.match(/[^.!?]+[.!?]+/g) ?? [teks];
  if (kalimat.length <= 1) return teks;

  const kandidat: string[] = [];
  for (const k of kalimat) {
    const coba = [...kandidat, k].join(" ").trim();
    // Berhenti menambah kalimat begitu melewati `max`: `kandidat` saat itu
    // adalah versi terpanjang yang masih muat.
    if (coba.length > max) break;
    kandidat.push(k);
  }

  if (kandidat.length === 0) return teks;
  const hasil = kandidat.join(" ").trim();
  if (hasil.length >= min) return hasil;

  // Kalimat yang muat pun masih di bawah `min` (mis. pembuka 95 karakter +
  // satu kalimat pelajaran yang membuat totalnya melewati `max`). Membuangnya
  // membuat kolom ditolak server, jadi kita pertahankan kalimat pertama dan
  // potong kalimat berikutnya di BATAS KATA, lalu tutup dengan titik. Hasilnya
  // tetap kalimat selesai tanpa elipsis menggantung.
  const pertama = kalimat[0].trim();
  const sisa = teks.slice(pertama.length).trim();
  if (sisa.length === 0) return teks;

  const ruang = max - pertama.length - 1; // -1 untuk spasi pemisah
  if (ruang <= 0) return pertama;

  const potong = sisa.slice(0, ruang);
  const spasi = potong.lastIndexOf(" ");
  const badan = (spasi > 0 ? potong.slice(0, spasi) : potong).trimEnd();

  // Buang kata sambung/preposisi di ujung supaya kalimatnya tidak menggantung
  // ("...pekerjaan menjadi."). Mundur selama hasilnya masih memenuhi `min`.
  let badan2 = badan;
  while (badan2.length > 0 && AKHIRAN_GANTUNG.has(badan2.slice(badan2.lastIndexOf(" ") + 1))) {
    const sebelum = badan2.slice(0, badan2.lastIndexOf(" ")).trimEnd();
    if (sebelum.length === 0 || `${pertama} ${sebelum}.`.length < min) break;
    badan2 = sebelum;
  }

  const gabung = `${pertama} ${badan2}`.trimEnd();
  // Titik potong bisa mendarat tepat setelah koma ("...mengubah kode,."),
  // sehingga jangan tambahkan titik mentah: buang tanda penggantung dulu.
  const rapi = gabung.replace(/[,;:]+$/, "").trimEnd();
  const akhir = /[.!?]$/.test(rapi) ? rapi : `${rapi}.`;
  return akhir.length <= max ? akhir : pertama;
}

/** Panjang minimum kalimat yang layak ditambahkan sebagai penutup berbukti. */
const PENUTUP_BERBUKTI =
  "Pemahaman ini saya jadikan acuan untuk mengerjakan tugas berikutnya dengan lebih tertib.";

/**
 * Susun kolom "Pembelajaran yang Diperoleh" dari bukti commit.
 *
 * @returns Teks yang lulus `checkReportField`, atau `null` bila bukti tidak
 *          cukup. `null` berarti "biarkan kosong" — TIDAK boleh diganti karangan.
 */
export function learningFromCommits(commits: readonly GitCommit[]): string | null {
  if (!commits || commits.length === 0) return null;

  const topik = topikBermakna(commits);

  // Kumpulkan jenis perubahan yang benar-benar muncul, tanpa duplikat.
  const jenis: Exclude<ChangeKind, "OTHER">[] = [];
  for (const c of commits) {
    const k = detectChangeKind(c);
    if (k !== "OTHER" && !jenis.includes(k)) jenis.push(k);
  }

  // Guard: WAJIB ada minimal satu JENIS perubahan yang dikenali.
  //
  // Kenapa topik saja tidak cukup: judul panjang seperti "mengerjakan
  // administrasi berkas..." adalah judul biasa — ia membuktikan APA yang
  // dikerjakan, bukan bahwa ada yang dipelajari. Tanpa jenis perubahan, satu-
  // satunya isi kolom adalah kalimat "saya mempelajari penerapannya", yang
  // justru dugaan tentang isi kepala pengguna. Itu persis "mengarang" yang
  // ingin dihindari, jadi lebih baik kolom dibiarkan kosong.
  if (jenis.length === 0) return null;

  const bagian: string[] = [];

  // Kalimat pembuka HANYA menyebut pekerjaan yang benar-benar ada di commit
  // ("hari ini mengerjakan X"). Ia sengaja TIDAK memakai kata "mempelajari":
  // klaim tentang apa yang dipelajari hanya boleh datang dari
  // `PELAJARAN_PER_JENIS`, yang punya dasar jenis perubahan. Sebelumnya di sini
  // tertulis "saya mempelajari penerapannya ..." yang muncul untuk semua
  // commit — persis klaim tanpa dasar yang ingin dihindari.
  if (topik.length > 0) {
    // Topik dipakai TANPA penanda potong. Ia berada di dalam tanda kutip, jadi
    // elipsis di situ ("...impor peserta…") terbaca sebagai salah ketik, bukan
    // sebagai tanda bahwa kutipannya dipendekkan. Panjangnya sudah dibatasi di
    // `topikBermakna`, dan bila masih kepanjangan kita buang kata terakhirnya
    // (lihat di bawah), bukan mengganjalnya dengan elipsis.
    const kutip = topik.map((t) => `"${t.replace(/(?:\u2026|\.{2,})$/, "").trimEnd()}"`);
    bagian.push(`Pekerjaan hari ini mencakup ${kutip.join(" dan ")}.`);
  }

  // Maksimal dua jenis agar kolom tidak bertele-tele.
  for (const k of jenis.slice(0, 2)) bagian.push(PELAJARAN_PER_JENIS[k]);

  let teks = normalizeReportText(bagian.join(" "));

  // Penutup netral ini memastikan kolom memenuhi panjang minimum. PENTING: ia
  // TIDAK berisi klaim pembelajaran apa pun, jadi menambahkannya tidak sama
  // dengan mengarang — tetapi juga tidak boleh dipakai sebagai satu-satunya isi.
  // `bagian` selalu punya minimal satu entri di titik ini, karena guard di atas
  // sudah menolak kasus tanpa bukti.
  if (countReportLength(teks) < MIN_REPORT_LENGTH) {
    teks = normalizeReportText(`${teks} ${PENUTUP_BERBUKTI}`);
  }

  // Batas atas sama dengan drafter lain (keputusan pemilik: 100-200 karakter).
  // Modul ini disusun dari pesan commit yang bisa sangat panjang -- tanpa
  // pemotongan, kolom "Pembelajaran" bisa jauh melewati batas walau jenis
  // perubahannya hanya satu.
  //
  // Pemotongan dilakukan dengan MEMBUANG KALIMAT UTUH dari belakang, bukan
  // memotong di tengah kalimat lalu menempelkan elipsis. Alasan: laporan magang
  // yang berakhir "…" terbaca seperti tulisan yang belum selesai, dan pengguna
  // memang melaporkannya sebagai bug. Kalimat pembuka ("Pekerjaan hari ini
  // mencakup ...") selalu dipertahankan karena itu satu-satunya bagian yang
  // menyebut pekerjaan nyata; kalimat pelajaran yang dipotong lebih baik hilang
  // seluruhnya daripada berdiri sebagai potongan menggantung.
  teks = potongKalimatUtuh(teks, DRAFT_MAX_LENGTH, DRAFT_MIN_LENGTH);

  // `trimToChars` tetap dipakai sebagai jaring terakhir: kalimat pembuka yang
  // SANGAT panjang (satu judul tanpa spasi) tidak bisa dipotong per kalimat,
  // dan kolom harus tetap <= 200. `min` diteruskan supaya potongan rapi tidak
  // jatuh di bawah batas portal.
  if (teks.length > DRAFT_MAX_LENGTH) {
    teks = trimToChars(teks, DRAFT_MAX_LENGTH, DRAFT_MIN_LENGTH);
  }

  // Hormati kontrak yang sama dengan penyusun lain: jangan kembalikan kolom
  // yang akan ditolak server. Lebih baik kosong (null) daripada draf buntu.
  return checkReportField(teks) === null ? teks : null;
}
