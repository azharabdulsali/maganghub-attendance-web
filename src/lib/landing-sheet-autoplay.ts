// src/lib/landing-sheet-autoplay.ts: aturan "lembar berganti sendiri" di hero.
//
// Kenapa MURNI & terpisah dari komponen: auto-rotate punya LIMA pagar yang
// masing-masing bisa gagal tanpa terlihat di layar. Kalau salah satunya bocor,
// akibatnya bukan tampilan jelek melainkan pengguna yang kehilangan kendali:
// teks berganti saat ia sedang membaca, saat ia sedang menyeret, atau saat
// sistemnya sudah minta animasi dikurangi. Tidak ada cara memeriksa itu lewat
// mata, jadi aturannya dipisah ke sini dan diuji dengan nilai tetap.
//
// Dipakai HANYA oleh `src/components/landing-report-sheet.tsx`.

/**
 * Jeda antar pergantian otomatis (ms).
 *
 * 6 detik dipilih dari dua sisi: cukup lama untuk membaca tiga kolom pendek
 * (sekitar 40 kata), cukup cepat agar pengunjung yang hanya lewat tetap
 * melihat bahwa ada tiga lembar. Jangan turunkan di bawah 5 detik — di bawah
 * itu teks berganti sebelum selesai dibaca, dan `prefers-reduced-motion`
 * bukan satu-satunya orang yang akan terganggu.
 */
export const INTERVAL_OTOMATIS_MS = 6000;

/** Semua keadaan yang boleh menghentikan pergantian otomatis. */
export type KeadaanOtomatis = {
  /** Jumlah lembar contoh yang tersedia. */
  jumlahLembar: number;
  /** Pengguna meminta animasi dikurangi (`prefers-reduced-motion`). */
  kurangiGerak: boolean;
  /** Pengguna sudah menyentuh/memfokuskan lembar: berhenti, tidak menyalakan sendiri lagi. */
  sudahDisentuh: boolean;
  /** Jari/mouse sedang menyeret lembar. */
  sedangGeser: boolean;
  /** Tab sedang tidak terlihat (`document.visibilityState === "hidden"`). */
  tabTersembunyi: boolean;
};

/**
 * Bolehkah timer auto-rotate dijalankan? MURNI.
 *
 * Semua pagar bersifat MENOLAK: satu saja bernilai `true` (atau jumlah lembar
 * kurang dari dua) berarti tidak ada pergantian otomatis. Urutannya sengaja
 * dari yang paling murah ke yang paling mahal, tetapi hasilnya tidak bergantung
 * pada urutan — ini daftar larangan, bukan daftar prioritas.
 */
export function bolehJalanOtomatis(keadaan: KeadaanOtomatis): boolean {
  if (keadaan.jumlahLembar < 2) return false;
  if (keadaan.kurangiGerak) return false;
  if (keadaan.sudahDisentuh) return false;
  if (keadaan.sedangGeser) return false;
  if (keadaan.tabTersembunyi) return false;
  return true;
}
