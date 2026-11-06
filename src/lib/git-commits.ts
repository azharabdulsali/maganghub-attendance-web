// src/lib/git-commits.ts: tipe bersama + fungsi MURNI untuk mengubah daftar
// commit menjadi `keywords` bahan draf laporan.
//
// ATURAN YANG DIJAGA (docs/GIT-COMMITS-PLAN.md §4, §9):
//   - Modul ini MURNI: tidak ada `fetch`, tidak ada I/O, tidak membaca env.
//     Karena itu bisa dites tanpa jaringan sama sekali.
//   - Keluaran TIDAK BOLEH kosong bila ada commit. Bila kosong, penyusun lokal
//     tidak punya bahan dan draf jadi generik tanpa alasan.
//   - Keluaran dibatasi panjangnya: commit berisi diff/deskripsi panjang tidak
//     boleh membanjiri prompt LLM (biaya kuota) atau memenuhi form.
//   - Isi commit TIDAK dipakai apa adanya sebagai laporan. Ia hanya "kata kunci"
//     untuk penyusun; pengguna tetap meninjau sebelum submit.
//
// Modul ini SENGAJA tidak tahu soal GitHub/GitLab. Adapter (git-provider-*.ts)
// yang menerjemahkan bentuk API masing-masing ke `GitCommit`.

/** Satu commit, sudah dinormalkan dari bentuk API mana pun. */
export interface GitCommit {
  /** Hash pendek (7-8 karakter) untuk ditampilkan. */
  shortId: string;
  /** Judul commit (baris pertama pesan). */
  title: string;
  /** Isi pesan setelah judul, opsional. Boleh kosong. */
  body?: string;
  /** Nama penulis commit (bukan email - email tidak pernah dipakai). */
  author: string;
  /** Waktu commit dalam ISO 8601 UTC. */
  committedAt: string;
  /** URL commit di web, opsional. Hanya untuk tautan di UI. */
  url?: string;
}

/** Batas jumlah commit yang dirangkum. Sisanya diabaikan, bukan error. */
export const MAX_COMMITS_IN_KEYWORDS = 15;

/** Batas panjang total `keywords` yang dihasilkan (karakter). */
export const MAX_KEYWORDS_LENGTH = 1200;

/** Batas panjang satu judul commit yang ikut dirangkum (karakter). */
export const MAX_TITLE_LENGTH = 120;

/**
 * Rentang satu hari kalender **Asia/Jakarta** dalam ISO UTC.
 *
 * KENAPA BUKAN `new Date().toISOString()`: server Vercel berjalan di UTC. Jam
 * 00:00–07:00 WIB masih "kemarin" di UTC, sehingga commit pagi hari akan
 * terlewat bila batasnya dihitung dari UTC. Ini bug yang sama dengan yang sudah
 * ditutup `todayInJakarta` (lihat `submit-service.ts`).
 *
 * `sinceIso` inklusif awal hari, `untilIso` inklusif akhir hari. Karena
 * `Asia/Jakarta` tidak memakai DST (selalu UTC+7), awal hari WIB selalu pukul
 * 00:00:00 WIB = 17:00:00 UTC hari sebelumnya. Pergeseran tetap itu dipakai
 * langsung — lebih jelas dibaca daripada perhitungan kalender rumit, dan sudah
 * dibuktikan oleh tes.
 */
export function jakartaDayRange(plainDate: string): {
  sinceIso: string;
  untilIso: string;
} {
  // `YYYY-MM-DDT00:00:00+07:00` diparse JS menjadi waktu UTC yang benar,
  // termasuk bila tanggalnya tidak valid (ditolak di bawah).
  const mulai = new Date(`${plainDate}T00:00:00+07:00`);
  if (Number.isNaN(mulai.getTime())) {
    throw new Error(`Tanggal tidak valid: ${plainDate}`);
  }
  // Akhir hari = 1 ms sebelum hari berikutnya, agar commit pukul 23:59:59.999
  // WIB tetap ikut. Bukan 24:00 karena itu tanggal berikutnya.
  const selesai = new Date(mulai.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    sinceIso: mulai.toISOString(),
    untilIso: selesai.toISOString(),
  };
}

/**
 * Pola prefix Conventional Commits yang dibuang dari judul: `feat:`,
 * `fix(api)!:`, `chore(deps):`.
 *
 * Gaya kurung siku (`[FIX]:`) ditangani `isiSetelahTagKurungSiku` karena punya
 * dua bentuk pemisah (titik dua atau tanda hubung), sehingga lebih jelas dibaca
 * sebagai kode daripada satu regex bercabang.
 *
 * KENAPA GAYA KURUNG SIKU PENTING: repo nyata memakainya (mis.
 * `[FIX]: delete External ID ...`). Sebelum didukung, prefix-nya lolos ke
 * laporan dan jenis pekerjaan salah terbaca: judul itu memuat kata "refactor",
 * sehingga commit PERBAIKAN dikira REFACTOR dan kolom Pembelajaran memakai
 * kalimat tentang penataan ulang kode.
 */
const PREFIX_CONVENTIONAL = /^[a-z]+(?:\([^)]*\))?!?:\s*(.+)$/i;

/**
 * Ambil isi judul setelah prefix kurung siku, atau `null` bila tidak berpola
 * `[TAG]`.
 *
 * `[TAG]` dibatasi 1–16 huruf/angka tanpa spasi, supaya tanda kurung yang
 * memang bagian judul (mis. `[catatan panjang]`) tidak ikut terpotong.
 *
 * `[FIX]:` tanpa subjek menghasilkan `""` — BUKAN sisa `":"`. Itu penting:
 * sisa titik dua akan lolos `isGenericCommitTitle` dan masuk ke laporan.
 */
function isiSetelahTagKurungSiku(text: string): string | null {
  const cocok = text.match(/^\[[A-Za-z0-9]{1,16}\](.*)$/);
  if (!cocok) return null;
  const sisa = cocok[1];
  if (/^\s*:/.test(sisa)) return sisa.replace(/^\s*:\s*/, "");
  if (/^\s*[-–—]\s+/.test(sisa)) return sisa.replace(/^\s*[-–—]\s+/, "");
  return sisa.trim();
}

/**
 * Rapikan satu judul commit: buang prefix (`feat:`, `fix(api):`, `[FIX]:`),
 * rapikan spasi, dan potong bila terlalu panjang.
 *
 * Prefix dibuang karena "feat" / "chore" / "FIX" bukan bahasa yang wajar muncul
 * di laporan magang; isinya yang penting.
 */
export function cleanCommitTitle(raw: string): string {
  let text = (raw ?? "").replace(/\s+/g, " ").trim();

  // Buang prefix berulang, mis. `[FIX]: feat: subject` -> `subject`. Dibatasi
  // 3 putaran: cukup untuk gaya campuran yang realistis, tanpa risiko loop
  // panjang pada judul aneh.
  //
  // Prefix HANYA dibuang bila ada isi tersisa. Judul yang seluruhnya prefix
  // (`[FIX]:`) dibiarkan utuh agar `isGenericCommitTitle` bisa membuangnya;
  // mengubahnya menjadi `":"` justru meloloskan sampah ke laporan.
  for (let i = 0; i < 3; i++) {
    let berubah = false;

    const conventional = text.match(PREFIX_CONVENTIONAL);
    if (conventional?.[1]?.trim()) {
      text = conventional[1].trim();
      berubah = true;
    } else {
      const sisa = isiSetelahTagKurungSiku(text);
      if (sisa !== null && sisa.trim()) {
        text = sisa.trim();
        berubah = true;
      }
    }

    if (!berubah) break;
  }

  // Buang tanda baca berlebih di ujung (titik berkali-kali dsb.).
  text = text.replace(/[.\s]+$/, "");

  if (text.length > MAX_TITLE_LENGTH) {
    text = `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
  }
  return text;
}

/**
 * Buang judul yang tidak berguna sebagai bahan laporan: kosong, atau hanya
 * bunyi generik seperti "update", "fix", "wip", "initial commit".
 *
 * Tujuannya bukan menyensor, tetapi supaya bahan draf tetap bermakna: laporan
 * berisi "update" saja tidak bisa ditindaklanjuti siapa pun.
 */
const TITLE_TERLALU_UMUM = new Set([
  "update",
  "updates",
  "fix",
  "fixes",
  "wip",
  "initial commit",
  "init",
  "test",
  "tes",
  "coba",
  "minor",
  "typo",
  "changes",
  "perubahan",
]);

export function isGenericCommitTitle(title: string): boolean {
  const t = cleanCommitTitle(title).toLowerCase();
  if (t.length === 0) return true;
  return TITLE_TERLALU_UMUM.has(t);
}

/**
 * Ubah daftar commit menjadi teks `keywords` untuk `DraftInput`.
 *
 * Hasil berupa kalimat yang enak dibaca penyusun, mis.:
 *   "Menambah validasi form login; Memperbaiki bug filter tanggal; ..."
 *
 * Mengembalikan string kosong HANYA bila tidak ada commit yang layak dipakai.
 * Pemanggil WAJIB menangani kasus itu dengan fallback (jangan membuat laporan
 * dari bahan kosong tanpa memberi tahu pengguna).
 */
export function commitsToKeywords(commits: readonly GitCommit[]): string {
  if (!commits || commits.length === 0) return "";

  const judul = commits
    .map((c) => c.title)
    .filter((t) => !isGenericCommitTitle(t))
    .map((t) => cleanCommitTitle(t))
    .filter((t) => t.length > 0);

  if (judul.length === 0) return "";

  // Deduplikasi tanpa mengubah urutan (commit berulang sering terjadi karena
  // merge/rebase). Pembanding tanpa beda huruf besar-kecil.
  const dilihat = new Set<string>();
  const unik: string[] = [];
  for (const t of judul) {
    const kunci = t.toLowerCase();
    if (dilihat.has(kunci)) continue;
    dilihat.add(kunci);
    unik.push(t);
    if (unik.length >= MAX_COMMITS_IN_KEYWORDS) break;
  }

  let hasil = unik.join("; ");

  if (hasil.length > MAX_KEYWORDS_LENGTH) {
    hasil = `${hasil.slice(0, MAX_KEYWORDS_LENGTH - 1).trimEnd()}…`;
  }
  return hasil;
}
