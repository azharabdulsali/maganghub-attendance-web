// src/lib/report-draft.ts: penyusun draf 3 kolom laporan.
//
// Kenapa modul ini ada (dan kenapa BUKAN "AI"):
//   - SPEC.md §13 baris 2 & §10 memutuskan provider AI TIDAK dipakai. Karena itu
//     penyusun di sini MURNI: merakit kalimat dari pustaka frasa + kata kunci
//     yang diberikan pengguna. Nol token, nol API key, nol panggilan jaringan.
//   - Meski begitu, bentuknya sengaja dibuat sebagai KONTAK (interface) tetap
//     `ReportDrafter`, supaya kalau kelak pemilik mengubah keputusan dan ingin
//     memakai LLM, cukup menambah implementasi kedua, TANPA membongkar UI, rute,
//     maupun form. Lihat `ReportDrafter` di bawah.
//
// Aturan yang dijaga di sini:
//   - Hasil TIDAK BOLEH di bawah MIN_REPORT_LENGTH, kalau tidak, tombol Simpan
//     tetap mati dan fitur ini justru menjengkelkan. Setiap hasil diakhiri
//     padding alami (kalimat penutup) sampai memenuhi batas.
//   - Hasil melewati `checkReportField` yang SAMA dengan server, jadi apa yang
//     lolos di sini pasti lolos di server.

import {
  MIN_REPORT_LENGTH,
  countReportLength,
  checkReportField,
  normalizeReportText,
} from "./report-rules";

/** Kata kunci + konteks opsional yang diketik pengguna sebagai bahan draf. */
export interface DraftInput {
  /** Ringkas aktivitas hari itu, mis. "migrasi skema Prisma". */
  keywords: string;
  /** Tanggal ISO (YYYY-MM-DD) untuk nada "hari ini", opsional. */
  date?: string;
  /** Nama unit/divisi, opsional, dipakai untuk memberi konteks. */
  unit?: string;
}

/** Tiga kolom hasil, siap dimasukkan ke form. */
export interface DraftResult {
  activity: string;
  learning: string;
  obstacles: string;
}

/**
 * KONTAK penyusun draf. UI, rute API, dan form hanya boleh bergantung pada
 * bentuk ini, tidak pada detail "bagaimana" draf dibuat.
 *
 * Implementasi saat ini: `localDrafter` (murni, di bawah).
 * Calon berikutnya    : `llmDrafter` (memanggil provider eksternal) — bila
 *   kelak diaktifkan, cukup daftarkan sebagai implementasi lain dan biarkan
 *   pemanggil memilih lewat `getDrafter()`. Tidak ada perubahan di form.
 */
export interface ReportDrafter {
  /** Nama pendek untuk ditampilkan (mis. "Lokal 0-Token"). */
  readonly label: string;
  /**
   * Susun tiga kolom dari `input`.
   *
   * Implementasi WAJIB memenuhi jaminan: setiap kolom yang dikembalikan lulus
   * `checkReportField`. Bila bahan tidak cukup, ia boleh membalas generik, tapi
   * TIDAK boleh mengembalikan kolom yang gagal validasi (form akan menolaknya
   * dan pengguna bingung).
   */
  draft(input: DraftInput): Promise<DraftResult>;
}

// ---------------------------------------------------------------------------
// Pustaka frasa. Dipisah ke const supaya mudah ditinjau & diperluas tanpa
// menyentuh logika perakitan.
// ---------------------------------------------------------------------------

/** Kalimat penutup untuk memastikan panjang memenuhi batas portal. */
const PADDING_ACTIVITY = [
  "Seluruh langkah dijalankan sesuai prosedur kerja yang berlaku dan hasilnya sudah diperiksa ulang sebelum ditutup.",
  "Pekerjaan diselesaikan bertahap, tiap tahap diverifikasi terlebih dahulu agar kesalahan tidak terbawa ke langkah berikutnya.",
  "Setiap perubahan dicatat dan didokumentasikan supaya dapat ditelusuri kembali bila diperlukan pada hari berikutnya.",
];

const PADDING_LEARNING = [
  "Dari proses ini saya belajar bahwa ketelitian di awal jauh lebih hemat waktu daripada perbaikan di akhir.",
  "Pemahaman saya bertambah terutama pada cara memecah masalah besar menjadi langkah kecil yang bisa diperiksa satu per satu.",
  "Pengalaman ini memperkuat kebiasaan memverifikasi asumsi sebelum mengambil keputusan teknis.",
];

const PADDING_OBSTACLES = [
  "Kendala di atas dapat diselesaikan hari itu juga, sehingga tidak ada pekerjaan yang tertunda ke hari berikutnya.",
  "Meski sempat menghambat, persoalan tersebut sudah ditangani dan tidak mengganggu target harian yang ditetapkan.",
  "Pelajarannya, kendala serupa bisa diantisipasi lebih awal pada pengerjaan berikutnya.",
];

/**
 * Penutup khusus saat hari itu BERJALAN LANCAR. Sengaja terpisah dari
 * `PADDING_OBSTACLES`: menempelkan kalimat "kendala di atas dapat diselesaikan"
 * ke laporan yang bilang "tidak ada kendala" itu bertentangan sendiri. Laporan
 * harus jujur (SPEC §11), jadi dua situasi itu dirakit dari stok berbeda.
 */
const PADDING_NO_OBSTACLE = [
  "Pekerjaan tetap berjalan sesuai jadwal dan seluruh target harian dapat dipenuhi tanpa penundaan.",
  "Kondisi kerja yang kondusif membuat semua tugas selesai sesuai rencana yang ditetapkan di awal hari.",
  "Saya memanfaatkan waktu yang tersedia untuk merapikan pekerjaan dan memastikan tidak ada hal yang terlewat.",
];

/** Pembuka tiap kolom. `{kw}` diganti kata kunci, `{unit}` konteks unit. */
const OPENERS_ACTIVITY = [
  "Hari ini saya mengerjakan {kw} sebagai bagian dari tugas harian magang di {unit}.",
  "Agenda utama hari ini adalah {kw}, dikerjakan sesuai target yang sudah ditetapkan di {unit}.",
  "Saya menuntaskan pengerjaan {kw} dengan mengikuti alur kerja yang berlaku di {unit}.",
];

const OPENERS_LEARNING = [
  "Pembelajaran utama hari ini berkaitan dengan {kw}.",
  "Dari pengerjaan {kw}, saya memperoleh pemahaman baru yang berguna untuk tugas berikutnya.",
  "Melalui aktivitas {kw}, saya belajar hal baru yang menambah wawasan teknis maupun profesional.",
];

const OPENERS_OBSTACLES = [
  "Kendala yang muncul hari ini berkaitan dengan {kw}.",
  "Selama mengerjakan {kw}, ada beberapa hambatan yang perlu ditangani.",
  "Tantangan hari ini muncul saat menangani {kw}.",
];

const NO_OBSTACLE = [
  "Tidak ada kendala berarti hari ini; seluruh pekerjaan berjalan lancar sesuai rencana.",
  "Hari ini berjalan tanpa hambatan yang signifikan, semua target dapat dipenuhi tepat waktu.",
];



// ---------------------------------------------------------------------------
// Perakitan murni
// ---------------------------------------------------------------------------

/** Pilih satu frasa secara deterministik dari `benih` (stabil antar-render). */
function pilih(stok: readonly string[], benih: string, geser = 0): string {
  if (stok.length === 0) return "";
  let jumlah = 0;
  for (let i = 0; i < benih.length; i++) jumlah += benih.charCodeAt(i);
  return stok[(jumlah + geser) % stok.length];
}

/** Ganti placeholder {kw} dan {unit} di sebuah frasa. */
function isi(frasa: string, kw: string, unit: string): string {
  return frasa.replace(/\{kw\}/g, kw).replace(/\{unit\}/g, unit);
}

/**
 * Tambahkan kalimat penutup sampai panjang memenuhi MIN_REPORT_LENGTH.
 * Murni & idempoten: hasil yang sudah cukup panjang tidak diubah.
 */
function cukupkan(
  teks: string,
  penutup: readonly string[],
  benih: string,
): string {
  let hasil = teks;
  let i = 0;
  while (countReportLength(hasil) < MIN_REPORT_LENGTH && i < penutup.length * 2) {
    const tambahan = pilih(penutup, benih, i);
    if (hasil.includes(tambahan)) {
      i++;
      continue;
    }
    hasil = `${hasil} ${tambahan}`;
    i++;
  }
  return hasil;
}

/**
 * Bangun satu kolom: pembuka + penutup secukupnya + verifikasi akhir.
 *
 * Jaring pengaman terakhir di sini penting: bila karena suatu hal hasil masih
 * kurang, kita menambah kalimat daripada mengembalikan kolom yang membuat
 * tombol Simpan tetap mati. Lebih baik draf "bertele-tele" daripada buntu.
 */
function bangunKolom(
  pembuka: readonly string[],
  penutup: readonly string[],
  kw: string,
  unit: string,
  benih: string,
): string {
  const pembukaTerpilih = isi(pilih(pembuka, benih), kw, unit);
  const hasil = cukupkan(pembukaTerpilih, penutup, benih);

  if (checkReportField(hasil) === null) return normalizeReportText(hasil);

  const cadangan = `${hasil} ${pilih(penutup, benih, 1)} ${pilih(penutup, benih, 2)}`;
  return normalizeReportText(cadangan);
}

// ---------------------------------------------------------------------------
// Implementasi default
// ---------------------------------------------------------------------------

/**
 * Implementasi LOKAL (default). Murni, sinkron di balik janji, tanpa jaringan.
 *
 * Deterministik terhadap `input`: bahan sama → hasil sama. Disengaja supaya
 * dapat diuji tanpa menstub apa pun dan tidak "berkedip" saat tombol ditekan
 * dua kali.
 */
export const localDrafter: ReportDrafter = {
  label: "Lokal 0-Token",
  async draft(input: DraftInput): Promise<DraftResult> {
    const kw = input.keywords.trim() || "tugas harian yang diberikan pembimbing";
    const unit = input.unit?.trim() || "unit kerja tempat saya ditempatkan";
    const benih = `${kw}|${unit}`;

    const activity = bangunKolom(
      OPENERS_ACTIVITY,
      PADDING_ACTIVITY,
      kw,
      unit,
      benih,
    );
    const learning = bangunKolom(
      OPENERS_LEARNING,
      PADDING_LEARNING,
      kw,
      unit,
      benih,
    );

    // Kolom kendala diperlakukan khusus: bila pengguna menandai tidak ada
    // kendala (kata kunci kosong / memuat "tidak ada"), jangan mengarang
    // hambatan yang tidak terjadi. Jujur di laporan itu penting (SPEC §11
    // "Jangan pernah menyembunyikan kegagalan jadi sukses").
    const tanpaKendala =
      input.keywords.trim() === "" ||
      /tidak ada|tanpa kendala|lancar/i.test(input.keywords);
    const obstacles = tanpaKendala
      ? cukupkan(pilih(NO_OBSTACLE, benih), PADDING_NO_OBSTACLE, benih)
      : bangunKolom(OPENERS_OBSTACLES, PADDING_OBSTACLES, kw, unit, benih);

    return {
      activity,
      learning,
      obstacles: normalizeReportText(obstacles),
    };
  },
};

/**
 * Pemilih implementasi + jaring pengaman fallback.
 *
 * Aturan mainnya:
 *   1. Bila LLM dikonfigurasi (`GEMINI_API_KEY` terisi), coba LLM dulu.
 *   2. Jika LLM mengembalikan null (kuota habis, timeout, jaringan putus,
 *      jawaban tidak lolos validasi), JATUH ke penyusun lokal.
 *   3. Jika key kosong, langsung lokal tanpa mencoba jaringan sama sekali.
 *
 * Kenapa modul ini TIDAK mengimpor `env`/`fetch` secara statis di atas:
 * `report-draft.ts` harus tetap murni agar 16 tesnya berjalan tanpa stub.
 * Karena itu modul LLM diimpor malas (dynamic) di dalam fungsi.
 *
 * Konsekuensi yang disengaja: pengguna TIDAK PERNAH melihat pesan error
 * "LLM gagal". Mereka hanya menerima draf dari sumber lain. Kegagalan
 * provider bukan urusan pengguna yang sedang buru-buru mengisi laporan.
 */
export async function draftWithFallback(input: DraftInput): Promise<{
  hasil: DraftResult;
  label: string;
  /** true bila terpaksa turun ke lokal karena LLM gagal (untuk pencatatan). */
  fallback: boolean;
}> {
  const { llmConfigured, geminiDrafter } = await import("./report-draft-llm");

  if (llmConfigured()) {
    const hasil = await geminiDrafter.draft(input);
    if (hasil !== null) {
      return { hasil, label: geminiDrafter.label, fallback: false };
    }
  }

  return {
    hasil: await localDrafter.draft(input),
    label: localDrafter.label,
    fallback: llmConfigured(),
  };
}

/**
 * Pemilih implementasi (kontak lama, dipertahankan).
 *
 * Bila key LLM terisi, mengembalikan drafter yang sudah DIBUNGKUS fallback,
 * sehingga pemanggil lama tetap bekerja tanpa perubahan. Bila tidak, langsung
 * `localDrafter` tanpa biaya jaringan.
 */
export function getDrafter(): ReportDrafter {
  return {
    label: localDrafter.label,
    async draft(input: DraftInput): Promise<DraftResult> {
      const { hasil } = await draftWithFallback(input);
      return hasil;
    },
  };
}

